# TROUBLESHOOTING.md

## "OTP email not arriving"

1. Check whether `RESEND_API_KEY` is actually set in production:
   `wrangler secret list` should show `RESEND_API_KEY` in the list (values
   are hidden, but names are shown). If it's missing, see SETUP_GUIDE.md
   Part 4.
2. Check the Resend dashboard's **Logs** tab for the send attempt — it will
   show a bounce/block reason if the email provider rejected it.
3. Confirm your sending domain shows **Verified** (green) in Resend →
   Domains. If it's still "Pending", your SPF/DKIM DNS records haven't
   propagated yet.
4. Check spam/junk folders — a freshly verified domain sometimes lands there
   for the first few sends until its sending reputation warms up.
5. If you're testing locally (`npm run dev`) and never set
   `RESEND_API_KEY` in `.env`, this is expected — the code is printed to
   your terminal instead (`[dev-mode] OTP for ...`). That's intentional dev
   behavior, not a bug.

## "Cloudflare deployment failed"

1. Run `npm run typecheck` and `npm run build` locally first — most deploy
   failures are actually build/type errors that `wrangler deploy` surfaces
   late. Fix those first.
2. Run `wrangler deploy --dry-run` to validate your configuration
   (bindings, vars) without actually publishing.
3. "Total Upload" wildly larger than expected (multiple MB) usually means
   `dist/client` wasn't rebuilt — run `npm run build` before deploying, or
   just use `npm run deploy` which does both.
4. Confirm you're logged in: `wrangler whoami`. Re-run `wrangler login` if
   needed.

## "D1 database not found"

- You likely deployed before replacing the placeholder `database_id` in
  `wrangler.jsonc`. Run `npm run db:create`, copy the real
  `database_id` it prints, paste it into `wrangler.jsonc`, then redeploy.
- Make sure you ran the `--remote` variants
  (`npm run db:migrate:remote`, `npm run db:seed:remote`) against your real
  database — the `--local` variants only affect your machine's local dev
  copy.

## "Payment confirmed but Telegram link not generated"

This is an explicitly handled case, not a data-loss bug:

- The database intentionally records `payment_status = confirmed` (or
  `finished`) and `telegram_access.status = 'pending'` as two independent
  facts. If Telegram invite generation fails (bot not an admin, wrong chat
  ID, Telegram API hiccup), the user's paid status is **never** rolled back.
- The user can simply reopen the `/access` page (or you can tell them to),
  which automatically retries generation — no repayment required.
- To confirm this for yourself: check `SELECT course_status FROM users
  WHERE email = '...'` (should be `paid`) and `SELECT status FROM
  telegram_access WHERE user_id = '...'` (will show `pending` or `failed`
  until generation succeeds).
- If it keeps failing, see the next section.

## "Telegram bot cannot generate invite link"

Almost always one of:

1. **Bot isn't an administrator** of the channel/group — add it via
   Channel/Group Settings → Administrators (SETUP_GUIDE.md STEP 32).
2. **Wrong chat ID** — `TELEGRAM_CHANNEL_ID`/`TELEGRAM_GROUP_ID` must be the
   exact numeric ID (e.g. `-1001234567890`), not the `@username`. Re-fetch
   via @userinfobot per SETUP_GUIDE.md STEP 33.
3. **Bot lacks "Invite Users via Link" permission** even though it's an
   admin — re-check the specific permission toggle when adding it.
4. **`TELEGRAM_BOT_TOKEN` not set or wrong** — `wrangler secret list` to
   confirm it exists; regenerate via BotFather (`/token`) if you suspect
   it's wrong, and re-run `wrangler secret put TELEGRAM_BOT_TOKEN`.

## "Custom domain not working"

1. DNS/nameserver changes can take from a few minutes up to 24-48 hours.
   Check propagation with a tool like https://dnschecker.org.
2. Confirm the domain is added under **Workers & Pages → your Worker →
   Settings → Domains & Routes**, not just added generally to your
   Cloudflare account.
3. If you see a Cloudflare "Error 522" or SSL warning immediately after
   adding the domain, wait — SSL certificate issuance can take a few
   minutes.

## "Webhook not arriving"

1. Double-check the IPN callback URL configured in your NOWPayments
   dashboard exactly matches
   `https://exclusivementorship.xyz/api/webhooks/nowpayments` (https, no
   typos, matches your live domain).
2. Our code also sends `ipn_callback_url` per-invoice when creating the
   payment (see `src/worker/services/nowpayments.ts`) — if that URL is
   wrong (e.g. `APP_URL` misconfigured), fix `APP_URL` in `wrangler.jsonc`
   and redeploy; new invoices will use the corrected URL.
3. Use NOWPayments' dashboard to inspect IPN delivery attempts/responses for
   a given payment — a `401` response from your Worker there means the
   signature verification is rejecting it (see next point).
4. A rejected/invalid-signature response (`401`) almost always means
   `NOWPAYMENTS_IPN_SECRET` doesn't match what's configured in the
   NOWPayments dashboard — they must be identical.

## "User cannot unlock lesson"

- Lesson access is **entirely server-enforced** (see
  `src/worker/lib/course.ts`) — the frontend never decides this. If a user
  reports being stuck, check the actual data:
  `SELECT current_lesson, course_status FROM users WHERE email = '...'`
- Lessons 1-5 unlock strictly in order, one at a time, only after the
  *previous* lesson's assignment is submitted (not just the video watched).
  If a user hasn't submitted an assignment, the next lesson is expected to
  be locked — this is by design, not a bug.
- Lesson 6+ additionally requires `course_status = 'paid'`, regardless of
  `current_lesson` — if payment hasn't been confirmed yet (see the
  webhook-related sections above), this is expected.

## "Payment pending forever"

1. Confirm the payment actually reached the blockchain — ask the user for
   their transaction hash and check it on a block explorer for the relevant
   chain/currency.
2. Check `payment_orders.status` for that order directly in D1 — if it's
   stuck at `waiting`, the webhook likely hasn't arrived yet (see "Webhook
   not arriving" above). If it's `confirming`, that's expected — crypto
   confirmations can take anywhere from a couple of minutes to over an hour
   depending on network congestion and the chosen currency/network.
3. The pending page polls automatically for a few minutes and then stops;
   reloading `/payment/pending?order=<id>` restarts polling without
   creating a new order.

## "Turnstile not loading"

1. Check the browser console for a CSP violation — our
   `Content-Security-Policy` explicitly allows
   `https://challenges.cloudflare.com` for both `script-src` and
   `frame-src` (see `src/worker/middleware/security.ts`); if you've
   modified the CSP, make sure that allowance is still present.
2. Confirm `TURNSTILE_SITE_KEY` in `wrangler.jsonc` matches the site key
   shown in your Turnstile dashboard for the exact domain being tested
   (widgets are domain-scoped).
3. Ad blockers and some privacy browser extensions block Turnstile's
   script — this is a client-side issue, not a deployment bug; if QA is
   failing locally, try an incognito window with extensions disabled.

## General debugging tips

- `wrangler tail` streams your production Worker's live logs — invaluable
  for seeing the actual error behind a generic "Something went wrong"
  message shown to users (we deliberately never expose stack traces to the
  client — see `app.onError` in `src/worker/index.ts`).
- `npm test` re-runs the full automated test suite (72 tests) covering
  exactly these categories — auth, course progression, rate limiting,
  payment idempotency, webhook signature verification, and Telegram
  generation/retry — so regressions surface before you deploy them.
