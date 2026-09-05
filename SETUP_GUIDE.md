# SETUP_GUIDE.md

A click-by-click guide to get Exclusive Mentorship live at
`exclusivementorship.xyz`. Written for someone who hasn't used Cloudflare
Workers, D1, NOWPayments, Resend, or Telegram's Bot API before.

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

## Part 6 — NOWPayments (accepts the $39 USDT payment)

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
you land on the "Payment successful" Telegram-access screen.

---

## Part 7 — Telegram bot (delivers mentorship access)

**STEP 28.** Open Telegram, search for **@BotFather**, and start a chat.

**STEP 29.** Send `/newbot`. Follow the prompts (pick a name, then a
username ending in `bot`). BotFather replies with a **token** that looks
like `123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ`. Copy it.

**STEP 30.** In your terminal:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
```

Paste the token when prompted.

**STEP 31.** Create your two Telegram destinations if you haven't already:
a **Channel** (e.g. "NLT — Exclusive Mentorship") and a **Group** (e.g.
"NLT — Mentorship Chat").

**STEP 32.** In each one: **Channel/Group settings** → **Administrators** →
**Add Admin** → search for your bot's username → add it. Make sure
**"Invite Users via Link"** is enabled for the bot (it usually is by
default for admins).

**STEP 33.** Get each chat's ID:
- Forward any message from the channel (and separately from the group) to
  **@userinfobot** or **@JsonDumpBot** on Telegram — it will reply with the
  chat ID (a negative number like `-1001234567890` for channels/groups).

**STEP 34.** Open `wrangler.jsonc`, find `"TELEGRAM_CHANNEL_ID"` and
`"TELEGRAM_GROUP_ID"` under `"vars"`, and paste in the two IDs.

**STEP 35.** After you deploy (Part 9), do a real test: enroll as a test
user, click "Join Channel"/"Join Group" from the Access page, and confirm
you're admitted. Then try opening the *same* invite link a second time from
a different Telegram account — it should be refused, since each link only
admits one member.

---

## Part 8 — The Mentorship Details PDF

**STEP 36.** Upload your mentorship-details PDF anywhere that gives you a
direct, public URL (Cloudflare R2 with a public bucket, Google Drive with
"Anyone with the link" sharing set to a direct-download link, your own
site, etc.).

**STEP 37.** Open `wrangler.jsonc`, find `"MENTORSHIP_PDF_URL"` under
`"vars"`, and paste the URL in.

---

## Part 9 — Session secret & first deploy

**STEP 38.** Generate a random secret:

```bash
openssl rand -hex 32
```

**STEP 39.**

```bash
wrangler secret put SESSION_SECRET
```

Paste the random string you just generated.

**STEP 40.** Deploy:

```bash
npm run deploy
```

This builds the site and uploads your Worker. Wrangler prints a
`*.workers.dev` URL — open it to confirm everything works before connecting
your real domain.

---

## Part 10 — Connect exclusivementorship.xyz

**STEP 41.** Cloudflare Dashboard → **Add a Site** → type
`exclusivementorship.xyz` → follow the prompts.

**STEP 42.** Cloudflare shows you two nameservers (e.g.
`aaron.ns.cloudflare.com`, `uma.ns.cloudflare.com`). Go to wherever you
registered the domain (GoDaddy, Namecheap, etc.) → find "Nameservers" →
replace the existing ones with Cloudflare's two. This can take up to 24
hours to fully propagate, though it's often much faster.

**STEP 43.** Back in Cloudflare: **Workers & Pages** → click your
`exclusive-mentorship` Worker → **Settings** → **Domains & Routes** → **Add
Custom Domain** → type `exclusivementorship.xyz` → **Add Domain**.
Cloudflare provisions SSL automatically — no separate certificate steps
needed.

**STEP 44.** Also update `APP_URL` in `wrangler.jsonc` `"vars"` to
`https://exclusivementorship.xyz` if it isn't already, then run
`npm run deploy` again so the app knows its own public URL (used in email
links and payment redirect URLs).

---

## You're done

Visit `https://exclusivementorship.xyz`, click "Start Learning", log in with
your own email, and walk the whole flow yourself once end-to-end (5 free
lessons → premium gate → PDF → payment → Telegram access) before announcing
it publicly.

If anything doesn't behave as expected, check **TROUBLESHOOTING.md** first —
most first-time issues are DNS propagation delays or a secret that wasn't
set yet.
