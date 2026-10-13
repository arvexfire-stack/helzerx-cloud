# HelzerX Cloud Order Automation — Secure Implementation Plan

Status: planning baseline only. No production ordering, Discord bot, Gemini integration, payment workflow, or Proxmox provisioning is active from this document alone.

## Agreed product decisions

- Customers start from a VPS plan's **Buy now** button.
- Customer joins the HelzerX Cloud Discord server and opens/claims a private ticket. The bot must not create a ticket for a Discord user it cannot reliably associate with the website order.
- Gemini provides customer support, order summaries, FAQ answers, and staff handoff.
- Payment is manually verified by an authorised staff member in the first release.
- Proxmox provisioning is a later gated stage and must only run after staff marks payment as verified and the backend independently confirms capacity and order eligibility.
- Keep existing marketing UI unchanged except for a future minimal, explicit Buy now flow connection. Do not change unrelated styles, sections, or pages.

## Target architecture

1. **Existing React/Vite site** — renders the selected plan and starts an order through a same-origin HTTPS API. It never stores API tokens or trusts client-submitted prices.
2. **Backend API** — validates plan IDs against server-owned configuration, creates opaque order IDs, enforces rate limits, validates inputs, tracks order state, and emits audit events.
3. **PostgreSQL** — source of truth for orders, Discord user/ticket mappings, staff actions, payment verification, provisioning jobs, and audit records.
4. **Discord bot** — handles ticket creation, private channel permissions, staff commands, and status updates. Bot token remains server-side with only required permissions.
5. **Gemini adapter** — receives only the minimum context needed for support, uses server-side secret storage, restricts tool calls to an explicit allowlist, and hands off uncertain or sensitive cases to staff.
6. **Proxmox provisioning worker** — isolated from the public API; uses a dedicated least-privilege Proxmox identity, validates an allowlisted template/OS, resource quotas and node/storage/network selections, and runs idempotent jobs.
7. **Manual payment review** — staff-only action with actor, timestamp, evidence reference and reason. Never treat an uploaded screenshot or AI statement as proof of payment.

## Order lifecycle

`draft → awaiting_discord → ticket_open → awaiting_staff_review → awaiting_payment → payment_review → paid_verified → provisioning_queued → provisioning → active`

Exceptional states: `needs_customer_info`, `staff_handoff`, `cancelled`, `payment_rejected`, `provisioning_failed`, `refunded`.

State transitions must be validated server-side. The browser, Discord user, and Gemini must not be able to directly set `paid_verified`, `provisioning`, or `active`. Staff verification must be authenticated, authorised, audited, and idempotent.

## Staged delivery

### Stage 0 — Plan and threat model (this commit)
- Record architecture, lifecycle, safety controls, deployment prerequisites, and acceptance criteria.
- No production credentials, secrets, or infrastructure actions are added.

### Stage 1 — Backend foundation
- Add a separate Node.js API service; keep Vite frontend separate.
- Add schema migrations, PostgreSQL, health/readiness endpoints, request IDs, structured redacted logs, input validation, rate limits, secure headers, CORS allowlist, and CSRF protection if cookie sessions are used.
- Add `.env.example` containing placeholders only, never real secrets.
- Add automated unit/integration tests and CI build checks.
- Deploy initially with ordering disabled until secrets and database are configured.

### Stage 2 — Order records and Discord ticket workflow
- Use a server-side allowlist for plans and prices. Treat values sent by the browser as untrusted.
- Create an order with a random public reference and expiry; do not expose sequential database IDs.
- Provide an explicit Discord invite/open-ticket path and an order reference customers can provide in the ticket. A signed, short-lived, single-use claim code may link the order to the Discord user; store only a hash of the code.
- Bot creates a private ticket after validating the claim and applies explicit customer/staff/bot permissions. Prevent duplicate tickets and repeated claims.
- Include plan specs and monthly estimate in an order embed, marked as pending confirmation where values are not verified live.
- Add staff-only status commands and audit events.

### Stage 3 — Gemini support and handoff
- Keep the Gemini API key on the backend only.
- Ground answers in approved product/FAQ documents and the server-owned order record; label unconfirmed availability and prices as unconfirmed.
- Treat customer messages and attachments as untrusted data, not instructions. Do not pass secrets, internal prompts, unrelated customer data, or raw infrastructure credentials to the model.
- No arbitrary code execution or unrestricted tool access. Use fixed tools with schema validation and permission checks.
- Hand off payment disputes, account/security requests, refunds, uncertain answers, and provisioning failures to staff.
- Add message size limits, per-user rate limits, abuse controls, model error fallback, and redacted retention policy.

