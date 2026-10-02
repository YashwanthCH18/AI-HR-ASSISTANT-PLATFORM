function createPool(mysql, env = process.env) {
  if (env.DATABASE_URL) return mysql.createPool(env.DATABASE_URL);
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  for (const key of required) if (!env[key]) throw new Error(`${key} is required`);
  return mysql.createPool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true
  });
}

module.exports = { createPool };
