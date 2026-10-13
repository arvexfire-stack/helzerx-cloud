import express from 'express';
import helmet from 'helmet';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
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

  const internalServiceAuth = (req, res, next) => {
    const configured = config.discordServiceToken;
    const supplied = req.get('authorization') || '';
    const expected = configured ? `Bearer ${configured}` : '';
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (!configured || a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(configured ? 401 : 503).json({ error: configured ? 'unauthorized_service' : 'discord_integration_not_configured', requestId: req.requestId });
    }
    next();
  };

  const claimSchema = z.object({ code: z.string().min(32).max(128), discordUserId: z.string().regex(/^[0-9]{15,22}$/), guildId: z.string().regex(/^[0-9]{15,22}$/) }).strict();
  app.post('/api/v1/internal/discord/claim', internalServiceAuth, async (req, res, next) => {
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_claim_request', requestId: req.requestId });
    try {
      const claimHash = hashClaimCode(parsed.data.code);
      const result = await db.transaction(async client => {
        const claimed = await client.query(
          `UPDATE discord_links SET consumed_at = now(), discord_user_id = $2
           WHERE claim_token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
           RETURNING order_id`,
          [claimHash, parsed.data.discordUserId]
        );
        if (!claimed.rowCount) return null;
        const orderResult = await client.query(
          `UPDATE orders SET discord_user_id = $2, state = 'ticket_open', updated_at = now()
           WHERE id = $1 AND state = 'awaiting_discord' AND expires_at > now()
           RETURNING id, public_reference, plan_key, plan_snapshot, monthly_amount, currency`,
          [claimed.rows[0].order_id, parsed.data.discordUserId]
        );
        if (!orderResult.rowCount) throw new Error('CLAIM_ORDER_STATE_INVALID');
        const order = orderResult.rows[0];
        await client.query(
          `INSERT INTO tickets (order_id, guild_id, state) VALUES ($1, $2, 'pending')
           ON CONFLICT (order_id) DO NOTHING`,
          [order.id, parsed.data.guildId]
        );
        await client.query(
          `INSERT INTO audit_events (actor_type, actor_id, action, target_type, target_id, request_id, metadata)
           VALUES ('bot', $1, 'discord.claimed', 'order', $2, $3, $4::jsonb)`,
          [parsed.data.discordUserId, order.id, req.requestId, JSON.stringify({ guildId: parsed.data.guildId })]
        );
        return order;
      });
      if (!result) return res.status(404).json({ error: 'claim_invalid_expired_or_used', requestId: req.requestId });
      return res.status(200).json({
        order: {
          id: result.id,
          reference: result.public_reference,
          planId: result.plan_key,
          plan: result.plan_snapshot,
          monthlyAmount: result.monthly_amount,
          currency: result.currency
        },
        requestId: req.requestId
      });
    } catch (err) { next(err); }
  });

  const ticketChannelSchema = z.object({
    orderId: z.string().uuid(),
    guildId: z.string().regex(/^[0-9]{15,22}$/),
    channelId: z.string().regex(/^[0-9]{15,22}$/)
  }).strict();
  app.post('/api/v1/internal/discord/ticket-channel', internalServiceAuth, async (req, res, next) => {
    const parsed = ticketChannelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_ticket_channel', requestId: req.requestId });
    try {
      const result = await db.transaction(async client => {
        const updated = await client.query(
          `UPDATE tickets SET channel_id = $3, state = 'open'
           WHERE order_id = $1 AND guild_id = $2 AND state = 'pending'
           RETURNING order_id`,
          [parsed.data.orderId, parsed.data.guildId, parsed.data.channelId]
        );
        if (!updated.rowCount) return false;
        await client.query(
          `UPDATE orders SET state = 'ticket_open', updated_at = now() WHERE id = $1`,
          [parsed.data.orderId]
        );
        await client.query(
          `INSERT INTO audit_events (actor_type, action, target_type, target_id, request_id, metadata)
           VALUES ('bot', 'discord.ticket_created', 'order', $1, $2, $3::jsonb)`,
          [parsed.data.orderId, req.requestId, JSON.stringify({ guildId: parsed.data.guildId, channelId: parsed.data.channelId })]
        );
        return true;
      });
      if (!result) return res.status(409).json({ error: 'ticket_state_conflict', requestId: req.requestId });
      return res.status(200).json({ status: 'ticket_linked', requestId: req.requestId });
    } catch (err) { next(err); }
  });

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