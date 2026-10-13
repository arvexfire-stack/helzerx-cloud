import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool, closePool } from './db.js';

const migrationPath = fileURLToPath(new URL('../migrations/001_initial_schema.sql', import.meta.url));
const migrationSql = await readFile(migrationPath, 'utf8');
const pool = getPool();

try {
  const client = await pool.connect();
  try {
    await client.query(migrationSql);
    await client.query(
      'INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
      ['001_initial_schema']
    );
    console.log('Applied migration 001_initial_schema');
  } finally {
    client.release();
  }
} catch (error) {
  console.error(JSON.stringify({
    event: 'migration_failed',
    code: error.code ?? 'UNKNOWN',
    message: 'Database migration failed. Check database availability and schema permissions.'
  }));
  process.exitCode = 1;
} finally {
  await closePool();
}
