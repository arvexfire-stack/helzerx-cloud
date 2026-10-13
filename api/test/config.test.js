import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const base = {
  NODE_ENV: 'test',
  APP_BASE_URL: 'https://cloud.helzerx.cyou',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
  CORS_ORIGINS: 'https://cloud.helzerx.cyou'
};

test('ordering is disabled unless explicitly enabled', () => {
  assert.equal(loadConfig(base).orderingEnabled, false);
});
test('rejects malformed database configuration', () => {
  assert.throws(() => loadConfig({ ...base, DATABASE_URL: '' }), /Invalid API configuration/);
});
test('parses explicit CORS allowlist', () => {
  const config = loadConfig({ ...base, CORS_ORIGINS: 'https://cloud.helzerx.cyou,https://www.helzerx.cyou' });
  assert.equal(config.corsOrigins.has('https://cloud.helzerx.cyou'), true);
  assert.equal(config.corsOrigins.has('https://evil.example'), false);
});
