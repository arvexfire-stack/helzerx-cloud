# HelzerX Cloud Control Plane

## Goal
Build a customer panel that can request and manage LXC containers (CTs) on Proxmox VE through a restricted backend worker. The React frontend must never call Proxmox directly.

## Phases
1. Foundation: backend API, validated environment, secure headers, rate limits, structured logs, health endpoint, CI and API tests.
2. Identity and persistence: PostgreSQL migrations; users, roles, sessions, audit events; email verification, password reset, MFA for staff/admins.
3. Catalog and orders: server-authoritative plans, order state machine, customer ownership checks, admin review.
4. Payments: PayHere and OnePay adapters; hosted checkout; verified callbacks; amount/currency/order matching; idempotency and reconciliation. No live charging before merchant approval and sandbox tests.
5. Proxmox LXC worker: private network, restricted API token, node/CT inventory, capacity and IP checks, durable job queue, safe retries and provisioning status.
6. Customer CT controls: start, stop, restart, console via an approved mechanism, usage/status, reinstall with destructive-action confirmation.
7. Renewals: monthly invoices, reminders, manual reconciliation, grace period and documented suspension policy.
8. Operations: backups and restore drills, monitoring, abuse process, security testing, disaster recovery and staged release.

## Trust boundaries
- Browser to public API: HTTPS only; HttpOnly session cookies, Secure in production, appropriate SameSite policy, and CSRF protection for cookie-authenticated state changes.
- API to database: private network, least-privilege DB user, migrations and backups.
- API to queue to worker: typed validated jobs, durable state and idempotency keys.
- Worker to Proxmox: private management network; dedicated API token with only required privileges; no root password in application config.
- Gateway callbacks: verify provider-specific signature/hash and expected merchant, order, amount and currency; persist events and deduplicate retries.
- Secrets: secret manager/environment only. Never commit .env, tokens, passwords, gateway keys or production data.

## LXC versus KVM
This implementation starts with LXC containers (CTs), as requested. LXC is not a full KVM virtual machine; market it as container hosting and document kernel-sharing and privilege limitations. Do not label CT plans as KVM VPS. If KVM is required later, add a separate VM provider and distinct plan catalog.

## Required safeguards
- Fail closed if production origins or required secrets are missing.
- Never accept arbitrary Proxmox node names, VMIDs, storage IDs, templates or commands from the browser. Resolve them from server-owned allowlisted inventory.
- Check user ownership and role on every CT operation.
- Treat stop, destroy, reinstall and password reset as high-risk actions with confirmation, audit entries and rate limits.
- Provision only after verified payment or an explicitly admin-approved manual order.
- Never suspend a service for pending or unverified payment.
- Use idempotent jobs and reconciliation to avoid duplicate CT creation after timeouts.
- Never expose Proxmox API responses, credentials or raw internal errors to customers.

## Initial API
- GET /health: liveness only; no secrets or infrastructure details.
- GET /api/v1/plans: published server-owned plans.
- Future authenticated endpoints must be versioned and enforce ownership.

## Deployment checklist
1. Separate staging host and database.
2. HTTPS at a trusted reverse proxy.
3. Set NODE_ENV=production and a specific HTTPS FRONTEND_ORIGIN; store secrets outside Git.
4. Restrict backend ingress and Proxmox management access.
5. Run dependency audit, tests, restore test and security checks.
6. Enable payments only after merchant approval, policy review, sandbox verification and end-to-end tests.
