# SETUP_GUIDE.md

A click-by-click guide to get Exclusive Mentorship live at
`exclusivementorship.xyz`. Written for someone who hasn't used Cloudflare
Workers, D1, NOWPayments, or Resend before.

Do these sections in order. Each one tells you exactly what to click and
exactly what value to paste where.

---

## Part 1 — Cloudflare account & tools

**STEP 1.** Go to https://dash.cloudflare.com and create a free account if
you don't have one.

**STEP 2.** On your computer, open a terminal and install the two tools
we'll use:

```bash
node -v   # should print v20 or higher — if not, install Node.js first
npm install -g wrangler
```

**STEP 3.** Log wrangler into your Cloudflare account:

```bash
wrangler login
```

A browser window opens — click **Allow**.

---

## Part 2 — Get the project running locally first

**STEP 4.** Open the project folder in your terminal and install everything:

```bash
npm install
```

**STEP 5.** Copy the example environment file:

```bash
cp .env.example .env
```

You'll fill in real values as you go through this guide — for now, local
testing works fine with most fields left as placeholders.

**STEP 6.** Create your local test database and load the example lessons:

```bash
npm run db:migrate:local
npm run db:seed:local
```

**STEP 7.** Start the app locally:

```bash
npm run dev
```

Open http://localhost:8787 in your browser. You should see the "Start
Learning" screen. (OTP login codes will print in your terminal instead of
being emailed, until you set up Resend in Part 4.)

---

## Part 3 — Create your D1 database on Cloudflare (for real, production use)

**STEP 8.** Create the database:

```bash
npm run db:create
```

**STEP 9.** This prints something like:

```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Open `wrangler.jsonc`, find this line:

```
"database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the id you just copied.

**STEP 10.** Load the schema and example lessons into the real database:

```bash
npm run db:migrate:remote
npm run db:seed:remote
```

---

## Part 4 — Resend (sends the login-code emails)

**STEP 11.** Go to https://resend.com and create an account.

**STEP 12.** In Resend: **Domains** → **Add Domain** → type
`exclusivementorship.xyz` → click **Add**.

**STEP 13.** Resend shows you 2-3 DNS records to add (SPF, DKIM, and
sometimes a tracking record). Go to your Cloudflare dashboard →
**exclusivementorship.xyz** → **DNS** → **Records** → **Add record**, and
add each one exactly as Resend shows it (same Type, Name, and Content/Value).

**STEP 14.** Back in Resend, click **Verify DNS Records**. This can take a
few minutes up to a few hours to go green.

**STEP 15.** In Resend: **API Keys** → **Create API Key** → copy it.

**STEP 16.** Back in your terminal:

```bash
wrangler secret put RESEND_API_KEY
```

Paste the key when prompted and press Enter.

**STEP 17.** Open `wrangler.jsonc`, find `"EMAIL_FROM"` under `"vars"`, and
make sure it matches your verified domain, e.g.:

```
"EMAIL_FROM": "Next Level Trader <support@exclusivementorship.xyz>"
```

---

## Part 5 — Cloudflare Turnstile (bot protection on the login form)

**STEP 18.** Cloudflare Dashboard → **Turnstile** (left sidebar) → **Add
Site**.

**STEP 19.** Domain: `exclusivementorship.xyz`. Widget mode: **Managed** (the
default is fine).

**STEP 20.** Copy the **Site Key**. Open `wrangler.jsonc`, find
`"TURNSTILE_SITE_KEY"` under `"vars"`, and paste it in.

**STEP 21.** Copy the **Secret Key**:

```bash
wrangler secret put TURNSTILE_SECRET_KEY
```

Paste it when prompted.

---

## Part 6 — NOWPayments (accepts the $49 USDT payment)

**STEP 22.** Go to https://nowpayments.io and create a merchant account.
Complete whatever verification they require.

**STEP 23.** In the NOWPayments dashboard: **Store Settings** → **Payment
settings** → copy your **API Key**.

**STEP 24.** Still in Store Settings, find **IPN Secret Key** (sometimes
called "IPN key") → generate one if you don't already have one → copy it.

**STEP 25.** (Optional but recommended) In the same settings, set the **IPN
callback URL** to:

```
https://exclusivementorship.xyz/api/webhooks/nowpayments
```

**STEP 26.** Back in your terminal:

```bash
wrangler secret put NOWPAYMENTS_API_KEY
wrangler secret put NOWPAYMENTS_IPN_SECRET
```

Paste each value when prompted.

**STEP 27.** Before going live, use NOWPayments' sandbox/test mode (see
their dashboard for a toggle) to send yourself a test $1 payment and confirm
you land on the "Payment successful" screen with your lessons unlocked.

---

## Part 7 — The Mentorship Details PDF

**STEP 28.** Upload your mentorship-details PDF anywhere that gives you a
direct, public URL (Cloudflare R2 with a public bucket, Google Drive with
"Anyone with the link" sharing set to a direct-download link, your own
site, etc.).

**STEP 29.** Open `wrangler.jsonc`, find `"MENTORSHIP_PDF_URL"` under
`"vars"`, and paste the URL in.

---

## Part 8 — Session secret & first deploy

**STEP 30.** Generate a random secret:

```bash
openssl rand -hex 32
```

**STEP 31.**

```bash
wrangler secret put SESSION_SECRET
```

Paste the random string you just generated.

**STEP 32.** Deploy:

```bash
npm run deploy
```

This builds the site and uploads your Worker. Wrangler prints a
`*.workers.dev` URL — open it to confirm everything works before connecting
your real domain.

---

## Part 9 — Connect exclusivementorship.xyz

