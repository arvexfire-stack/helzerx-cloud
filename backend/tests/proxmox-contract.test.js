import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/proxmox-client.js', import.meta.url), 'utf8');
test('Proxmox client requires HTTPS and explicit resource allowlists', () => {
  assert.match(source, /PROXMOX_API_URL must use HTTPS/);
  assert.match(source, /PROXMOX_ALLOWED_NODES/);
  assert.match(source, /PROXMOX_ALLOWED_TEMPLATES/);
  assert.match(source, /PROXMOX_ALLOWED_STORAGE/);
  assert.match(source, /PROXMOX_ALLOWED_BRIDGES/);
});
test('container creation enforces unprivileged mode and bounded resource values', () => {
  assert.match(source, /unprivileged: '1'/);
  assert.match(source, /Invalid CPU limit/);
  assert.match(source, /Invalid memory limit/);
  assert.match(source, /Invalid disk limit/);
});
test('power actions are allowlisted', () => {
  assert.match(source, /endpointByAction = \{ start: 'start', stop: 'stop', restart: 'reboot' \}/);
  assert.match(source, /Unsupported power action/);
});
