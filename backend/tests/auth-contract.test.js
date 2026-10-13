import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../src/auth.js', import.meta.url), 'utf8');
test('auth routes use hashed session tokens, expiring sessions, and CSRF checks', () => {
  assert.match(auth, /token_hash/);
  assert.match(auth, /csrf_token_hash/);
  assert.match(auth, /expires_at>NOW\(\)/);
  assert.match(auth, /CSRF_VALIDATION_FAILED/);
});
test('service list and action query are scoped to the authenticated customer', () => {
  assert.match(auth, /WHERE s\.user_id=\$1/);
  assert.match(auth, /WHERE s\.id=\$1 AND s\.user_id=\$2/);
});
test('customer actions only queue the fixed safe power-action set', () => {
  assert.match(auth, /enum:\['start','stop','restart'\]/);
  assert.match(auth, /INSERT INTO provisioning_jobs/);
  assert.doesNotMatch(auth, /createProxmoxClient/);
});
