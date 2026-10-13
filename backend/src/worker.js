import { getPool, closePool } from './db.js';
import { createProxmoxClient } from './proxmox-client.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pool = getPool();
const proxmox = createProxmoxClient();
let stopping = false;

async function claimJob() {
  const result = await pool.query(
    "WITH next_job AS (SELECT id FROM provisioning_jobs WHERE status='queued' AND job_type IN ('start','stop','restart') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE provisioning_jobs j SET status='running',attempts=attempts+1,started_at=NOW(),last_error_code=NULL FROM next_job WHERE j.id=next_job.id RETURNING j.id,j.service_instance_id,j.job_type",
  );
  return result.rows[0] ?? null;
}

async function processJob(job) {
  const found = await pool.query(
    'SELECT s.id,s.user_id,s.status,s.proxmox_vmid,o.status AS order_status,n.name AS node_name,n.enabled AS node_enabled FROM service_instances s JOIN orders o ON o.id=s.order_id LEFT JOIN infrastructure_nodes n ON n.id=s.node_id WHERE s.id=$1',
    [job.service_instance_id]
  );
  if (!found.rowCount) throw Object.assign(new Error('Service missing'), { code: 'SERVICE_MISSING' });
  const service = found.rows[0];
  if (service.order_status !== 'active') throw Object.assign(new Error('Order not active'), { code: 'ORDER_NOT_ACTIVE' });
  if (!service.node_enabled || !service.node_name || !Number.isInteger(service.proxmox_vmid)) {
    throw Object.assign(new Error('Infrastructure mapping missing'), { code: 'INFRASTRUCTURE_NOT_READY' });
  }
  if (!['running','stopped'].includes(service.status)) throw Object.assign(new Error('Invalid service state'), { code: 'INVALID_SERVICE_STATE' });
  if (job.job_type === 'restart' && service.status !== 'running') throw Object.assign(new Error('Cannot restart a stopped service'), { code: 'INVALID_SERVICE_STATE' });

  const task = await proxmox.powerAction({ node: service.node_name, vmid: service.proxmox_vmid, action: job.job_type });
  await proxmox.waitForTask({ node: service.node_name, taskId: task.taskId });
  const current = await proxmox.status({ node: service.node_name, vmid: service.proxmox_vmid });
  const status = current && current.status;
  if (!['running','stopped'].includes(status)) throw Object.assign(new Error('Unexpected Proxmox status'), { code: 'UNEXPECTED_PROXMOX_STATUS' });
  await pool.query('UPDATE service_instances SET status=$1,updated_at=NOW() WHERE id=$2', [status, service.id]);
  await pool.query("UPDATE provisioning_jobs SET status='succeeded',finished_at=NOW() WHERE id=$1", [job.id]);
  await pool.query("INSERT INTO audit_events(actor_user_id,action,target_type,target_id,outcome,metadata) VALUES($1,$2,'service_instance',$3,'success',$4::jsonb)",
    [service.user_id, 'service.' + job.job_type + '.completed', service.id, JSON.stringify({ jobId: job.id })]);
}

async function run() {
  console.log(JSON.stringify({ event: 'worker_started', service: 'helzerx-cloud-proxmox-worker' }));
  while (!stopping) {
    try {
      const job = await claimJob();
      if (!job) { await delay(1500); continue; }
      try {
        await processJob(job);
      } catch (error) {
        const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'WORKER_ERROR';
        await pool.query("UPDATE provisioning_jobs SET status='failed',finished_at=NOW(),last_error_code=$2 WHERE id=$1", [job.id, code]);
        await pool.query("INSERT INTO audit_events(action,target_type,target_id,outcome,metadata) VALUES($1,'provisioning_job',$2,'failure',$3::jsonb)",
          ['job.' + job.job_type + '.failed', job.id, JSON.stringify({ code })]);
        console.error(JSON.stringify({ event: 'job_failed', jobId: job.id, code }));
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'worker_loop_error', code: error.code ?? 'UNKNOWN' }));
      await delay(3000);
    }
  }
}
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
try { await run(); } finally { await closePool(); }
