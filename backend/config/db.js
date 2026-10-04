const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Creates the tables if they do not exist yet.
 * Called once on server start.
 */
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id               SERIAL PRIMARY KEY,
      name             VARCHAR(150) NOT NULL,
      telegram_chat_id BIGINT NOT NULL UNIQUE,
      department       VARCHAR(100)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS overtime_records (
      id              SERIAL PRIMARY KEY,
      employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      ot_date         DATE NOT NULL,
      start_time      TIME NOT NULL,
      end_time        TIME NOT NULL,
      note            TEXT,
      status          VARCHAR(20) NOT NULL DEFAULT 'assigned',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ
    );
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_ot_employee_date ON overtime_records (employee_id, ot_date);`
  );

  console.log('Database ready');
}

module.exports = { pool, initDb };