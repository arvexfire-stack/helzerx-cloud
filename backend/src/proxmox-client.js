const env = process.env;

function required(name) {
  const value = env[name];
  if (!value || !value.trim()) throw new Error(name + ' is required');
  return value.trim();
}
function list(name) {
  return required(name).split(',').map((value) => value.trim()).filter(Boolean);
}
function safeSegment(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(value)) throw new Error('Invalid ' + label);
  return value;
}

export function createProxmoxClient() {
  const baseUrl = required('PROXMOX_API_URL').replace(/\/$/, '');
  const tokenId = required('PROXMOX_API_TOKEN_ID');
  const tokenSecret = required('PROXMOX_API_TOKEN_SECRET');
  const allowedNodes = list('PROXMOX_ALLOWED_NODES');
  const allowedTemplates = list('PROXMOX_ALLOWED_TEMPLATES');
  const allowedStorage = list('PROXMOX_ALLOWED_STORAGE');
  const allowedBridges = list('PROXMOX_ALLOWED_BRIDGES');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('PROXMOX_API_URL must use HTTPS');
  if (!/^[^!;=]+![^;=]+$/.test(tokenId)) throw new Error('PROXMOX_API_TOKEN_ID must be user@realm!token-id');

  async function request(method, path, body) {
    const response = await fetch(baseUrl + '/api2/json' + path, {
      method,
      headers: {
        Authorization: 'PVEAPIToken=' + tokenId + '=' + tokenSecret,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
      },
      body: body ? new URLSearchParams(body).toString() : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('Proxmox API request failed with HTTP ' + response.status);
      error.code = 'PROXMOX_API_ERROR';
      throw error;
    }
    return payload.data;
  }

  return {
    async createContainer({ node, vmid, hostname, cores, memoryMb, swapMb, diskGb, template, storage, bridge, password }) {
      node = safeSegment(node, 'node'); template = safeSegment(template, 'template');
      storage = safeSegment(storage, 'storage'); bridge = safeSegment(bridge, 'bridge');
      if (!allowedNodes.includes(node) || !allowedTemplates.includes(template) || !allowedStorage.includes(storage) || !allowedBridges.includes(bridge)) {
        throw new Error('Requested Proxmox resource is not in the administrator allowlist');
      }
      if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) throw new Error('Invalid container ID');
      if (!Number.isInteger(cores) || cores < 1 || cores > 32) throw new Error('Invalid CPU limit');
      if (!Number.isInteger(memoryMb) || memoryMb < 256 || memoryMb > 262144) throw new Error('Invalid memory limit');
      if (!Number.isInteger(swapMb) || swapMb < 0 || swapMb > 262144) throw new Error('Invalid swap limit');
      if (!Number.isInteger(diskGb) || diskGb < 4 || diskGb > 2048) throw new Error('Invalid disk limit');
      if (typeof hostname !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname)) throw new Error('Invalid hostname');
      if (typeof password !== 'string' || password.length < 16 || password.length > 128) throw new Error('A generated container password is required');
      const result = await request('POST', '/nodes/' + encodeURIComponent(node) + '/lxc', {
        vmid: String(vmid), hostname, ostemplate: template, storage,
        rootfs: storage + ':' + String(diskGb), cores: String(cores), memory: String(memoryMb), swap: String(swapMb),
        net0: 'name=eth0,bridge=' + bridge + ',ip=dhcp', password,
        unprivileged: '1', onboot: '1', start: '0', protection: '1'
      });
      return { taskId: result, vmid, node };
    },
    async powerAction({ node, vmid, action }) {
      node = safeSegment(node, 'node');
      if (!allowedNodes.includes(node)) throw new Error('Node is not in the administrator allowlist');
      if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) throw new Error('Invalid container ID');
      const endpointByAction = { start: 'start', stop: 'stop', restart: 'reboot' };
      const endpoint = endpointByAction[action];
      if (!endpoint) throw new Error('Unsupported power action');
      const result = await request('POST', '/nodes/' + encodeURIComponent(node) + '/lxc/' + vmid + '/status/' + endpoint);
      return { taskId: result, vmid, node, action };
    },
    async status({ node, vmid }) {
      node = safeSegment(node, 'node');
      if (!allowedNodes.includes(node)) throw new Error('Node is not in the administrator allowlist');
      if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) throw new Error('Invalid container ID');
      return request('GET', '/nodes/' + encodeURIComponent(node) + '/lxc/' + vmid + '/status/current');
    }
  };
}
