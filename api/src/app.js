import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPlan } from './plans.js';

const createOrderSchema = z.object({
  planId: z.string().regex(/^HXC-V(?:02|04|06|08|12|16|24|32|48|64)$/),
  requestKey: z.string().uuid()
}).strict();

function createRateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'rate_limited', requestId: req.requestId });
    }
    next();
  };
}

export function createApp({ config, db, logger }) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' }
  }));
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.corsOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
    } else if (origin) {
      return res.status(403).json({ error: 'origin_not_allowed', requestId: req.requestId });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '8kb', strict: true, type: 'application/json' }));
  app.use(createRateLimiter());

  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/readyz', async (req, res, next) => {
    try {
      await db.ready();
      res.json({ status: 'ready' });
    } catch (err) { next(err); }
  });
  app.get('/api/v1/status', (_req, res) => res.json({
    service: 'helzerx-cloud-order-api',
    orderingEnabled: config.orderingEnabled,
    integrations: { discord: false, gemini: false, payments: 'manual-not-configured', proxmox: false }
  }));
  app.post('/api/v1/orders', async (req, res, next) => {
    if (!config.orderingEnabled) {
      return res.status(503).json({ error: 'ordering_not_enabled', message: 'Online ordering is not enabled yet.', requestId: req.requestId });
    }
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_order_request', requestId: req.requestId });
    const plan = getPlan(parsed.data.planId);
    if (!plan) return res.status(400).json({ error: 'unknown_plan', requestId: req.requestId });
    // Stage 1 intentionally has no customer identity/claim workflow yet.
    // Do not accept real orders until Stage 2 implements identity verification,
    // transactional persistence, abuse protection and Discord ticket linking.
    return res.status(503).json({ error: 'order_workflow_not_implemented', requestId: req.requestId });
  });

  app.use((req, res) => res.status(404).json({ error: 'not_found', requestId: req.requestId }));
  app.use((err, req, res, _next) => {
    logger.error('request_failed', { requestId: req.requestId, method: req.method, path: req.path, errorName: err?.name });
    if (res.headersSent) return;
    res.status(err?.type === 'entity.too.large' ? 413 : 500).json({
      error: err?.type === 'entity.too.large' ? 'payload_too_large' : 'internal_error',
      requestId: req.requestId
    });
  });
  return app;
}