### Stage 4 — Manual payment verification
- Store payment status separately from order status.
- Require authorised staff role, reason, amount/currency match, and a provider/reference check where available.
- Record who approved/rejected, when, and why. Prevent double approval and duplicate provisioning using idempotency keys.
- Do not collect card numbers, passwords, or unnecessary financial/personal information in Discord tickets.

### Stage 5 — Proxmox provisioning (disabled until verified)
- Use a dedicated Proxmox API identity with the minimum permissions on only the required pool/resources; never use root credentials.
- Keep Proxmox endpoint/token in a secret manager or protected environment file outside GitHub. Require TLS verification and restrict network access to the API.
- Maintain an explicit plan-to-resource mapping on the server; never accept VMID, node, template, bridge, storage, CPU flags, or arbitrary shell input from customers.
- Check capacity/quotas before scheduling; allocate unique IDs; enforce CPU/RAM/disk/network bounds; use allowlisted templates; avoid exposing host/admin credentials.
- Use a durable job queue, idempotent job keys, timeout/retry limits, reconciliation for partial failures, and staff alerts. Provisioning worker must refuse any order not in `paid_verified`.
- Return credentials through a separate one-time secure delivery flow; never post root passwords or API tokens into public channels or application logs.

### Stage 6 — Staging, security review, and gradual launch
- Test with a Discord test server and Proxmox test pool/template before live infrastructure.
- Test unauthorised staff commands, forged payment callbacks, replayed claim codes, duplicate webhook/job delivery, prompt injection, ticket permission leakage, rate limits, secret leakage, backup restore, and failed/partial VM creation.
- Use staging secrets and a non-production Proxmox pool first. Keep provisioning feature-flagged off until all acceptance criteria pass.
- Roll out to a small number of manually reviewed orders, monitor failures, and keep a documented rollback procedure.

## Minimum data model

- `orders`: internal UUID, public reference, plan key, server-calculated price/currency, customer contact/link status, lifecycle state, timestamps.
- `discord_links`: order ID, Discord user ID, hashed one-time claim token, expiry, consumed timestamp.
- `tickets`: order ID, guild/channel IDs, state, created/closed timestamps.
- `payment_reviews`: order ID, status, amount/currency, evidence reference, reviewer ID, reason, reviewed timestamp.
- `provisioning_jobs`: order ID, idempotency key, job state, safe provider resource reference, attempts, failure code, timestamps.
- `audit_events`: actor type/ID, action, target ID, timestamp, request ID, redacted metadata. Never store secrets or full payment credentials.

Use foreign keys, constraints, transactions for state transitions, and indexes on order reference, state, and job idempotency key. Apply retention and deletion rules to personal data.

## Required secret/configuration placeholders

- `DATABASE_URL`
- `APP_BASE_URL`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `DISCORD_TICKET_CATEGORY_ID`
- `DISCORD_STAFF_ROLE_ID`
- `GEMINI_API_KEY`
- `PROXMOX_API_URL`
- `PROXMOX_TOKEN_ID`
- `PROXMOX_TOKEN_SECRET`
- `ORDER_CLAIM_HMAC_SECRET`
- `SESSION_SECRET` (only if cookie sessions are used)

Use deployment secrets or a root-owned environment file outside the repository. Never commit actual values, request them in chat, or expose them in frontend build variables.

## Acceptance criteria before production

- Existing website builds and its unrelated visual sections remain unchanged.
- Prices/specs are always derived from server-side plan configuration.
- One order can only be claimed by one Discord user and cannot create duplicate tickets or jobs.
- Ticket permissions are verified with customer, unrelated member, staff, and bot test accounts.
- Only authorised staff can approve payment; every change is auditable.
- Gemini cannot approve payment, grant permissions, reveal secrets, or invoke arbitrary infrastructure actions.
- Proxmox worker refuses unpaid/invalid orders and uses bounded, allowlisted resource settings.
- Secrets are absent from Git history, browser bundles, Discord messages, and logs.
- Automated tests, staging deployment, backup/restore check, and manual security review pass.

## Current implementation boundary

The repository currently contains a React/Vite marketing frontend and no confirmed backend API service in the inspected root package configuration. This first commit intentionally adds the plan only. Do not claim that tickets, Gemini, payments, or Proxmox provisioning work until their services are implemented, configured, tested, and deployed.
