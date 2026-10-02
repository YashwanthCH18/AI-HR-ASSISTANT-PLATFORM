require('dotenv').config();
const mysql = require('mysql2/promise');
const { createPool } = require('../shared/db');

// Columns read or written by the services. Extra database columns are allowed.
const required = {
  Organizations: ['organization_id', 'org_name', 'subscription_plan', 'created_at'],
  Users: ['user_id', 'organization_id', 'first_name', 'last_name', 'email', 'password_hash', 'role', 'manager_id', 'date_of_joining', 'department', 'location'],
  AuthSessions: ['session_id', 'user_id', 'organization_id', 'token', 'expires_at', 'created_at', 'last_activity'],
  LeaveBalances: ['balance_id', 'organization_id', 'user_id', 'leave_type', 'total_allotted', 'leaves_taken', 'leaves_pending_approval', 'last_updated'],
  CompanyPolicies: ['policy_id', 'organization_id', 'policy_title', 'policy_category', 'policy_content', 'last_reviewed', 'keywords'],
  PayrollData: ['payroll_id', 'organization_id', 'user_id', 'base_salary', 'HRA', 'conveyance_allowance', 'medical_allowance', 'pf_deduction', 'esi_deduction', 'professional_tax', 'ctc'],
  LeaveRequests: ['request_id', 'organization_id', 'user_id', 'leave_type', 'start_date', 'end_date', 'days_requested', 'reason', 'status', 'created_at', 'decided_at', 'decided_by']
};

async function check() {
  const pool = createPool(mysql);
  try {
    const [rows] = await pool.execute('SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()');
    const present = new Map();
    for (const row of rows) {
      if (!present.has(row.TABLE_NAME)) present.set(row.TABLE_NAME, new Set());
      present.get(row.TABLE_NAME).add(row.COLUMN_NAME.toLowerCase());
    }
    const missing = {};
    for (const [table, columns] of Object.entries(required)) {
      const actual = present.get(table);
      if (!actual) missing[table] = '(table missing)';
      else {
        const absent = columns.filter(column => !actual.has(column.toLowerCase()));
        if (absent.length) missing[table] = absent;
      }
    }
    console.log(JSON.stringify({ compatibleColumns: Object.keys(missing).length === 0, missing }, null, 2));
    if (Object.keys(missing).length) process.exitCode = 1;
  } finally { await pool.end(); }
}

check().catch(error => {
  console.error(`Schema check failed: ${error.code || error.message}`);
  process.exitCode = 1;
});
