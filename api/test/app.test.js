import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

function testConfig(orderingEnabled) {
  return {
    trustProxy: false,
    corsOrigins: new Set(['https://cloud.helzerx.cyou']),
    orderingEnabled
  };
}

test('order endpoint stays disabled unless explicitly enabled', async t => {
  const app = createApp({
    config: testConfig(false),
    db: { ready: async () => true },
    logger: { error() {} }
  });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planId: 'HXC-V08', requestKey: '9c8d3c6b-1e2a-4f3d-8c7b-123456789abc' })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'ordering_not_enabled');
});

test('order endpoint validates request payload before touching database', async t => {
  let transactionCalled = false;
  const app = createApp({
    config: testConfig(true),
    db: {
      transaction: async () => { transactionCalled = true; },
      ready: async () => true
    },
    logger: { error() {} }
  });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planId: 'HXC-V08', requestKey: 'not-a-uuid', price: 0 })
  });
  assert.equal(response.status, 400);
  assert.equal(transactionCalled, false);
});

test('internal Discord claim route rejects requests without service authentication', async t => {
  const app = createApp({
    config: { ...testConfig(false), discordServiceToken: 'test-only-secret' },
    db: { ready: async () => true, transaction: async () => { throw new Error('must not run'); } },
    logger: { error() {} }
  });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/internal/discord/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'x'.repeat(43), discordUserId: '12345678901234567', guildId: '12345678901234567' })
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'unauthorized_service');
});

test('status route reports ordering state without leaking configuration', async t => {
  const app = createApp({
    config: testConfig(false),
    db: { ready: async () => true },
    logger: { error() {} }
  });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/status`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.orderingEnabled, false);
  assert.equal(JSON.stringify(body).includes('DATABASE_URL'), false);
});
