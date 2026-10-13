# HelzerX Cloud API

This repository contains the API foundation, database migration, and a restricted Proxmox LXC adapter module. The adapter is not exposed as a public HTTP endpoint and must only be called from an authenticated, ownership-checked worker.

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
1. Create a dedicated PostgreSQL database and least-privilege application user.
2. Put the local connection string in the .env file as DATABASE_URL.
3. Run npm run migrate.
4. Keep credentials out of Git and never reuse production credentials locally.

The schema covers customers/sessions, plans, orders, invoices, payments, gateway events, infrastructure inventory, service instances, provisioning jobs, renewal reminders, and audit events.

## Proxmox LXC adapter
The src/proxmox-client.js module supports allowlisted CT creation, status lookup, and start/stop/restart requests. It requires an HTTPS Proxmox API URL, a dedicated API token, and explicit allowlists for node, template, storage, and bridge. It always requests an unprivileged container.

Before connecting a real node:
- create a dedicated Proxmox identity and privilege-separated API token with only required permissions;
- keep Proxmox reachable only on a private management network;
- set exact allowed resource IDs in deployment secrets;
- validate the template volume path, storage and network bridge on the actual node;
- call the adapter only from a worker after verified payment and a database ownership check.

The adapter does not itself authenticate website customers, validate ownership, queue jobs, or trigger provisioning. Do not wire it directly to a public route.

## Current API
- GET /health
- GET /api/v1/plans

Customer authentication, production checkout, payment callbacks, customer service controls, and worker orchestration are not yet complete. Do not expose this service publicly or claim that CT provisioning is live until those controls and integration tests are in place.