**STEP 33.** Cloudflare Dashboard → **Add a Site** → type
`exclusivementorship.xyz` → follow the prompts.

**STEP 34.** Cloudflare shows you two nameservers (e.g.
`aaron.ns.cloudflare.com`, `uma.ns.cloudflare.com`). Go to wherever you
registered the domain (GoDaddy, Namecheap, etc.) → find "Nameservers" →
replace the existing ones with Cloudflare's two. This can take up to 24
hours to fully propagate, though it's often much faster.

**STEP 35.** Back in Cloudflare: **Workers & Pages** → click your
`exclusive-mentorship` Worker → **Settings** → **Domains & Routes** → **Add
Custom Domain** → type `exclusivementorship.xyz` → **Add Domain**.
Cloudflare provisions SSL automatically — no separate certificate steps
needed.

**STEP 36.** Also update `APP_URL` in `wrangler.jsonc` `"vars"` to
`https://exclusivementorship.xyz` if it isn't already, then run
`npm run deploy` again so the app knows its own public URL (used in email
links and payment redirect URLs).

---

---

## Optional — Enabling the scheduled cleanup job

The Worker includes a `scheduled` handler (`src/worker/scheduled.ts`) that
deletes stale rows from `otp_codes`, `rate_limits`, and `audit_events` —
tables that otherwise grow forever. It ships **disabled**: no Cron Trigger
is registered, so it never runs until you turn it on. This isn't urgent at
low traffic, but is ready for when it becomes one.

**To enable it:**

1. Open `wrangler.jsonc` and find the commented-out `"triggers"` block near
   the bottom of the file. Uncomment it:
   ```jsonc
   "triggers": {
     "crons": ["17 3 * * *"]
   }
   ```
   (This example runs once a day at 03:17 UTC — edit the cron expression if
   you'd prefer a different time.)
2. (Optional) In the `"vars"` block, add `"AUDIT_RETENTION_DAYS": "90"` to
   set how long `audit_events` rows are kept before deletion (default is 90
   days if you skip this). Rows with `event_type` `payment_confirmed` or
   `payment_underpaid_tolerated` are always kept regardless of this setting.
3. Run `npm run deploy`. Cron Triggers are only registered when you deploy
   — editing `wrangler.jsonc` locally has no effect until then.
4. Confirm it's live: Cloudflare Dashboard → **Workers & Pages** → your
   Worker → **Settings** → **Triggers**, or run `npx wrangler triggers`.

Once enabled, each run logs a one-line summary per table (rows deleted, or
an error) — visible via `wrangler tail` or the dashboard's Logs tab.

---

## Optional — Google Sign-In (fixes OTP emails landing in spam)

Email-OTP login still works exactly as before and needs nothing extra. This
adds a **second, optional** login method — "Continue with Google" — so
anyone with a Google account can log in without ever waiting on an email at
all. It's the fastest fix for OTP codes landing in spam, since it sidesteps
email delivery entirely for those users; it doesn't replace OTP, which stays
as the only method for everyone else.

**STEP 1.** Go to
[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
(create a new project first if you don't have one — it's free, no billing
needed for this).

**STEP 2.** **Create Credentials** → **OAuth client ID**.
   - If prompted, configure the **OAuth consent screen** first: External,
     app name "Exclusive Mentorship", your support email — the rest can be
     left default.
   - Application type: **Web application**.
   - Name: anything, e.g. "Exclusive Mentorship Web".
   - **Authorized JavaScript origins** — add both:
     - `https://exclusivementorship.xyz`
     - `http://localhost:5173` (for local dev, if you use the Vite dev server)
   - Leave **Authorized redirect URIs** empty — this flow doesn't use redirects.

**STEP 3.** Copy the **Client ID** (looks like
`123456789-abc123.apps.googleusercontent.com`). This is **not a secret** —
it's meant to be visible in the browser, so it's a plain `var`, not a
`wrangler secret`.

**STEP 4.** Open `wrangler.jsonc`, find `"GOOGLE_CLIENT_ID"` under `"vars"`,
and paste it in.

**STEP 5.** Run `npm run db:migrate:remote` so migration
`0007_add_google_sub.sql` runs against your production D1 database — it just
adds one nullable column, no data is touched. (Use `db:migrate:local` first
if you want to try it locally.)

**STEP 6.** Run `npm run deploy`.

That's it — the "Continue with Google" button appears on the login page
automatically once `GOOGLE_CLIENT_ID` is set, and stays hidden if it's left
empty. If someone already has an account from email-OTP login, signing in
with Google using the *same* email links to that same account automatically
— no duplicate accounts, no lost progress.

---

## Optional — Changing the support Telegram links

The floating support button (bottom-right corner of the site) opens
Telegram — this is the only Telegram integration left on the site, used
purely for support conversations, not for delivering course content. It
already points at working defaults set in `wrangler.jsonc` `"vars"`
(`SUPPORT_TELEGRAM_FREE_URL` and `SUPPORT_TELEGRAM_PREMIUM_URL`). To point
it at your own Telegram chats instead, replace those two URLs with links to
your own support chat/channel, then run `npm run deploy`. Paid students see
`SUPPORT_TELEGRAM_PREMIUM_URL`; everyone else sees
`SUPPORT_TELEGRAM_FREE_URL`.

---

## You're done

Visit `https://exclusivementorship.xyz`, click "Start Learning", log in with
your own email, and walk the whole flow yourself once end-to-end (5 free
lessons → premium gate → PDF → payment → unlocked mentorship lessons) before
announcing it publicly.

If anything doesn't behave as expected, check **TROUBLESHOOTING.md** first —
most first-time issues are DNS propagation delays or a secret that wasn't
set yet.
