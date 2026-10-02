const express = require('express');
const { authenticate, asyncRoute } = require('../../shared/auth');
const { classifyIntent, validPrompt } = require('../../shared/chat');

function calendarDays(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || new Date(first).toISOString().slice(0, 10) !== start || new Date(last).toISOString().slice(0, 10) !== end) return null;
  const days = Math.round((last - first) / 86400000) + 1;
  return days >= 1 && days <= 365 ? days : null;
}

function createApp({ pool, jwt, jwtSecret, model = null }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'employee' }));
  app.use('/api', authenticate(jwt, jwtSecret, ['employee', 'manager', 'user']));

  const profile = user => pool.execute(
    'SELECT user_id, first_name, last_name, email, role, manager_id, date_of_joining, department, location FROM Users WHERE organization_id = ? AND user_id = ?', [user.organizationId, user.id]);
  const balances = user => pool.execute(
    'SELECT leave_type, total_allotted, leaves_taken, leaves_pending_approval, (total_allotted - leaves_taken - leaves_pending_approval) AS available FROM LeaveBalances WHERE organization_id = ? AND user_id = ? ORDER BY leave_type', [user.organizationId, user.id]);
  const payroll = user => pool.execute(
    'SELECT base_salary, HRA, conveyance_allowance, medical_allowance, pf_deduction, esi_deduction, professional_tax, ctc FROM PayrollData WHERE organization_id = ? AND user_id = ?', [user.organizationId, user.id]);
  const policies = user => pool.execute(
    'SELECT policy_id, policy_title, policy_category, policy_content, last_reviewed FROM CompanyPolicies WHERE organization_id = ? ORDER BY policy_title', [user.organizationId]);
  const leaveRequests = user => pool.execute(
    'SELECT request_id, leave_type, start_date, end_date, days_requested, reason, status, created_at FROM LeaveRequests WHERE organization_id = ? AND user_id = ? ORDER BY created_at DESC', [user.organizationId, user.id]);

  app.get('/api/profile', asyncRoute(async (req, res) => res.json({ data: (await profile(req.user))[0][0] || null })));
  app.get('/api/leave-balance', asyncRoute(async (req, res) => res.json({ data: (await balances(req.user))[0] })));
  app.get('/api/payroll', asyncRoute(async (req, res) => res.json({ data: (await payroll(req.user))[0] })));
  app.get('/api/company-policies', asyncRoute(async (req, res) => res.json({ data: (await policies(req.user))[0] })));
  app.get('/api/leave-requests', asyncRoute(async (req, res) => res.json({ data: (await leaveRequests(req.user))[0] })));

  app.post('/api/leave-apply', asyncRoute(async (req, res) => {
    const { leave_type: type, start_date: start, end_date: end, reason } = req.body;
    const days = calendarDays(start, end);
    if (typeof type !== 'string' || !type.trim() || type.length > 50 || !days || (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000))) {
      return res.status(400).json({ error: 'Valid leave_type, start_date, end_date, and optional reason are required' });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT total_allotted, leaves_taken, leaves_pending_approval FROM LeaveBalances WHERE organization_id = ? AND user_id = ? AND leave_type = ? FOR UPDATE',
        [req.user.organizationId, req.user.id, type.trim()]);
      if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: 'Leave type not found' }); }
      const available = rows[0].total_allotted - rows[0].leaves_taken - rows[0].leaves_pending_approval;
      if (days > available) { await connection.rollback(); return res.status(409).json({ error: 'Insufficient leave balance' }); }
      const [overlap] = await connection.execute(
        "SELECT request_id FROM LeaveRequests WHERE organization_id = ? AND user_id = ? AND status IN ('pending', 'approved') AND start_date <= ? AND end_date >= ? LIMIT 1",
        [req.user.organizationId, req.user.id, end, start]);
      if (overlap.length) { await connection.rollback(); return res.status(409).json({ error: 'An overlapping leave request exists' }); }
      const [result] = await connection.execute(
        "INSERT INTO LeaveRequests (organization_id, user_id, leave_type, start_date, end_date, days_requested, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')",
        [req.user.organizationId, req.user.id, type.trim(), start, end, days, reason || null]);
      await connection.execute('UPDATE LeaveBalances SET leaves_pending_approval = leaves_pending_approval + ? WHERE organization_id = ? AND user_id = ? AND leave_type = ?',
        [days, req.user.organizationId, req.user.id, type.trim()]);
      await connection.commit();
      return res.status(201).json({ success: true, request_id: result.insertId, status: 'pending', days_requested: days });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }));

  app.post('/api/ai-query', asyncRoute(async (req, res) => {
    const { prompt } = req.body;
    if (!validPrompt(prompt)) return res.status(400).json({ error: 'prompt must be 1 to 1000 characters' });
    const intent = await classifyIntent(prompt, model);
    const handlers = { profile, leave: balances, payroll, policy: policies, leave_requests: leaveRequests };
    if (!handlers[intent]) return res.status(422).json({ error: 'Ask about your profile, leave, payroll, policies, or leave requests' });
    const [data] = await handlers[intent](req.user);
    let result = intent === 'profile' ? (data[0] || null) : data;
    let message = `Here is your ${intent.replace('_', ' ')} information.`;
    if (intent === 'leave') {
      const type = ['casual', 'sick', 'earned'].find(word => prompt.toLowerCase().includes(word));
      if (type) result = data.filter(row => row.leave_type.toLowerCase().includes(type));
      if (result.length === 1) {
        const row = result[0];
        const metric = /\b(taken|used)\b/i.test(prompt) ? ['taken', row.leaves_taken] :
          /\b(pending|approval)\b/i.test(prompt) ? ['pending approval', row.leaves_pending_approval] : ['available', row.available];
        message = `You have ${metric[1]} ${row.leave_type} day(s) ${metric[0]}.`;
      } else message = result.length ? 'Here are your leave balances.' : 'No matching leave balance was found.';
    } else if (intent === 'payroll') {
      const row = data[0];
      if (!row) message = 'No payroll record was found for your account.';
      else {
        const field = /\bctc\b/i.test(prompt) ? 'ctc' : /\bhra\b/i.test(prompt) ? 'HRA' :
          /\bpf\b/i.test(prompt) ? 'pf_deduction' : /\bprofessional tax\b/i.test(prompt) ? 'professional_tax' : 'base_salary';
        message = `Your ${field.replaceAll('_', ' ')} is ${row[field] ?? 'not recorded'}.`;
      }
    } else if (intent === 'profile') {
      if (!result) message = 'No profile was found for your account.';
      else if (/\bemail\b/i.test(prompt)) message = `Your email is ${result.email}.`;
      else if (/\b(employee id|user id)\b/i.test(prompt)) message = `Your employee ID is ${result.user_id}.`;
      else if (/\bdepartment\b/i.test(prompt)) message = `Your department is ${result.department || 'not recorded'}.`;
      else if (/\bmanager\b/i.test(prompt)) message = `Your manager ID is ${result.manager_id || 'not recorded'}.`;
    } else if (intent === 'policy') message = data.length ? 'Here are your organization policies.' : 'No company policies were found.';
    else if (intent === 'leave_requests') message = data.length ? `You have ${data.length} leave request(s).` : 'You have no leave requests.';
    return res.json({ intent, message, data: result });
  }));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'Employee service error' });
  });
  return app;
}

module.exports = { createApp, calendarDays };
