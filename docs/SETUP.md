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

## 5. Email — sending (Cloudflare Email Service) — records published

Dashboard → Email → **Email Service** → Sending → add `applyforme.dev`. Cloudflare adds the
`cf-bounce` MX/SPF/DKIM/DMARC records itself because DNS is on Cloudflare. Wait for
"Verified". The Worker already declares `"send_email": [{ "name": "EMAIL" }]`.

Sanity check after deploy: the UI's Settings page has a "Send test email" button.

## 6. Email — receiving (Email Routing → Worker) — done, proven live

Dashboard → Email → **Email Routing** on `applyforme.dev` → Get started → let it add MX/SPF.
Then Routing rules → Create address:

- Custom address: `jobs`
- Action: **Send to a Worker** → `applyforme`

## 7. Gmail → jobs@applyforme.dev — done (address verified, Seek filter active)

In the Gmail that receives the Seek alerts:

1. Settings → Forwarding → **Add a forwarding address** → `jobs@applyforme.dev`. Gmail sends a
   confirmation code to that address. The Worker logs it and shows it on the Settings
   page under "Forwarding confirmation" (it recognises Gmail's confirmation email).
   Enter the code in Gmail.
2. Create a filter: `from:(seek.co.nz)` (or `subject:(job alert)`) → **Forward to**
   `jobs@applyforme.dev`. Optionally also "Skip inbox" so the raw alerts stop cluttering Gmail;
   the review email is what you read.

Every matching alert now wakes the Worker within seconds.

## 8. Cloudflare Access (login + sharing) — done 2026-09-19

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
  vars in `apps/web/wrangler.jsonc`, then `npm run deploy` again. Two applications
  exist: "ApplyForMe" (host, Allow policies — its AUD is the one in the config) and
  "ApplyForMe action links" (path `api/runs/*/action`, Bypass — its AUD is unused).
  Never put a Bypass policy on the host application: Bypass beats Allow.

While the placeholders are in place every UI/API request returns 401 — the deployed app
is never open in single-user mode. The email and cron handlers do not use identity, so
the pipeline itself is unaffected. Locally, `.dev.vars` sets both empty, which turns on
the single-user dev fallback.

## 9. Seed your profile and rules

Open the app → Profile → paste/import the master profile (v1's JSON works as-is) →
Rules → set keywords, preferred titles/companies, exclusions, minimum match. Save.
Preferences → add whole CVs / cover letters as **exemplars** so tailoring copies your voice.

Note on preferred titles: a title hit ("head of", "director", …) bypasses the minimum
match, so an off-target "Head of Retention" still gets a pack. Add such words to
*excluded terms* as they show up.

## 10. Job pages: what the Worker can and cannot read — and the Apify fallback

Findings from the live Worker (probed 2026-09-26 with `/api/admin/probe`), so nobody
re-discovers them:

| Source | Direct read from the Worker | Without Apify the pipeline uses |
|---|---|---|
| Seek job page `www.seek.co.nz/job/<id>` (JobMail alert links carry the id) | **403** — Seek blocks Cloudflare egress on every host, search API included | the alert snippet |
| Seek **recommendation** emails (`email.s.seek.co.nz/uni/ss/c/…` tracked links; no id anywhere in the email) | **403** on the tracking domain, so the redirect never resolves | the card snippet (title, company, location, 3 bullets); dedupe keyed on title+company |
| LinkedIn `linkedin.com/jobs/view/<id>` and the guest `jobs-guest/jobs/api/jobPosting/<id>` endpoint | **429** on both | the pasted text |

So without a third party the packs are built from snippets, and the Seek Apply link is
the tracked email link. **With Apify** the Worker gets the real page: full ad text,
JSON-LD title/company/salary, and (for tracked links) the canonical
`seek.co.nz/job/<id>` URL as the Apply link.

**Enable it** (one secret; the account's default plan is enough for a few jobs a day):

```
cd apps/web
printf '%s' '<your apify token>' | npx wrangler secret put APIFY_TOKEN
```

Defaults (`server/fetch/apify.ts`): actor `apify/cheerio-scraper`, one page, no crawl,
**residential** Apify proxy (datacenter IPs get the same 403/429 the Worker does), a page
function that returns the HTML plus the URL finally loaded. Cost is the actor's compute
(seconds) plus residential proxy traffic (~0.5 MB per page) — well under a cent a job.
If your Apify plan has no residential proxy access, set `APIFY_INPUT` in `wrangler.jsonc`
to the same JSON without `"apifyProxyGroups":["RESIDENTIAL"]` and see whether the
datacenter pool gets through. Any other actor works too: set `APIFY_ACTOR` and an
`APIFY_INPUT` template (`{{url}}` / `{{id}}` are substituted); a job-detail actor's first
dataset item is mapped heuristically (title / company / location / salary / the longest
`…desc…` field) when it has no `html` field.

**Probe a URL without running the pipeline** (needs `ADMIN_TOKEN`; rotate it each time):

```
curl -sS -X POST https://app.applyforme.dev/api/admin/probe \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"url":"https://www.linkedin.com/jobs/view/4460776154/","mode":"fetch"}'   # or "resolve" / "apify"
```

Note: Cloudflare also rejects requests to `*.workers.dev` from clients with a bare
`Python-urllib` user agent (403 before the Worker runs); send any other `User-Agent`.

**Manual path that always works:** Runs → *Analyse a job link* → paste the URL, the ad
text, and (optionally) title + company. The same fields are accepted by
`POST /api/admin/run-url` for scripted use.

## 11. Local development

```
cp apps/web/.dev.vars.example apps/web/.dev.vars   # fill ANTHROPIC_API_KEY, optional APIFY_TOKEN
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
