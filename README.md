# Exclusive Mentorship — Next Level Trader

A focused, single-product mentorship platform: five free lessons, an automatic
premium gate, a $49 USDT crypto enrollment via NOWPayments, and every
premium lesson unlocked directly on-site immediately after payment. Built to
run entirely on Cloudflare's Free plan.

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
- [Domain setup](#domain-setup)
- [Production deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Common errors](#common-errors)
- [How to replace lesson videos, titles, taglines, or descriptions](#how-to-replace-lesson-videos-titles-taglines-or-descriptions)
- [How to change price](#how-to-change-price)
- [How to change how many classes are free, or the homepage intro video](#how-to-change-how-many-classes-are-free-or-the-homepage-intro-video)
- [How to change the PDF](#how-to-change-the-pdf)
- [How to change the support Telegram destination](#how-to-change-the-support-telegram-destination)
- [How to add more lessons later](#how-to-add-more-lessons-later)
- [How to upgrade Cloudflare plan later](#how-to-upgrade-cloudflare-plan-later)

---

## Project overview

**Flow:** Visitor → intro → free classes (watch each video to the end to
unlock the next) → Premium Gate (PDF + pricing) → NOWPayments checkout →
webhook confirms payment → paid classes (Bunny.net video, same
watch-to-unlock rule), all unlocked directly on-site. A floating support
button is the one remaining Telegram touchpoint — it opens a Telegram chat
for support conversations only, not content delivery.

There is exactly one product ($49 USDT, reference value $100 USDT — "51%
OFF"). An admin panel (`/admin`) manages lessons, chapters, price, the free
lesson count, the intro video, and student access — see
[Admin panel](#admin-panel--lessons-chapters-settings-students) below.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React + React Router + Tailwind CSS, built with Vite |
| Backend | [Hono](https://hono.dev) running on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Email (OTP) | [Resend](https://resend.com) |
| Payments | [NOWPayments](https://nowpayments.io) (non-hosted "payment" API — custom in-site checkout popup, no NOWPayments branding shown) |
| Free video hosting | YouTube (unlisted) |
| Paid video hosting | [Bunny.net](https://bunny.net) Stream |
| Support contact | Telegram (floating support button only — no content delivery) |
| Bot protection | Cloudflare Turnstile |
| Hosting | A single Cloudflare Worker, serving both the API and the built SPA via [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) |

**Why one Worker for everything?** Cloudflare's newer "assets" binding lets a
single Worker serve a static SPA *and* handle `/api/*` routes, with automatic
SPA fallback for client-side routing. This avoids the complexity (and cost)
of a separate Pages project or a Next.js edge-runtime adapter, while staying
100% within the Free plan.

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
│   │   │   ├── config.ts      # Env type + business constants, admin-editable settings helpers
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
│   │   │   └── config.ts        # /api/config/public
│   │   └── services/
│   │       ├── email.ts          # Resend
│   │       ├── nowpayments.ts     # Non-hosted payment creation + IPN signature verification
│   │       └── turnstile.ts       # Turnstile siteverify
│   └── client/               # Frontend (React SPA)
│       ├── pages/              # Home, Login, Learn, Lesson, Unlock, Access, ...
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
- Accounts with: Resend, NOWPayments, and (optionally for launch) Cloudflare
  Turnstile. A Telegram account is only needed if you want to change the
  support button's destination chats.

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
  `TURNSTILE_SITE_KEY`, `ENROLLMENT_PRICE_USDT`, `REFERENCE_PRICE_USDT`,
  `SUPPORT_TELEGRAM_PREMIUM_URL`, `SUPPORT_TELEGRAM_FREE_URL`) — these live in
  `wrangler.jsonc` under `"vars"` for production, and in `.env` for local dev.
- **Secrets** (`RESEND_API_KEY`, `NOWPAYMENTS_API_KEY`,
  `NOWPAYMENTS_IPN_SECRET`, `SESSION_SECRET`,
  `TURNSTILE_SECRET_KEY`) — for production, set these with:

  ```bash
  wrangler secret put SESSION_SECRET
  wrangler secret put RESEND_API_KEY
  wrangler secret put NOWPAYMENTS_API_KEY
  wrangler secret put NOWPAYMENTS_IPN_SECRET
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

Re-running the seed file is safe for a **fresh/local database with no real
users yet** — it starts with `DELETE FROM lessons;`. Do **not** run
`db:seed:remote` against a live database that already has real student
progress: `lesson_progress` references `lessons.id` with `ON DELETE CASCADE`,
so deleting and re-inserting lessons wipes that progress. To change lesson
content on a live database with existing users, add a migration that
`UPDATE`s the affected rows in place instead (see
`migrations/0006_curriculum_update_38_classes.sql` for an example).

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

## How to replace lesson videos, titles, taglines, or descriptions

Preferred path now: admin panel → **Lessons & Chapters** → **Edit** on the
lesson → update the **video embed link** box (paste a YouTube "Embed" share
URL for free classes, or a Bunny.net stream embed URL for paid classes),
title, tagline, or description → **Save changes**. Takes effect
immediately, no redeploy.

`seed/seed.sql` is still used for a *fresh* install's starting content (see
`npm run db:seed:local`/`:remote`), but isn't the ongoing editing path once
real students have progress — see the seed data warning near the top of
that file.

## How to change price

Preferred path: admin panel → **Settings** → **Price & Discount**. Takes
effect immediately, no redeploy. (`ENROLLMENT_PRICE_USDT` /
`REFERENCE_PRICE_USDT` in `wrangler.jsonc` only set the *initial* defaults
before an admin has ever saved a value.)

## How to change how many classes are free, or the homepage intro video

Admin panel → **Settings** → **Course**. Both the free-class count and the
intro video embed link take effect immediately, site-wide, no redeploy.

## How to change the PDF

Update `MENTORSHIP_PDF_URL` in `wrangler.jsonc` `"vars"` to the new hosted
PDF URL, then redeploy. No code changes needed. The link is surfaced as a
small corner badge on the homepage (`/`) intro video, and inside the unlock
checkout popup.

## How to change the support Telegram destination

The floating support button (bottom-right) is the only remaining Telegram
integration on the site — it opens a Telegram chat for support
conversations, never course content. Update
`SUPPORT_TELEGRAM_PREMIUM_URL` / `SUPPORT_TELEGRAM_FREE_URL` in
`wrangler.jsonc` `"vars"`, then redeploy. Which one a visitor sees is
decided from their real, server-confirmed `course_status` — paid users get
the premium link, everyone else (including logged-out visitors) gets the
free link.

## Video-gated progression (replaces the old assignment gate)

Every class — free (unlisted YouTube) or paid (Bunny.net) — now requires
finishing its video before the next class unlocks. `VideoPlayer.tsx`
auto-detects the embed host and calls `POST
/api/lessons/:number/complete-video` the moment the player reports the
video actually ended (YouTube IFrame API `ended` state, or Bunny.net's
player.js `ended` message) — never on page load. That single endpoint is
the entire progression mechanism now; there is no more assignment
submission step. See `src/worker/lib/course.ts` and
`src/worker/routes/lessons.ts`.

## Admin panel — Lessons, Chapters, Settings, Students

`/admin` (separate session/cookie from the student site) now includes:

- **Students** — directory + progress, and a **Grant/Revoke paid access**
  button per student for enrollments handled outside NOWPayments checkout.
- **Lessons & Chapters** — add/edit/reorder lessons and chapters. Editing a
  lesson only ever touches its title, tagline, description, chapter and a
  single **video embed link** box (paste a ready `<iframe>` URL — a YouTube
  "Embed" share link, or a Bunny.net stream embed URL). Reordering
  renumbers lessons 1..N to match (see the warning in the code comments:
  this reassigns "Class N" for anyone mid-course, so reorder only content
  nobody's actively working through). New lessons are created hidden;
  publish once the embed link is ready.
- **Settings** — price/discount (unchanged), plus **free lesson count**
  (how many classes, from Class 1, are free before enrollment is required)
  and the **homepage intro video** embed link. Both take effect immediately
  site-wide, no redeploy.

None of "how many classes are free", "how many classes exist", or "which
classes have video yet" are hardcoded — all three now live in the
database and are edited entirely from the admin panel.

## Support — direct Telegram redirect (the one intentional Telegram touchpoint)

The floating support button opens Telegram directly: free/logged-out
visitors go to `SUPPORT_TELEGRAM_FREE_URL`, enrolled (paid) students go to
`SUPPORT_TELEGRAM_PREMIUM_URL` (both in `wrangler.jsonc` → `"vars"`) — which
one is used is decided from the learner's real, server-confirmed
`course_status`, never a client-side guess. This is deliberately the only
place Telegram is used anywhere on the site — it is not used for content
delivery, enrollment, or account access. Update those two URLs and redeploy
to change the destinations.

## Curriculum structure — chapters, admin-managed

The public outline (`/learn`, and the embedded outline on `/lesson/:id`)
groups classes under chapters (Foundation, Technical Edge, Fundamental
Edge, System Building, Validation & Psychology, Execution & Prop Trading
by default), each with a one-line tagline, all editable from the admin
Lessons & Chapters page.

- Chapter metadata (name/tagline/order) lives in the `chapters` table
  (`src/worker/db.ts`), matched to lessons by `chapter_name` — renaming a
  chapter from the admin panel cascades the rename onto its lessons
  automatically.
- Every class ships with `is_active = 0` and no `video_embed_url` until an
  admin pastes a real embed link and publishes it — a fresh install never
  shows a half-broken class on the public site.
- The public outline intentionally shows only chapter/class number, title,
  tagline, thumbnail and status — never the internal teaching topics inside
  a class (e.g. FVG, MSS, COT). Keep it that way when editing content.

## How to add more lessons later

Use the admin panel (**Lessons & Chapters** → **+ Add lesson**) — no SQL or
redeploy needed. It appends the lesson at the end of the course, hidden
until you paste its video embed link and publish it. `seed/seed.sql` is
still the source of truth for a *fresh* install's starting content, but is
not the ongoing editing path once the site is live — see the seed data
warning above about never reseeding a database with real user progress.

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
npm test            # vitest — 100+ tests covering auth, course progression,
                     # rate limiting, payment idempotency, and webhook
                     # signature verification
```

Tests run against a real in-memory SQLite database (via Node's built-in
`node:sqlite`, loaded through the actual `migrations/0001_init.sql` +
`seed/seed.sql`) and call the real Hono application (`src/worker/index.ts`)
directly — not a hand-rolled mock of the routes. Only external network calls
(Resend, NOWPayments) are stubbed.
