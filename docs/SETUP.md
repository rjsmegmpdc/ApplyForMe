# ApplyForMe v2 — Cloudflare setup

One-time steps, in order. Everything here is dashboard clicking or a wrangler command;
the code reads the results from `apps/web/wrangler.jsonc` and Worker secrets.

Account state assumed (confirmed 2026-09-13): Workers Paid, R2 Paid, Zero Trust (Teams
Free) — all active.

## 1. Domain

Buy a `.com` in **Cloudflare Registrar** (dashboard → Domain Registration → Register).
It lands on Cloudflare DNS automatically. Note it below; every later step uses it.

```
DOMAIN = ______________________.com
```

Why not harkness.net.nz: it carries the family's mail via Email Routing. A dedicated
domain keeps that untouched and gives the pipeline its own sending reputation.

## 2. D1 database and R2 buckets

```
cd apps/web
npx wrangler d1 create applyforme-db          # paste the database_id into wrangler.jsonc
npx wrangler r2 bucket create applyforme-opennext-cache
npx wrangler r2 bucket create applyforme-docs
npm run db:migrate:remote
```

## 3. Secrets

```
openssl rand -base64 32     # → TOKENS_ENC_KEY
openssl rand -hex 32        # → ACTION_LINK_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TOKENS_ENC_KEY
npx wrangler secret put ACTION_LINK_SECRET
```

`ACCESS_TEAM_DOMAIN` and `ACCESS_APP_AUD` come from step 6.

## 4. First deploy

Edit `wrangler.jsonc` vars: `EMAIL_FROM = jobs@DOMAIN`, `APP_BASE_URL` (workers.dev for
now, or `https://app.DOMAIN` once you add a custom domain to the Worker).

```
npm run deploy
```

## 5. Email — sending (Cloudflare Email Service)

Dashboard → Email → **Email Service** → Sending → add `DOMAIN`. Cloudflare adds the
`cf-bounce` MX/SPF/DKIM/DMARC records itself because DNS is on Cloudflare. Wait for
"Verified". The Worker already declares `"send_email": [{ "name": "EMAIL" }]`.

Sanity check after deploy: the UI's Settings page has a "Send test email" button.

## 6. Email — receiving (Email Routing → Worker)

Dashboard → Email → **Email Routing** on `DOMAIN` → Get started → let it add MX/SPF.
Then Routing rules → Create address:

- Custom address: `jobs`
- Action: **Send to a Worker** → `applyforme`

## 7. Gmail → jobs@DOMAIN

In the Gmail that receives the Seek alerts:

1. Settings → Forwarding → **Add a forwarding address** → `jobs@DOMAIN`. Gmail sends a
   confirmation code to that address. The Worker logs it and shows it on the Settings
   page under "Forwarding confirmation" (it recognises Gmail's confirmation email).
   Enter the code in Gmail.
2. Create a filter: `from:(seek.co.nz)` (or `subject:(job alert)`) → **Forward to**
   `jobs@DOMAIN`. Optionally also "Skip inbox" so the raw alerts stop cluttering Gmail;
   the review email is what you read.

Every matching alert now wakes the Worker within seconds.

## 8. Cloudflare Access (login + sharing)

Zero Trust → Access → Applications → Add → Self-hosted:

- Application domain: the Worker's hostname (workers.dev or `app.DOMAIN`)
- Policy: Allow → Emails → your email(s). Add a friend's email here to share.
- Copy the **Application Audience (AUD) tag** and your team domain
  (`<team>.cloudflareaccess.com`), then:

```
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_APP_AUD
```

Until these two secrets exist the app runs in dev mode (single user, no login) — fine
locally, not for a public hostname.

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
| Domain | ~USD 10.50 / year |
| Claude Opus 5 tailoring, profile cached | cents per job |
