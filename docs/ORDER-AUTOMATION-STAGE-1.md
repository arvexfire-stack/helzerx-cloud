# Stage 1 — Backend Foundation

## Delivered in repository

- Isolated `api/` Node.js service; root frontend package and existing UI remain untouched.
- Validated environment configuration and fail-closed ordering feature flag.
- Helmet security headers, origin allowlist, bounded JSON body, request IDs, and basic process-local rate limiting.
- Health, database-readiness, and non-secret status endpoints.
- Server-owned VPS plan catalogue (prices/specs must be verified against approved commercial inventory before real orders).
- PostgreSQL initial schema for orders, Discord links, tickets, payment review, provisioning jobs, and audit events.
- Structured logs with common secret-key redaction.
- Initial configuration tests and setup documentation.

## Not yet delivered

Discord bot/ticket automation, single-use Discord claim flow, Gemini integration, staff authentication/authorisation, manual payment review endpoints, transactional order creation, shared rate limiting, Proxmox worker, deployment service unit, production secrets, and live VPS provisioning.

## Release gates

- Keep ordering disabled.
- Confirm real prices, resources, stock, terms, refunds, and service limits.
- Run `npm install` and `npm test` in `api/`; run a migration in staging; run a security review.
- Deploy the API as a separate service behind HTTPS without changing the frontend process.
- Continue with Stage 2 only after backend/database baseline is configured.
