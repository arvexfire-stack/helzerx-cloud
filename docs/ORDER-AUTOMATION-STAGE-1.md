# Order Automation — Backend Progress

## Completed in GitHub

- Isolated Node.js API foundation, validated configuration, security headers, CORS allowlist, request IDs, bounded JSON bodies, basic rate limiting, health/readiness/status routes.
- PostgreSQL schema for orders, Discord claim links, private tickets, payment reviews, provisioning jobs, and audit events.
- Transactional order creation with server-side plan pricing, request-key idempotency, high-entropy one-time claim codes stored as hashes, and 30-minute expiry.
- Authenticated internal API endpoints for single-use claim consumption and ticket-channel linking.
- Separate Discord bot package with `/claim`, `/order-status`, `/payment-review`, and `/ticket-retry`; private ticket permission overwrites and staff-role checks.
- Authenticated staff API endpoints for order lookup, exact amount/currency payment review, reviewer/reason/evidence audit trail, and pending-ticket recovery queue.
- Follow-up migration makes Discord identity nullable before a customer claims the code.
- API route tests include ordering fail-closed behavior, request validation, status output, and unauthenticated internal-route rejection.

## Not yet production-ready

- The API and bot have not been installed or run in the live environment in this task; test results are not yet verified.
- Discord application token, service token, guild/category/staff role IDs, database, migration application, and service units still need secure configuration on the server.
- Plan pricing/resource catalogue must be reconciled with the actual inventory and commercial terms.
- The bot uses a basic shared bearer service secret; keep the API bound to loopback/private networking and protect the secret. Add rotation and stronger request signing if bot/API cross a network boundary.
- The staff workflow is committed but not yet run or integration-tested against a live Discord guild/database. `/ticket-retry` only handles pending, unlinked tickets; other failures need manual administrator review.
- Gemini support, secure Proxmox worker, retries/reconciliation beyond pending-ticket recovery, monitoring, backups, and disaster recovery remain future stages.

## Safe rollout gates

1. Keep `ORDERING_ENABLED=false`.
2. Configure API and bot secrets outside GitHub with restrictive file permissions.
3. Apply migrations 001 and 002 in order using a controlled migration role.
4. Install dependencies and run `npm test` in `api/`; install `discord-bot/` dependencies and register commands in a staging guild.
5. Test expired/used codes, unauthorized service calls, simultaneous duplicate claims, role/category permission overwrites, bot restart, and ticket creation failure.
6. Enable orders only after successful end-to-end staging and review of real plan inventory.
