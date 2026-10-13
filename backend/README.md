# HelzerX Cloud API

This is the API and database foundation. Authentication, payment processing, and Proxmox operations are not enabled until their security controls are implemented and tested.

## Requirements
- Node.js 20 or newer
- npm
- PostgreSQL 14 or newer

## Run local checks
    cd backend
    cp .env.example .env
    npm install
    npm run check
    npm test

## Database migration
1. Create a dedicated local PostgreSQL database and least-privilege application user.
2. Put the local connection string in `.env` as `DATABASE_URL`.
3. Run `npm run migrate`.
4. Keep database credentials out of Git and never reuse production credentials locally.

The initial migration defines customers and sessions, plans, orders, invoices, payments, gateway events, Proxmox node inventory, service instances, provisioning jobs, renewal reminders, and audit events.

## API
Run `npm run dev`. The API binds to 127.0.0.1:4000 by default.
- `GET /health`
- `GET /api/v1/plans`

## Important
- Do not put production secrets in `.env.example` or commit `.env`.
- The current API does not yet authenticate customers, accept payments, or create/manage Proxmox CTs.
- Do not expose it publicly before TLS, authentication, deployment configuration, and integration tests are complete.
- The plan catalog is still temporary and will be migrated to PostgreSQL-backed records in a later step.
