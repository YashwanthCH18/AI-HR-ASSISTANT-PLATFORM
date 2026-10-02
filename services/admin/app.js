const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const { authenticate, asyncRoute } = require('../../shared/auth');
const { classifyIntent, validPrompt } = require('../../shared/chat');

function createApp({ pool, jwt, jwtSecret, model = null }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'admin' }));
  app.use('/api', authenticate(jwt, jwtSecret, ['admin']));

  const users = org => pool.execute(
    'SELECT user_id, organization_id, first_name, last_name, email, role, department, location, date_of_joining FROM Users WHERE organization_id = ? ORDER BY last_name, first_name', [org]);
  const balances = org => pool.execute(
    'SELECT b.balance_id, b.user_id, u.first_name, u.last_name, u.department, b.leave_type, b.total_allotted, b.leaves_taken, b.leaves_pending_approval FROM LeaveBalances b JOIN Users u ON u.user_id = b.user_id AND u.organization_id = b.organization_id WHERE b.organization_id = ? ORDER BY u.last_name, b.leave_type', [org]);
  const payroll = org => pool.execute(
    'SELECT p.*, u.first_name, u.last_name, u.department FROM PayrollData p JOIN Users u ON u.user_id = p.user_id AND u.organization_id = p.organization_id WHERE p.organization_id = ? ORDER BY u.last_name', [org]);
  const policies = org => pool.execute(
    'SELECT policy_id, policy_title, policy_category, policy_content, last_reviewed, keywords FROM CompanyPolicies WHERE organization_id = ? ORDER BY policy_title', [org]);
  const leaveRequests = org => pool.execute(
    'SELECT request_id, user_id, leave_type, start_date, end_date, days_requested, reason, status, created_at FROM LeaveRequests WHERE organization_id = ? ORDER BY created_at DESC', [org]);

  app.get('/api/users', asyncRoute(async (req, res) => res.json({ data: (await users(req.user.organizationId))[0] })));
  app.post('/api/users', asyncRoute(async (req, res) => {
    const { email, password, first_name: firstName, last_name: lastName, role, department, location } = req.body;
    const normalizedRole = String(role || 'employee').toLowerCase();
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 12 ||
        typeof firstName !== 'string' || !firstName.trim() || typeof lastName !== 'string' || !lastName.trim() ||
        !['employee', 'manager'].includes(normalizedRole)) {
      return res.status(400).json({ error: 'Valid email, password (12+ characters), names, and employee/manager role are required' });
    }
    const id = randomUUID();
    const hash = await bcrypt.hash(password, 12);
    try {
      await pool.execute('INSERT INTO Users (user_id, organization_id, first_name, last_name, email, password_hash, role, date_of_joining, department, location) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?, ?)',
        [id, req.user.organizationId, firstName.trim(), lastName.trim(), email.trim().toLowerCase(), hash, normalizedRole, department || null, location || null]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
      throw error;
    }
    return res.status(201).json({ user_id: id, role: normalizedRole });
  }));
  app.get('/api/leave-balances', asyncRoute(async (req, res) => res.json({ data: (await balances(req.user.organizationId))[0] })));
  app.get('/api/payroll', asyncRoute(async (req, res) => res.json({ data: (await payroll(req.user.organizationId))[0] })));
  app.get('/api/company-policies', asyncRoute(async (req, res) => res.json({ data: (await policies(req.user.organizationId))[0] })));
  app.get('/api/leave-requests', asyncRoute(async (req, res) => res.json({ data: (await leaveRequests(req.user.organizationId))[0] })));

  app.post('/api/leave-balances', asyncRoute(async (req, res) => {
    const { user_id: userId, leave_type: type, total_allotted: total } = req.body;
    if (typeof userId !== 'string' || !userId || typeof type !== 'string' || !type.trim() || type.length > 50 || !Number.isSafeInteger(total) || total < 0) {
      return res.status(400).json({ error: 'Valid user_id, leave_type, and nonnegative total_allotted are required' });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [userRows] = await connection.execute('SELECT user_id FROM Users WHERE organization_id = ? AND user_id = ?', [req.user.organizationId, userId]);
      if (!userRows.length) { await connection.rollback(); return res.status(404).json({ error: 'User not found' }); }
      const [existing] = await connection.execute('SELECT leaves_taken, leaves_pending_approval FROM LeaveBalances WHERE organization_id = ? AND user_id = ? AND leave_type = ? FOR UPDATE', [req.user.organizationId, userId, type.trim()]);
      if (existing.length && total < existing[0].leaves_taken + existing[0].leaves_pending_approval) {
        await connection.rollback(); return res.status(409).json({ error: 'Total is below used and pending leave' });
      }
      await connection.execute('INSERT INTO LeaveBalances (organization_id, user_id, leave_type, total_allotted) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE total_allotted = VALUES(total_allotted), last_updated = CURRENT_TIMESTAMP',
        [req.user.organizationId, userId, type.trim(), total]);
      await connection.commit();
      return res.json({ success: true });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }));

  app.put('/api/payroll/:userId', asyncRoute(async (req, res) => {
    const fields = ['base_salary', 'HRA', 'conveyance_allowance', 'medical_allowance', 'pf_deduction', 'esi_deduction', 'professional_tax', 'ctc'];
    if (['base_salary', 'ctc'].some(key => typeof req.body[key] !== 'number') ||
        fields.some(key => req.body[key] !== undefined && (!Number.isFinite(req.body[key]) || req.body[key] < 0))) {
      return res.status(400).json({ error: 'Valid nonnegative base_salary and ctc are required' });
    }
    const [usersFound] = await pool.execute('SELECT user_id FROM Users WHERE organization_id = ? AND user_id = ?', [req.user.organizationId, req.params.userId]);
    if (!usersFound.length) return res.status(404).json({ error: 'User not found' });
    const values = fields.map(key => req.body[key] ?? null);
    await pool.execute(`INSERT INTO PayrollData (organization_id, user_id, ${fields.join(', ')}) VALUES (?, ?, ${fields.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${fields.map(key => `${key} = VALUES(${key})`).join(', ')}`,
      [req.user.organizationId, req.params.userId, ...values]);
    return res.json({ success: true });
  }));

  app.post('/api/company-policy', asyncRoute(async (req, res) => {
    const { policy_id: id, policy_title: title, policy_category: category, policy_content: content, keywords } = req.body;
    if (typeof title !== 'string' || !title.trim() || typeof content !== 'string' || !content.trim() || title.length > 255 || content.length > 20000) {
      return res.status(400).json({ error: 'Valid policy_title and policy_content are required' });
    }
    const org = req.user.organizationId;
    if (id !== undefined) {
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) return res.status(400).json({ error: 'Invalid policy_id' });
      const [result] = await pool.execute(
        'UPDATE CompanyPolicies SET policy_title = ?, policy_category = ?, policy_content = ?, keywords = ?, last_reviewed = CURRENT_DATE WHERE policy_id = ? AND organization_id = ?',
        [title.trim(), category || null, content.trim(), keywords || null, Number(id), org]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Policy not found' });
      return res.json({ success: true, policy_id: Number(id) });
    }
    const [result] = await pool.execute(
      'INSERT INTO CompanyPolicies (organization_id, policy_title, policy_category, policy_content, keywords, last_reviewed) VALUES (?, ?, ?, ?, ?, CURRENT_DATE)',
      [org, title.trim(), category || null, content.trim(), keywords || null]);
    return res.status(201).json({ success: true, policy_id: result.insertId });
  }));

  app.patch('/api/leave-requests/:id', asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body.status;
    if (!Number.isSafeInteger(id) || id <= 0 || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Valid request ID and status are required' });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT * FROM LeaveRequests WHERE request_id = ? AND organization_id = ? FOR UPDATE', [id, req.user.organizationId]);
      const request = rows[0];
      if (!request) { await connection.rollback(); return res.status(404).json({ error: 'Leave request not found' }); }
      if (request.status !== 'pending') { await connection.rollback(); return res.status(409).json({ error: 'Leave request already decided' }); }
      const taken = status === 'approved' ? request.days_requested : 0;
      await connection.execute('UPDATE LeaveBalances SET leaves_pending_approval = leaves_pending_approval - ?, leaves_taken = leaves_taken + ? WHERE organization_id = ? AND user_id = ? AND leave_type = ?',
        [request.days_requested, taken, request.organization_id, request.user_id, request.leave_type]);
      await connection.execute('UPDATE LeaveRequests SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ? WHERE request_id = ? AND organization_id = ?', [status, req.user.id, id, req.user.organizationId]);
      await connection.commit();
      return res.json({ success: true, status });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }));

  app.post('/api/ai-query', asyncRoute(async (req, res) => {
    const { prompt } = req.body;
    if (!validPrompt(prompt)) return res.status(400).json({ error: 'prompt must be 1 to 1000 characters' });
    const intent = await classifyIntent(prompt, model);
    const handlers = { profile: users, users, leave: balances, payroll, policy: policies, leave_requests: leaveRequests };
    if (!handlers[intent]) return res.status(422).json({ error: 'Ask about employees, leave, payroll, policies, or leave requests' });
    const [rows] = await handlers[intent](req.user.organizationId);
    let data = rows;
    if (['profile', 'users', 'leave', 'payroll'].includes(intent)) {
      const departments = [...new Set(rows.map(row => row.department).filter(Boolean))];
      const department = departments.find(value => prompt.toLowerCase().includes(value.toLowerCase()));
      if (department) data = data.filter(row => row.department === department);
    }
    let message = `Found ${data.length} ${intent.replace('_', ' ')} record(s) in your organization.`;
    if (intent === 'leave') {
      const type = ['casual', 'sick', 'earned'].find(word => prompt.toLowerCase().includes(word));
      if (type) data = data.filter(row => row.leave_type.toLowerCase().includes(type));
      const available = data.reduce((sum, row) => sum + Number(row.total_allotted - row.leaves_taken - row.leaves_pending_approval), 0);
      message = `Found ${data.length} leave balance(s), with ${available} day(s) available in total.`;
    } else if (intent === 'payroll') {
      const total = data.reduce((sum, row) => sum + Number(row.ctc || 0), 0);
      message = `Found ${data.length} payroll record(s), with total CTC ${total}.`;
    }
    return res.json({ intent, message, data });
  }));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'Admin service error' });
  });
  return app;
}

module.exports = { createApp };
