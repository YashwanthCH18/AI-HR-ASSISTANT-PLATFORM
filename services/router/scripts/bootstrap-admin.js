require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');

async function main() {
  const { ORG_ID, ORG_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, DB_HOST, DB_USER, DB_NAME } = process.env;
  if (![ORG_ID, ORG_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, DB_HOST, DB_USER, DB_NAME].every(Boolean)) {
    throw new Error('Set ORG_ID, ORG_NAME, ADMIN_EMAIL, ADMIN_PASSWORD and router DB_* values first');
  }
  if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  const db = await mysql.createConnection({
    host: DB_HOST, port: Number(process.env.DB_PORT || 3306), user: DB_USER,
    password: process.env.DB_PASSWORD || '', database: DB_NAME
  });
  try {
    await db.beginTransaction();
    await db.execute('INSERT INTO Organizations (organization_id, org_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE org_name = VALUES(org_name)', [ORG_ID, ORG_NAME]);
    const [existing] = await db.execute('SELECT user_id FROM Users WHERE email = ? LIMIT 1', [ADMIN_EMAIL]);
    if (existing.length) throw new Error('Admin email already exists; bootstrap did not modify the account');
    const id = randomUUID();
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db.execute('INSERT INTO Users (user_id, organization_id, first_name, last_name, email, password_hash, role, date_of_joining) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)',
      [id, ORG_ID, 'Initial', 'Admin', ADMIN_EMAIL, hash, 'Admin']);
    await db.commit();
    console.log(`Created organization ${ORG_ID} and admin ${ADMIN_EMAIL}`);
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
