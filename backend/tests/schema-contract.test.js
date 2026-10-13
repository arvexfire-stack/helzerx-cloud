import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../migrations/001_initial_schema.sql', import.meta.url), 'utf8');

test('schema includes core customer, billing, service and audit tables', () => {
  for (const table of [
    'users',
    'sessions',
    'plans',
    'orders',
    'invoices',
    'payments',
    'gateway_events',
    'infrastructure_nodes',
    'service_instances',
    'provisioning_jobs',
    'renewal_reminders',
    'audit_events'
  ]) {
    assert.match(schema, new RegExp('CREATE TABLE IF NOT EXISTS ' + table + '\\b', 'i'));
  }
});

test('schema has ownership, idempotency and provider transaction constraints', () => {
  assert.match(schema, /user_id UUID NOT NULL REFERENCES users\(id\)/i);
  assert.match(schema, /idempotency_key TEXT NOT NULL UNIQUE/i);
  assert.match(schema, /UNIQUE\(provider, provider_event_id\)/i);
  assert.match(schema, /payments_provider_tx_unique/i);
});

test('container service type is explicit and cannot be mislabeled as KVM by default', () => {
  assert.match(schema, /service_type TEXT NOT NULL DEFAULT 'lxc'/i);
  assert.match(schema, /CHECK \(service_type IN \('lxc', 'kvm'\)\)/i);
});
