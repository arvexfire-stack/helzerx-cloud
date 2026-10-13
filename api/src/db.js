import pg from 'pg';
const { Pool } = pg;

export function createDatabase(config) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000,
    application_name: 'helzerx-cloud-order-api'
  });
  pool.on('error', () => {
    // Do not log database errors that may include sensitive connection metadata.
    process.stderr.write(JSON.stringify({ level: 'error', event: 'database_idle_client_error' }) + '\\n');
  });
  return {
    query: (text, params) => pool.query(text, params),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await work(client);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
        throw error;
      } finally {
        client.release();
      }
    },
    async ready() { await pool.query('SELECT 1'); return true; },
    close: () => pool.end()
  };
}