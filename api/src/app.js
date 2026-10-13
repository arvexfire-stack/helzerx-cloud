import express from 'express';
import helmet from 'helmet';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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

function makePublicReference() {
  return `HX-${randomBytes(5).toString('hex').toUpperCase()}`;
}

function makeClaimCode() {
  return randomBytes(32).toString('base64url');
}

function hashClaimCode(code) {
  return createHash('sha256').update(code, 'utf8').digest('hex');
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

    const claimCode = makeClaimCode();
    const claimHash = hashClaimCode(claimCode);
    const publicReference = makePublicReference();
    try {
      const result = await db.transaction(async client => {
        const existing = await client.query(
          'SELECT public_reference, plan_key, state, created_at FROM orders WHERE request_key = $1',
          [parsed.data.requestKey]
        );
        if (existing.rowCount) return { existing: existing.rows[0] };

        const inserted = await client.query(
          `INSERT INTO orders
            (public_reference, request_key, plan_key, plan_snapshot, currency, monthly_amount, state, expires_at)
           VALUES ($1, $2, $3, $4::jsonb, 'USD', $5, 'awaiting_discord', now() + interval '30 minutes')
           ON CONFLICT (request_key) DO NOTHING
           RETURNING id, public_reference, plan_key, state, created_at, expires_at`,
          [publicReference, parsed.data.requestKey, plan.name, JSON.stringify(plan), plan.monthlyUsd]
        );
        if (!inserted.rowCount) {
          const duplicate = await client.query(
            'SELECT public_reference, plan_key, state, created_at FROM orders WHERE request_key = $1',
            [parsed.data.requestKey]
          );
          return { existing: duplicate.rows[0] };
        }
        const order = inserted.rows[0];
        await client.query(
          'INSERT INTO discord_links (order_id, claim_token_hash, expires_at) VALUES ($1, $2, $3)',
          [order.id, claimHash, order.expires_at]
        );
        await client.query(
          `INSERT INTO audit_events
            (actor_type, action, target_type, target_id, request_id, metadata)
           VALUES ('customer', 'order.created', 'order', $1, $2, $3::jsonb)`,
          [order.id, req.requestId, JSON.stringify({ planKey: plan.name, source: 'public_api' })]
        );
        return { order };
      });

      if (result.existing) {
        return res.status(200).json({
          order: result.existing,
          claimCodeAvailable: false,
          message: 'This request key was already used. The one-time claim code is only shown when an order is first created; contact support if you lost it.',
          requestId: req.requestId
        });
      }
      return res.status(201).json({
        order: {
          reference: result.order.public_reference,
          planId: result.order.plan_key,
          status: result.order.state,
          createdAt: result.order.created_at,
          claimExpiresAt: result.order.expires_at
        },
        discord: {
          nextStep: 'Join the official HelzerX Discord server and use the /claim command once the Discord bot is available.',
          claimCommand: `/claim code:${claimCode}`,
          claimCode,
          expiresInSeconds: 1800
        },
        warning: 'Save this one-time code now. It cannot be retrieved later.',
        requestId: req.requestId
      });
    } catch (err) {
      next(err);
    }
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