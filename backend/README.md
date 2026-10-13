# HelzerX Cloud API

This is the initial API foundation, not yet a production hosting control panel. Authentication, persistence, payment processing and Proxmox operations are deliberately not enabled until their security controls are implemented and tested.

## Requirements
- Node.js 20 or newer
- npm

## Run locally
    cd backend
    cp .env.example .env
    npm install
    npm run check
    npm run dev

The API binds to 127.0.0.1:4000 by default. Test:
- GET http://127.0.0.1:4000/health
- GET http://127.0.0.1:4000/api/v1/plans

## Important
- Do not put production secrets in .env.example or commit .env.
- This scaffold does not create containers, accept payments, or authenticate customers yet.
- Do not expose the API publicly before TLS, deployment configuration, authentication and integration tests are complete.
- The plan catalog is temporary and server-owned; it will move to PostgreSQL in the next phase.
