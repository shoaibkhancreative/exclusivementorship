# Exclusive Mentorship — Next Level Trader

A focused, single-product mentorship platform: five free lessons, an automatic
premium gate, a $39 USDT crypto enrollment via NOWPayments, and access
delivered through a private Telegram channel and group. Built to run entirely
on Cloudflare's Free plan.

---

## Table of contents

- [Project overview](#project-overview)
- [Architecture](#architecture)
- [Folder structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [D1 database setup](#d1-database-setup)
- [Database migrations](#database-migrations)
- [Seed data](#seed-data)
- [Resend setup](#resend-setup)
- [Cloudflare setup](#cloudflare-setup)
- [Turnstile setup](#turnstile-setup)
- [NOWPayments setup](#nowpayments-setup)
- [Telegram bot setup](#telegram-bot-setup)
- [Domain setup](#domain-setup)
- [Production deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Common errors](#common-errors)
- [How to replace lesson videos](#how-to-replace-lesson-videos)
- [How to replace lesson titles](#how-to-replace-lesson-titles)
- [How to replace thumbnails](#how-to-replace-thumbnails)
- [How to change price](#how-to-change-price)
- [How to change the PDF](#how-to-change-the-pdf)
- [How to change Telegram destination](#how-to-change-telegram-destination)
- [How to add more lessons later](#how-to-add-more-lessons-later)
- [How to upgrade Cloudflare plan later](#how-to-upgrade-cloudflare-plan-later)

---

## Project overview

**Flow:** Visitor → intro → Free Class 1 → assignment → … → Free Class 5 →
assignment → Premium Gate (PDF + pricing) → NOWPayments checkout → webhook
confirms payment → Telegram channel + group invite links → all further
mentorship happens in Telegram.

There is exactly one product ($39 USDT, reference value $100 USDT — "61%
OFF"). No admin dashboard, no assignment file storage, no premium video
hosting on the site — those are explicit v1 non-goals (see
[Architecture](#architecture)).

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React + React Router + Tailwind CSS, built with Vite |
| Backend | [Hono](https://hono.dev) running on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Email (OTP) | [Resend](https://resend.com) |
| Payments | [NOWPayments](https://nowpayments.io) (non-hosted "payment" API — custom in-site checkout popup, no NOWPayments branding shown) |
| Community delivery | Telegram Bot API (one-time invite links) |
| Bot protection | Cloudflare Turnstile |
| Hosting | A single Cloudflare Worker, serving both the API and the built SPA via [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) |

**Why one Worker for everything?** Cloudflare's newer "assets" binding lets a
single Worker serve a static SPA *and* handle `/api/*` routes, with automatic
SPA fallback for client-side routing. This avoids the complexity (and cost)
of a separate Pages project or a Next.js edge-runtime adapter, while staying
100% within the Free plan.

**Explicit non-goals in v1** (see the build spec for the reasoning):
- No admin dashboard — content is edited via `seed/seed.sql` / the database directly.
- No assignment file storage (no R2) — "submit assignment" only records that
  the action happened; it never stores the file.
- No premium video hosting on the site — premium delivery is 100% via
  Telegram once enrolled.

## Folder structure

```
exclusive-mentorship/
├── migrations/             # D1 schema migrations (wrangler d1 migrations apply)
│   └── 0001_init.sql
├── seed/
│   └── seed.sql            # Lesson content — the ONE place to edit lessons
├── src/
│   ├── worker/              # Backend (Cloudflare Worker / Hono)
│   │   ├── index.ts          # App entry: mounts routes, serves static assets
│   │   ├── auth.ts           # OTP issuance/verification, sessions
│   │   ├── db.ts             # D1 helpers (users, rate limiting, audit log)
│   │   ├── lib/
│   │   │   ├── config.ts      # Env type + business constants (FREE_LESSON_COUNT, etc.)
│   │   │   ├── crypto.ts       # Web Crypto helpers (hashing, tokens, OTP generation)
│   │   │   └── course.ts       # Pure lesson-access/progression logic (unit tested)
│   │   ├── middleware/
│   │   │   ├── session.ts      # Session resolution + requireAuth/requirePaid guards
│   │   │   └── security.ts     # CSP/security headers, CORS
│   │   ├── routes/
│   │   │   ├── auth.ts          # /api/auth/*
│   │   │   ├── lessons.ts       # /api/lessons/*
│   │   │   ├── payments.ts      # /api/payments/*
│   │   │   ├── webhooks.ts      # /api/webhooks/nowpayments
│   │   │   ├── telegram.ts      # /api/telegram/*
│   │   │   └── config.ts        # /api/config/public
│   │   └── services/
│   │       ├── email.ts          # Resend
│   │       ├── nowpayments.ts     # Non-hosted payment creation + IPN signature verification
│   │       ├── telegram.ts        # One-time invite link generation
│   │       └── turnstile.ts       # Turnstile siteverify
│   └── client/               # Frontend (React SPA)
│       ├── pages/              # Home, Login, Learn, Lesson, Unlock, PaymentPending, Access, ...
│       ├── components/
│       └── lib/                 # api.ts (typed fetch wrapper), SessionContext.tsx
├── tests/                    # vitest — see "Testing" below
├── wrangler.jsonc             # Worker + D1 + static assets configuration
├── .env.example
├── SETUP_GUIDE.md             # Plain-language, click-by-click setup for non-experts
└── TROUBLESHOOTING.md
```

## Prerequisites

- Node.js 20+ and npm
- A Cloudflare account (Free plan is enough to start)
- Accounts with: Resend, NOWPayments, Telegram (BotFather), and (optionally
  for launch) Cloudflare Turnstile

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the environment template and fill in test/dev values
cp .env.example .env
# `wrangler dev` reads `.env` automatically for local secrets.

# 3. Create the local D1 database (this uses a local SQLite file, not your
#    real Cloudflare D1 database — see "D1 database setup" for that)
npm run db:migrate:local

# 4. Load the example lesson content
npm run db:seed:local

# 5. Start the dev server (Worker + hot-reloading SPA)
npm run dev
# The API is on http://localhost:8787, proxied for the Vite client too.
```

## Environment variables

See `.env.example` for the full list. Two categories:

- **Non-secret** (`APP_URL`, `EMAIL_FROM`, `MENTORSHIP_PDF_URL`,
  `TELEGRAM_CHANNEL_ID`, `TELEGRAM_GROUP_ID`, `TURNSTILE_SITE_KEY`,
  `ENROLLMENT_PRICE_USDT`, `REFERENCE_PRICE_USDT`,
  `SUPPORT_TELEGRAM_PREMIUM_URL`, `SUPPORT_TELEGRAM_FREE_URL`) — these live in
  `wrangler.jsonc` under `"vars"` for production, and in `.env` for local dev.
- **Secrets** (`RESEND_API_KEY`, `NOWPAYMENTS_API_KEY`,
  `NOWPAYMENTS_IPN_SECRET`, `TELEGRAM_BOT_TOKEN`, `SESSION_SECRET`,
  `TURNSTILE_SECRET_KEY`) — for production, set these with:

  ```bash
  wrangler secret put SESSION_SECRET
  wrangler secret put RESEND_API_KEY
  wrangler secret put NOWPAYMENTS_API_KEY
  wrangler secret put NOWPAYMENTS_IPN_SECRET
  wrangler secret put TELEGRAM_BOT_TOKEN
  wrangler secret put TURNSTILE_SECRET_KEY
  ```

  For local dev, put the same names/values in `.env` — never commit that file.

Generate `SESSION_SECRET` with:

```bash
openssl rand -hex 32
```

## D1 database setup

```bash
npm run db:create
# Copy the printed database_id into wrangler.jsonc -> d1_databases[0].database_id
```

## Database migrations

Schema lives in `migrations/0001_init.sql`. Apply it with:

```bash
npm run db:migrate:local    # local dev database
npm run db:migrate:remote   # your real Cloudflare D1 database
```

To add a future migration, create `migrations/0002_your_change.sql` and run
the same commands again — wrangler tracks which migrations have already run.

## Seed data

Lesson content lives in `seed/seed.sql` — **not** inside `migrations/`
(wrangler's migration runner would otherwise treat it as a schema migration).
Load or refresh it with:

```bash
npm run db:seed:local
npm run db:seed:remote
```

Re-running the seed file is safe — it starts with `DELETE FROM lessons;`.

## Resend setup

1. Create a Resend account and verify your sending domain
   (`exclusivementorship.xyz`) — see [Email domain setup](#domain-setup)
   below for the DNS records.
2. Create an API key in the Resend dashboard.
3. `wrangler secret put RESEND_API_KEY`
4. Set `EMAIL_FROM` in `wrangler.jsonc` `"vars"` to something like
   `Next Level Trader <support@exclusivementorship.xyz>`.

If `RESEND_API_KEY` is unset, the OTP code is logged to the Worker console
instead of emailed — useful for local testing, never acceptable in
production (see `src/worker/services/email.ts`).

## Cloudflare setup

See **SETUP_GUIDE.md** for a full click-by-click walkthrough. Short version:

```bash
npm install -g wrangler   # or use `npx wrangler` everywhere below
wrangler login
npm run db:create          # then paste the database_id into wrangler.jsonc
npm run db:migrate:remote
npm run db:seed:remote
wrangler secret put SESSION_SECRET
# ...and the other secrets listed above
npm run deploy
```

## Turnstile setup

1. Cloudflare Dashboard → Turnstile → Add a site.
2. Domain: `exclusivementorship.xyz` (and `localhost` for local dev, as a
   second widget or by using Turnstile's testing keys locally).
3. Copy the **Site Key** into `wrangler.jsonc` `"vars".TURNSTILE_SITE_KEY`.
4. Copy the **Secret Key**: `wrangler secret put TURNSTILE_SECRET_KEY`.

If `TURNSTILE_SECRET_KEY` is unset, verification is skipped with a console
warning — fine for local dev, must be set before launch.

## NOWPayments setup

1. Create a NOWPayments account and complete merchant verification.
2. Dashboard → Payment settings → obtain your **API key**.
3. Dashboard → Store settings → set an **IPN secret key**.
4. Set the IPN callback URL to:
   `https://exclusivementorship.xyz/api/webhooks/nowpayments`
   (this is also sent automatically per-invoice by our code, but configuring
   it in the dashboard too is recommended as a fallback).
5. `wrangler secret put NOWPAYMENTS_API_KEY`
6. `wrangler secret put NOWPAYMENTS_IPN_SECRET`
7. Test with NOWPayments' sandbox/test mode before going live — verify
   `waiting → confirming → finished` all flow through correctly (see
   `tests/integration.test.ts` for the same logic tested automatically).

## Telegram bot setup

See **SETUP_GUIDE.md** §Telegram for click-by-click BotFather instructions.
Short version:

1. Message `@BotFather` → `/newbot` → copy the bot token.
2. Create your Premium Channel and Premium Group.
3. Add the bot as an **administrator** to both, with "Invite Users via Link"
   permission.
4. Get the channel/group IDs (forward a message from each to
   `@userinfobot`, or use the Bot API's `getUpdates`).
5. `wrangler secret put TELEGRAM_BOT_TOKEN`
6. Set `TELEGRAM_CHANNEL_ID` / `TELEGRAM_GROUP_ID` in `wrangler.jsonc` `"vars"`.
7. Test: enroll as a test user, confirm the generated invite link only
   admits one member (see `tests/integration.test.ts` "Telegram access
   generation" for the equivalent automated check).

## Domain setup

1. Add `exclusivementorship.xyz` to your Cloudflare account (Websites → Add a site).
2. Update your registrar's nameservers to Cloudflare's.
3. Workers & Pages → your Worker → Settings → Domains & Routes → **Add
   Custom Domain** → `exclusivementorship.xyz`. Cloudflare provisions SSL
   automatically.
4. Decide apex vs `www`: simplest is to serve everything from the apex
   (`exclusivementorship.xyz`) and add a redirect rule for `www` → apex if
   you also want `www` to resolve.

## Email domain (DNS / SPF / DKIM / DMARC)

Resend's dashboard gives you the exact records to add once you add
`exclusivementorship.xyz` as a sending domain there. In short, you'll add:

- An **SPF** TXT record (or extend an existing one) authorizing Resend.
- **DKIM** CNAME/TXT records Resend provides, for signed mail.
- A **DMARC** TXT record (`_dmarc.exclusivementorship.xyz`) — start with a
  monitoring policy (`p=none`) and tighten it once mail is flowing cleanly.

Do not assume the domain is verified — Resend will show "unverified" until
these DNS records propagate and are checked.

## Production deployment

```bash
npm run build     # builds the SPA into dist/client
npm run deploy     # builds + wrangler deploy
```

`npm run deploy` runs `vite build` then `wrangler deploy`, which uploads the
Worker and points its static-assets binding at `dist/client`.

## Troubleshooting

See **TROUBLESHOOTING.md** for the full list of known issues and fixes.

## Common errors

- **"SESSION_SECRET is not configured"** — you must set this secret before
  auth will work at all (see Environment variables above).
- **TypeScript errors about `D1Database`/`Fetcher` types** — make sure
  `@cloudflare/workers-types` is installed (`npm install`) and that your
  editor is using the project's `tsconfig.worker.json`.
- **"no such table" errors locally** — you forgot to run
  `npm run db:migrate:local` (and `db:seed:local` for lesson content).

## How to replace lesson videos

Edit `seed/seed.sql`, change the relevant `youtube_video_id` value, then
re-run `npm run db:seed:remote` (or `:local` while developing). No code
changes needed.

## How to replace lesson titles

Same file, same process — edit `title`, `chapter_name`, or `description` in
`seed/seed.sql` and re-seed.

## How to replace thumbnails

Set `thumbnail_url` in `seed/seed.sql` to any absolute URL (e.g. images
uploaded to Cloudflare Images, R2 with a public bucket, or any CDN). The
outline UI (`/learn`) reads this field directly.

## How to change price

Edit `ENROLLMENT_PRICE_USDT` and/or `REFERENCE_PRICE_USDT` in
`wrangler.jsonc` under `"vars"`, then `npm run deploy`. The server is always
the source of truth for the amount charged — the frontend only displays
whatever `/api/config/public` returns.

## How to change the PDF

Update `MENTORSHIP_PDF_URL` in `wrangler.jsonc` `"vars"` to the new hosted
PDF URL, then redeploy. No code changes needed. The link is surfaced as a
small corner badge on the homepage (`/`) intro video, and inside the unlock
checkout popup.

## How to change Telegram destinations

- **Mentorship channel/group** (the actual course content, Class 6 onward):
  update `TELEGRAM_CHANNEL_ID` / `TELEGRAM_GROUP_ID` in `wrangler.jsonc`
  `"vars"` (and make sure the bot is an administrator of the new chat(s)),
  then redeploy.
- **Support chat** (the floating bottom-right button): update
  `SUPPORT_TELEGRAM_PREMIUM_URL` / `SUPPORT_TELEGRAM_FREE_URL` in
  `wrangler.jsonc` `"vars"`, then redeploy. Which one a visitor sees is
  decided from their real, server-confirmed `course_status` — paid users get
  the premium link, everyone else (including logged-out visitors) gets the
  free link.

## Class 6 — the Telegram handoff point

Class 6 (`TELEGRAM_GATEWAY_LESSON` in `src/worker/lib/config.ts`, currently
`FREE_LESSON_COUNT + 1`) is special-cased for **paid** users only: instead of
a video and assignment, `GET /api/lessons/6` returns `isTelegramGate: true`
and the class-learning page (`/lesson/6`) renders the same Telegram
channel/group join flow used on `/access`, embedded in place of the video —
the course outline underneath stays visible and untouched. Free users hitting
`/lesson/6` now see a locked preview (thumbnail + play button) instead of
being redirected away — tapping play opens the unlock checkout popup.
Premium users can always get back to this same join flow later from the
profile menu → "Access" (which links to `/access`), so a failed or abandoned
join right after payment is never a dead
end.

## How to add more lessons later

1. Add rows to `seed/seed.sql` with the next `lesson_number` / `sort_order`
   (set `is_free = 0` for anything past lesson 5, per the product rule that
   only the first `FREE_LESSON_COUNT` lessons are free).
2. Re-run `npm run db:seed:remote`.
3. No code changes are needed — the frontend outline and lesson pages read
   entirely from the database. If you ever need to change how many lessons
   are free, update `FREE_LESSON_COUNT` in
   `src/worker/lib/config.ts` (currently `5`).

## How to upgrade Cloudflare plan later

The app was deliberately built to run within Free-tier D1/Workers limits
(see `src/worker/db.ts`'s D1-backed rate limiter, chosen specifically to
avoid requiring a paid KV/Durable Objects add-on). Upgrading later needs no
architecture change — e.g. you can swap the D1-backed rate limiter for a KV
or Durable-Object-backed one once you're on a paid plan for higher-precision
limiting, but the Free-tier version is correct and safe as-is.

---

## Testing

```bash
npm run typecheck   # tsc --noEmit across worker, client, and tests
npm run build       # vite build (SPA)
npm test            # vitest — 72 tests covering auth, course progression,
                     # rate limiting, payment idempotency, webhook signature
                     # verification, and Telegram invite generation/retry
```

Tests run against a real in-memory SQLite database (via Node's built-in
`node:sqlite`, loaded through the actual `migrations/0001_init.sql` +
`seed/seed.sql`) and call the real Hono application (`src/worker/index.ts`)
directly — not a hand-rolled mock of the routes. Only external network calls
(Resend, NOWPayments, Telegram) are stubbed.
