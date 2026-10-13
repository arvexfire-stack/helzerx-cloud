# HelzerX Cloud Order API (Stage 1)

This is a separate backend service; the existing React/Vite website is not modified by this stage.

## Current safety boundary

- Online ordering defaults to disabled (`ORDERING_ENABLED=false`).
- The order endpoint intentionally returns 503 even if the flag is turned on. Stage 2 must implement identity binding, transactional order persistence, and Discord linking before real orders are accepted.
- Discord, Gemini, payment review, and Proxmox integrations are not implemented in Stage 1.
- No real secrets belong in GitHub. Use a root-owned environment file or deployment secret manager.

## Requirements

- Node.js 22+
- PostgreSQL 14+ (enable pgcrypto extension for migration 001)
- A reverse proxy that exposes only the intended HTTPS API routes

## Local development

```bash
cd api
npm install
cp .env.example .env
# Edit .env with local-only values; do not commit it.
npm test
npm start
```

The service listens on `127.0.0.1:3100` by default. Routes:
- `GET /healthz` — process health
- `GET /readyz` — database readiness
- `GET /api/v1/status` — feature status (no secret/config values)
- `POST /api/v1/orders` — disabled/stub endpoint; does not create an order yet

## Initial database setup

Create a dedicated database and a dedicated least-privilege application role outside GitHub. Apply `migrations/001_initial.sql` using a controlled migration process. The runtime role should not have schema-owner or superuser privileges. Back up the database and test restore before storing customer data.

## Production requirements before deployment

1. Store environment variables in a root-owned file outside the repository (for example `/etc/helzerx-cloud-api.env`) with restrictive permissions.
2. Run as a dedicated unprivileged Linux account; bind to loopback behind a TLS reverse proxy.
3. Configure firewall restrictions, HTTPS, PostgreSQL network isolation, backup/restore, log rotation, monitoring and alerting.
4. Keep `ORDERING_ENABLED=false` until the entire order and Discord claim flow is implemented and security-tested.
5. Never enable Proxmox or payment actions based on this Stage 1 scaffold.

## Security notes

The in-memory rate limiter is a small baseline for one process, not distributed abuse protection. Use a shared limiter (e.g. Redis) behind multiple instances. Configure proxy trust only when the reverse proxy topology is understood. The CORS allowlist is not authentication. Add authenticated staff roles, CSRF protection for cookie-based sessions, account-link token hashing, transactional state transitions, and security tests in later stages.
