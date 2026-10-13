# HelzerX Cloud API

This repository contains the API foundation, PostgreSQL schema, customer authentication routes, and a restricted Proxmox LXC adapter. The adapter is not exposed as a public HTTP endpoint.

## Requirements
- Node.js 20 or newer
- npm
- PostgreSQL 14 or newer

## Local checks
    cd backend
    cp .env.example .env
    npm install
    npm run check
    npm test

## Database
1. Create a dedicated PostgreSQL database and least-privilege application user.
2. Set DATABASE_URL in the private .env file.
3. Run npm run migrate.
4. Never commit .env or use production credentials in local development.

The initial schema covers customers/sessions, verification tokens, plans, orders, invoices, payments, gateway events, infrastructure inventory, service instances, provisioning jobs, renewal reminders, and audit events.

## Customer API
- GET /health
- GET /api/v1/plans
- POST /api/v1/auth/register — requires SMTP configuration; password minimum 12 characters; email verification required.
- POST /api/v1/auth/verify-email
- POST /api/v1/auth/login — creates an HttpOnly session cookie and a separate CSRF cookie.
- POST /api/v1/auth/logout
- GET /api/v1/auth/me
- GET /api/v1/services — returns only the signed-in customer's services.
- POST /api/v1/services/:serviceId/actions — start/stop/restart; requires session and X-CSRF-Token and checks service ownership.

Session tokens are stored hashed in PostgreSQL. Browser mutations use a CSRF token. Authentication routes require PostgreSQL. Registration remains disabled until SMTP is configured.

## Important implementation status
Service power requests currently create database jobs only. There is no worker consuming those jobs yet, so do not tell customers that start/stop/restart has actually happened. New orders, payment verification/callbacks, plan seeding, automated LXC provisioning, recurring invoices/reminders, and production frontend integration remain incomplete. Do not expose the service as a production hosting panel until these are implemented and tested.

## Proxmox LXC adapter
The src/proxmox-client.js module supports allowlisted CT creation, status lookup, and start/stop/restart requests. It requires HTTPS, a dedicated privilege-separated API token, and explicit allowlists for nodes, templates, storage, and bridge. Containers are created as unprivileged.

Before connecting a real node:
- Keep Proxmox on a private management network.
- Create a dedicated API identity/token with only required privileges.
- Set exact allowed resource IDs in deployment secrets.
- Validate template volume, storage, bridge, available capacity, and firewall rules on the actual node.
- Call the adapter only from a restricted worker after payment verification and a database ownership check.

Never put Proxmox credentials in browser code or commit them to Git.
