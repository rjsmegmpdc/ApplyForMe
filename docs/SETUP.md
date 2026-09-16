# ApplyForMe v2 — Cloudflare setup

One-time steps, in order. Everything here is dashboard clicking or a wrangler command;
the code reads the results from `apps/web/wrangler.jsonc` and Worker secrets.

Account state assumed (confirmed 2026-09-13): Workers Paid, R2 Paid, Zero Trust (Teams
Free) — all active.

## 1. Domain — done

**applyforme.dev**, bought in Cloudflare Registrar on 2026-09-14, so DNS is already on
Cloudflare. Hostnames used below:

| Purpose | Name |
|---|---|
| The app (UI + API, behind Access) | `app.applyforme.dev` — created by wrangler on deploy (`routes` in wrangler.jsonc) |
| Mail in and out | `jobs@applyforme.dev` |

Why not harkness.net.nz: it carries the family's mail via Email Routing. A dedicated
domain keeps that untouched and gives the pipeline its own sending reputation.

## 2. D1 database and R2 buckets — created

Created via the API on 2026-09-16: D1 `applyforme-db` (id already in `wrangler.jsonc`),
R2 `applyforme-opennext-cache` and `applyforme-docs`. Migrations applied 2026-09-16 (`npm run db:migrate:remote` for future schema changes).

## 3. Secrets — two of three set

`TOKENS_ENC_KEY` and `ACTION_LINK_SECRET` were generated and set on 2026-09-16. Still
needed for live tailoring, either:

- **Preferred:** once Access is on (step 8), open the app → Settings → Anthropic key and
  paste your key there. It is encrypted at rest with `TOKENS_ENC_KEY` and wins over any
  server key. Or
- `npx wrangler secret put ANTHROPIC_API_KEY` from `apps/web` for a server-wide default.

Until one exists the pipeline still runs and still emails you, using the deterministic
documents (marked as such in the email).

The Access values are not secrets; they are `vars` in `wrangler.jsonc` (step 8).

## 4. First deploy — done

Deployed 2026-09-16: `https://app.applyforme.dev` (custom domain created by wrangler)
and `https://applyforme.onlinemyassistant.workers.dev`, cron `*/30 * * * *`, migrations
applied. Every request currently returns 401 because the Access vars are placeholders
(step 8). Redeploy after any config change with `npm run deploy` from `apps/web`.

## 5. Email — sending (Cloudflare Email Service)

Dashboard → Email → **Email Service** → Sending → add `applyforme.dev`. Cloudflare adds the
`cf-bounce` MX/SPF/DKIM/DMARC records itself because DNS is on Cloudflare. Wait for
"Verified". The Worker already declares `"send_email": [{ "name": "EMAIL" }]`.

Sanity check after deploy: the UI's Settings page has a "Send test email" button.

## 6. Email — receiving (Email Routing → Worker)

Dashboard → Email → **Email Routing** on `applyforme.dev` → Get started → let it add MX/SPF.
Then Routing rules → Create address:

- Custom address: `jobs`
- Action: **Send to a Worker** → `applyforme`

## 7. Gmail → jobs@applyforme.dev

In the Gmail that receives the Seek alerts:

1. Settings → Forwarding → **Add a forwarding address** → `jobs@applyforme.dev`. Gmail sends a
   confirmation code to that address. The Worker logs it and shows it on the Settings
   page under "Forwarding confirmation" (it recognises Gmail's confirmation email).
   Enter the code in Gmail.
2. Create a filter: `from:(seek.co.nz)` (or `subject:(job alert)`) → **Forward to**
   `jobs@applyforme.dev`. Optionally also "Skip inbox" so the raw alerts stop cluttering Gmail;
   the review email is what you read.

Every matching alert now wakes the Worker within seconds.

## 8. Cloudflare Access (login + sharing)

Zero Trust → Access → Applications → Add → Self-hosted:

- Application domain: `app.applyforme.dev`
- Policy: Allow → Emails → your email(s). Add a friend's email here to share.

Then add a **second** self-hosted application so the one-click links in review emails
work without a login prompt on whatever device you open them on:

- Application domain: `app.applyforme.dev`, path `api/runs/*/action`
- Policy: **Bypass** → Everyone. The link's own HMAC signature is the credential
  (`lib/action-links.ts`); nothing else under `/api` is bypassed.
- Copy the **Application Audience (AUD) tag** and your team domain
  (`<team>.cloudflareaccess.com`) into the `ACCESS_TEAM_DOMAIN` / `ACCESS_APP_AUD`
  vars in `apps/web/wrangler.jsonc`, replacing the `pending…` placeholders, then
  `npm run deploy` again.

While the placeholders are in place every UI/API request returns 401 — the deployed app
is never open in single-user mode. The email and cron handlers do not use identity, so
the pipeline itself is unaffected. Locally, `.dev.vars` sets both empty, which turns on
the single-user dev fallback.

## 9. Seed your profile and rules

Open the app → Profile → paste/import the master profile (v1's JSON works as-is) →
Rules → set keywords, preferred companies, exclusions, minimum match. Save.

## 10. Local development

```
cp apps/web/.dev.vars.example apps/web/.dev.vars   # fill ANTHROPIC_API_KEY etc.
npm run dev                                        # http://localhost:3000, miniflare D1/R2
npx wrangler d1 migrations apply applyforme-db --local
```

Without the `EMAIL` binding locally, sends are logged to the console instead.

## Costs at expected volume (a few alerts a day)

| Item | Cost |
|---|---|
| Workers Paid, R2, Email Service | already subscribed; usage inside included allowances |
| Domain (applyforme.dev) | ~USD 12 / year |
| Claude Opus 5 tailoring, profile cached | cents per job |
