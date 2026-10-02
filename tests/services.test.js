const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp: adminApp } = require('../services/admin/app');
const { createApp: employeeApp } = require('../services/employee/app');
const { createApp: voiceApp } = require('../services/voice/app');

const secret = 'test-secret';
const token = role => jwt.sign({ user_id: 'user-a', organization_id: 'org-a', role }, secret);

async function request(app, path, options = {}) {
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('admin queries are scoped to the organization and reject employee tokens', async () => {
  const calls = [];
  const pool = { execute: async (sql, params) => { calls.push({ sql, params }); return [[{ user_id: 'user-a' }]]; } };
  const app = adminApp({ pool, jwt, jwtSecret: secret });
  const denied = await request(app, '/api/users', { headers: { Authorization: `Bearer ${token('employee')}` } });
  assert.equal(denied.status, 403);
  const allowed = await request(app, '/api/users', { headers: { Authorization: `Bearer ${token('admin')}` } });
  assert.equal(allowed.status, 200);
  assert.deepEqual(calls[0].params, ['org-a']);
  assert.match(calls[0].sql, /organization_id = \?/);
});

test('employee payroll and text chat use only token identity', async () => {
  const calls = [];
  const pool = { execute: async (sql, params) => { calls.push({ sql, params }); return [[{ base_salary: 100 }]]; } };
  const app = employeeApp({ pool, jwt, jwtSecret: secret });
  const options = { headers: { Authorization: `Bearer ${token('employee')}` } };
  const payroll = await request(app, '/api/payroll?user_id=other', options);
  assert.equal(payroll.status, 200);
  const chat = await request(app, '/api/ai-query', {
    method: 'POST', headers: { ...options.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'What is my salary?', user_id: 'other', organization_id: 'other' })
  });
  assert.equal(chat.status, 200);
  assert.equal(chat.body.intent, 'payroll');
  assert.equal(calls.length, 2);
  for (const call of calls) assert.deepEqual(call.params, ['org-a', 'user-a']);
});

test('employee chat answers a personal leave question without generated SQL', async () => {
  const pool = { execute: async (sql, params) => [[{ leave_type: 'Casual Leave', total_allotted: 10, leaves_taken: 2, leaves_pending_approval: 1, available: 7 }]] };
  const app = employeeApp({ pool, jwt, jwtSecret: secret });
  const reply = await request(app, '/api/ai-query', {
    method: 'POST', headers: { Authorization: `Bearer ${token('employee')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'How many casual leaves do I have left?' })
  });
  assert.equal(reply.status, 200);
  assert.equal(reply.body.intent, 'leave');
  assert.match(reply.body.message, /7 Casual Leave/);
});

test('leave applications reserve balance in a transaction', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT total_allotted')) return [[{ total_allotted: 10, leaves_taken: 2, leaves_pending_approval: 1 }]];
      if (sql.startsWith('SELECT request_id')) return [[]];
      if (sql.startsWith('INSERT INTO LeaveRequests')) return [{ insertId: 17 }];
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release')
  };
  const app = employeeApp({ pool: { getConnection: async () => connection }, jwt, jwtSecret: secret });
  const response = await request(app, '/api/leave-apply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token('employee')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ leave_type: 'Casual Leave', start_date: '2026-10-05', end_date: '2026-10-06' })
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.days_requested, 2);
  assert.ok(calls.includes('commit'));
  assert.ok(!calls.includes('rollback'));
  assert.deepEqual(calls[1].params, ['org-a', 'user-a', 'Casual Leave']);
});

test('router forwards text and data routes to the correct backend', async () => {
  const admin = adminApp({ pool: { execute: async () => [[{ service: 'admin' }]] }, jwt, jwtSecret: secret }).listen(0);
  const employee = employeeApp({ pool: { execute: async () => [[{ service: 'employee' }]] }, jwt, jwtSecret: secret }).listen(0);
  await Promise.all([new Promise(resolve => admin.once('listening', resolve)), new Promise(resolve => employee.once('listening', resolve))]);
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = secret;
  process.env.DB_NAME = 'test';
  process.env.DB_USER = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.ADMIN_BACKEND_URL = `http://127.0.0.1:${admin.address().port}/api`;
  process.env.USER_BACKEND_URL = `http://127.0.0.1:${employee.address().port}/api`;
  const { AuthSession } = require('../services/router/src/models');
  AuthSession.findOne = async () => ({ update: async () => {} });
  const router = require('../services/router/src/server');
  try {
    const adminReply = await request(router, '/admin/users', { headers: { Authorization: `Bearer ${token('admin')}` } });
    assert.equal(adminReply.status, 200);
    assert.equal(adminReply.body.data[0].service, 'admin');
    const employeeReply = await request(router, '/user/profile', { headers: { Authorization: `Bearer ${token('employee')}` } });
    assert.equal(employeeReply.status, 200);
    assert.equal(employeeReply.body.data.service, 'employee');
    const adminChat = await request(router, '/admin/ai-query', {
      method: 'POST', headers: { Authorization: `Bearer ${token('admin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'List employees' })
    });
    assert.equal(adminChat.status, 200);
    assert.equal(adminChat.body.data[0].service, 'admin');
    const employeeChat = await request(router, '/user/ai-query', {
      method: 'POST', headers: { Authorization: `Bearer ${token('employee')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'What is my salary?' })
    });
    assert.equal(employeeChat.status, 200);
    assert.equal(employeeChat.body.data[0].service, 'employee');
    const blocked = await request(router, '/user/payroll', { headers: { Authorization: `Bearer ${token('admin')}` } });
    assert.equal(blocked.status, 403);
  } finally {
    await Promise.all([new Promise(resolve => admin.close(resolve)), new Promise(resolve => employee.close(resolve))]);
  }
});

test('voice sends the transcript through the role router and returns speech', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/speech-to-text')) return { ok: true, json: async () => ({ transcript: 'What is my salary?', language_code: 'en-IN' }) };
    if (url.endsWith('/user/ai-query')) return { ok: true, json: async () => ({ intent: 'payroll', message: 'Your salary is 100.', data: [] }) };
    return { ok: true, json: async () => ({ audios: ['d2F2'] }) };
  };
  const app = voiceApp({ jwt, jwtSecret: secret, sarvamKey: 'test-key', routerBaseUrl: 'http://router.test', fetchImpl: fakeFetch });
  const form = new FormData();
  form.append('audio', new Blob(['wave'], { type: 'audio/wav' }), 'speech.wav');
  const reply = await request(app, '/api/voice-query', { method: 'POST', headers: { Authorization: `Bearer ${token('employee')}` }, body: form });
  assert.equal(reply.status, 200);
  assert.equal(reply.body.transcript, 'What is my salary?');
  assert.equal(reply.body.audio.base64, 'd2F2');
  assert.equal(calls[1].url, 'http://router.test/user/ai-query');
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${token('employee')}`);
});
