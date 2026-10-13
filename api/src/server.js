import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createLogger } from './logger.js';
import { createApp } from './app.js';

let config;
try { config = loadConfig(); }
catch (error) {
  process.stderr.write(JSON.stringify({ level: 'error', event: 'configuration_invalid', message: error.message }) + '\n');
  process.exit(1);
}
const logger = createLogger(config.logLevel);
const db = createDatabase(config);
const app = createApp({ config, db, logger });
const server = app.listen(config.port, config.host, () => {
  logger.info('api_started', { host: config.host, port: config.port, orderingEnabled: config.orderingEnabled });
});
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info('shutdown_started', { signal });
  server.close(async () => {
    try { await db.close(); process.exit(0); }
    catch { process.exit(1); }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));