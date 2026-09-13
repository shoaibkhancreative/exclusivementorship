# Exclusive Mentorship

A video-gated trading mentorship platform. Students sign in with email OTP or Google, work through a locked/sequential lesson curriculum hosted on Bunny Stream, and unlock the full course via a crypto (NOWPayments) checkout. Includes a full admin panel for managing lessons, students, site content, and a support inbox.

Built as a single Cloudflare Worker (Hono API) serving a React SPA, backed by Cloudflare D1 (SQLite) and KV.

## Tech stack

- **Frontend:** React 18 + React Router 7, Tailwind CSS, Vite
- **Backend:** Cloudflare Workers, Hono
- **Database:** Cloudflare D1
- **Cache:** Cloudflare KV
- **Video:** Bunny Stream (signed embed URLs)
- **Payments:** NOWPayments (crypto)
- **Auth:** Email OTP (Resend) + Google Sign-In
- **Testing:** Vitest + Testing Library
- **Language:** TypeScript throughout

## Prerequisites

- Node.js 20+
- A Cloudflare account with Wrangler CLI access (`npx wrangler login`)
- Accounts/API keys for: Resend, NOWPayments, Bunny Stream, Cloudflare Turnstile, Google OAuth (optional)

## Getting started

```bash
npm install

# Copy env template and fill in real values
cp .env.example .env

# Create the D1 database, then paste the returned database_id into wrangler.jsonc
npm run db:create

# Apply schema migrations
npm run db:migrate:local

# (Optional) load sample lesson content
npm run db:seed:local

# Create your first admin user
npm run admin:create:local

# Run the app locally (builds client + starts the Worker)
npm run dev
```

The app will be available at the URL Wrangler prints (typically `http://localhost:8787`).

## Environment variables

See `.env.example` for the full list. Locally, values come from `.env`; in production, non-secret values live in `wrangler.jsonc` → `vars`, and secrets are set with:

```bash
npx wrangler secret put SECRET_NAME
```

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Build the client and run the Worker locally |
| `npm run dev:client` | Vite dev server only (frontend, no Worker) |
| `npm run build` | Production client build |
| `npm run typecheck` | Type-check worker, client, and test code |
| `npm run lint` / `lint:fix` | Lint (and auto-fix) the codebase |
| `npm run format` / `format:check` | Prettier formatting |
| `npm test` / `test:client` / `test:all` | Run worker tests, client tests, or both |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |
| `npm run db:seed:local` / `:remote` | Load `seed/seed.sql` |
| `npm run admin:create:local` / `:remote` | Create an admin user |

## Project structure

```
src/
  client/     React SPA (public site + /admin dashboard)
  worker/     Hono API, auth, business logic, D1 access
migrations/   D1 schema migrations, applied in order
seed/         Sample lesson content
tests/        Worker-side test suite (Vitest)
scripts/      One-off admin/dev scripts
```

## Deployment

```bash
npm run deploy
```

This builds the client and deploys the Worker (with static assets) via Wrangler. Cron triggers (scheduled cleanup, abandoned-checkout reminders) are only registered on deploy — confirm they're active with `npx wrangler triggers` or the Cloudflare dashboard after your first deploy.