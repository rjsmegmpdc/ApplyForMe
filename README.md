# ApplyForMe

Reads the Seek.co.nz job alerts you already get, decides which ones are worth your
time, tailors your CV and cover letter to each with Claude, and emails you the pack
with the **Apply on Seek** link. You review and decide. The web app is for tuning the
system, not running it.

Everything runs on Cloudflare (Workers Paid, D1, R2, Email Routing, Email Service,
Access) in one Worker. Design record: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Setup: [docs/SETUP.md](docs/SETUP.md).

## How a job flows

1. A Gmail filter forwards each Seek alert to `jobs@<your domain>`.
2. Email Routing hands it to this Worker. The alert is parsed into listings and deduped.
3. **Trigger rules** (keywords, preferred and excluded companies, locations, salary
   floor, minimum match) decide whether the job earns any LLM spend.
4. The full ad is fetched and scored against your master profile with evidence.
5. Claude rewrites your summary, reorders your highlights, and drafts the letter.
   A **claim guard** checks every employer, title, bullet, number, year and
   certification against your profile. One repair pass is allowed; otherwise the
   deterministic documents are sent and clearly labelled.
6. You get one email: score, evidence, Apply link, CV and letter attached, and
   one-click links for *Applied*, *Not for me*, *Regenerate with a note*, *Thumbs up*.
7. Your feedback becomes preferences that steer the next pack.

## Layout

```
packages/engine/   Pure TypeScript, zero I/O — analyse, parse, rules, claim guard, salary
apps/web/          Next.js 15 on Cloudflare Workers (OpenNext) — server, pipeline, UI
  server/          db (Drizzle/D1), identity (Access), ai, email, docs, pipeline
  app/             UI (runs, profile, rules, preferences, settings) + API routes
  worker.ts        fetch (Next) + email (Email Routing) + scheduled (cron) handlers
docs/              ARCHITECTURE.md, SETUP.md, and the v1 PRD/plan for history
```

## Commands

```bash
npm install
npm test                 # vitest — engine + web (277 tests)
npm run typecheck        # tsc — engine + web
npm run dev              # next dev with miniflare-backed D1/R2
npm run deploy           # opennextjs-cloudflare build && deploy
```

Engine ground rules (same as AICoach): no `fetch`, `fs`, `Date.now()` or `Math.random()`
in logic paths; every figure in any output traces to an input; same inputs, same output.

## Status

v2 foundation (2026-09-13): engine, server layer, pipeline and tuning UI built and
tested; domain applyforme.dev secured (2026-09-14); not yet deployed. Next: docs/SETUP.md
steps 2–9, then the first live alert.
The v1 app (local Next/Prisma with NextAuth, research, interviews, Anki) is retired;
its history is in git before the "Scaffold v2 workspace" commit.
