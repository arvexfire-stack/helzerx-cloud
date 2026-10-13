# HelzerX Cloud Order API

Separate backend service for the HelzerX Cloud ordering workflow. The existing React/Vite website is not modified by this backend work.

## Current implementation status

- Stage 1 foundation: configuration validation, security headers, CORS allowlist, request IDs, rate limiting, health/readiness/status routes, PostgreSQL schema.
- Stage 2 initial slice: transactional order creation, server-owned plan pricing, request-key idempotency, random public order reference, one-time high-entropy Discord claim code (only its SHA-256 hash is stored), 30-minute expiry, and audit event.
- Authenticated API endpoints now support one-time Discord claim consumption and ticket-channel linking.
- Discord bot/ticket creation is scaffolded separately; staff-only workflow, payment verification UI, Gemini support, and Proxmox provisioning are **not implemented yet**.
- Ordering defaults to disabled. Do not enable it until plan catalogue, database migration, Discord invite URL, API deployment, bot claim endpoint and full integration tests have been completed.

## Requirements

- Node.js 22+
- PostgreSQL 14+ with `pgcrypto` available for migration 001
- TLS reverse proxy and firewall rules exposing only intended HTTPS routes

## Local development

```bash
cd api
npm install
cp .env.example .env
# Set local-only values in .env; never commit secrets.
npm test
npm start
```

Default bind: `127.0.0.1:3100`.

## Routes

- `GET /healthz` — process health.
- `GET /readyz` — database readiness.
- `GET /api/v1/status` — feature status, no secret values.
- `POST /api/v1/orders` — creates an order only when `ORDERING_ENABLED=true`.

### Create an order

Request body (send a fresh UUID as `requestKey` for each new checkout attempt):

```json
{
  "planId": "HXC-V08",
  "requestKey": "9c8d3c6b-1e2a-4f3d-8c7b-123456789abc"
}
```

The API chooses price/specifications from `api/src/plans.js`; it ignores client-supplied prices. A successful first request returns an order reference and a one-time claim code. Save the claim code immediately. Only its SHA-256 hash is stored, so the plaintext cannot be recovered. Replaying the same request key returns the existing order without exposing the claim code again.

**Important:** the bot requires a real Discord application, verified guild/category/staff-role IDs, and the same strong `DISCORD_SERVICE_TOKEN` in API and bot environment files. Do not enable public orders until these are configured and tested.

## Discord bot setup (staging first)\n\nThe bot source is in `discord-bot/`. Configure a dedicated bot application and invite it only to the intended HelzerX guild with View Channels, Send Messages, Read Message History, and Manage Channels permissions. Set `DISCORD_SERVICE_TOKEN` to the same long random secret in both the API and bot environment files. Set the category and staff-role IDs only after confirming them in Discord. Keep the API bound to loopback and the bot calling it over localhost; do not expose internal routes publicly.\n\nApply migrations in order: `001_initial.sql`, then `002_discord_claim_nullable_user.sql`. Run `npm install` and `npm test` in `api/`, then `npm install` in `discord-bot/`. Register the command with `npm run register` and start the bot with `npm start`. Do not enable ordering until an end-to-end staging test confirms claim expiry, duplicate claims, permission overwrites, staff access, and recovery if Discord channel creation fails.\n\n## Database and production safety

1. Reconcile every plan and price against approved live inventory before accepting orders.
2. Apply `migrations/001_initial.sql` through a controlled migration process. The migration role may need permission to install `pgcrypto`; the runtime role must not be a superuser or schema owner.
3. Keep database backups and test restoration before collecting customer data.
4. Run the service as a dedicated unprivileged Linux account; bind to loopback behind a TLS reverse proxy.
5. Store environment variables in a root-owned file outside the repository (for example `/etc/helzerx-cloud-api.env`) with restrictive permissions.
6. Keep `ORDERING_ENABLED=false` until the official invite is set, the Discord bot can securely consume claim codes, tests pass, and a monitored production deployment is ready.
7. Never trigger payment approval or Proxmox actions from a public request. Those require authenticated staff approval and a separately secured idempotent worker.

## Security notes

The in-memory rate limiter is a baseline for one process, not distributed abuse protection. Add a shared limiter such as Redis before horizontal scaling. CORS is not authentication. Configure proxy trust only for a known reverse-proxy topology. The claim token is high entropy and hashed at rest; rate limits, expiry and single-use enforcement must also be applied in the bot claim stage. Never put secrets in frontend code or GitHub.
