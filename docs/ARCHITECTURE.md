# ApplyForMe v2 — Architecture

**Decided:** 2026-09-13 (Matt, with Claude Code). Supersedes the v1 PRD/implementation
plan for the pipeline; v1's research/interview/Anki features are retired (history in
`git log` before the "Scaffold v2 workspace" commit).

## The goal, in one line

Seek.co.nz alert lands in Gmail → the job is read, judged against Matt's rules, and a
tailored CV + cover letter arrives back by email with the **Apply on Seek** link — Matt
reviews and decides. The UI exists to *tune* the system (profile, rules, tone), not to
run it.

## Principle carried over from AICoach

**The engine owns facts; the LLM owns language.** Everything numeric or factual in the
CV and letter traces to the master profile or the job ad. The claim guard
(`packages/engine/src/validate/claim-guard.ts`) checks every employer, title, bullet,
number, year and certification in the model's output; one repair prompt is allowed;
on second failure the deterministic documents (v1's keyword-based generator) are sent
instead, marked as such. A hallucinated CV claim reaching a recruiter is the one failure
this system is designed never to allow.

## Runtime shape (all Cloudflare, one Worker)

```
Gmail filter ──forward──▶ jobs@<domain>  (Email Routing → "Send to a Worker")
                                │
                                ▼
                     worker.ts  email()  ──▶ server/pipeline/inbound-handler
                                                │  parse alert → JobListing[]
                                                │  dedupe (processed_emails, runs.seekJobId)
                                                │  trigger rules (engine/rules) — no LLM spend on skips
                                                │  fetch full ad (Seek page) → engine/parse/seek-page
                                                │  analyse (engine/analyze) → evidence
                                                │  tailor (server/ai/tailor: Claude, structured JSON)
                                                │  claim guard → repair once → fallback
                                                │  DOCX (server/docs) → R2 (DOCS bucket)
                                                │  review email (Email Service, env.EMAIL.send)
                                                ▼
                                   Matt's inbox: score, evidence, Apply link,
                                   CV + letter attached, one-click action links
                                                │
                     worker.ts  fetch()  ◀──────┘  (Next.js app behind Cloudflare Access)
                       /api/runs/:id/action?a=applied|rejected|regenerate  (signed links)
                       UI: runs inbox · profile · rules · preferences · LLM key
                     worker.ts  scheduled()  — every 30 min: retry pending runs, expire dedupe rows
```

| Concern | Choice | Why |
|---|---|---|
| Hosting | Workers Paid (already subscribed) via OpenNext | One deployable; same as AICoach |
| Data | D1 + Drizzle | Same as AICoach; migrations in repo |
| Files | R2 `applyforme-docs` | Re-download from UI; email links |
| Inbound mail | Email Routing → Worker | Free, no Gmail OAuth, no polling |
| Outbound mail | Cloudflare Email Service (`send_email` binding) | Included in Workers Paid (3,000/month). Beta — behind a one-file seam (`server/email/send.ts`) so Resend can replace it |
| Auth | Cloudflare Access (Zero Trust, already active) | Sharing = an Access policy; identity code ported from AICoach |
| LLM | Claude via the Messages API, `claude-opus-5` default | Personal key (encrypted at rest) beats server key; per-day cap |
| Domain | New `.com` from Cloudflare Registrar | At-cost; DNS already on Cloudflare; keeps harkness.net.nz's family mail untouched |

## What was kept from v1 (ported, pure)

- 12-category keyword analyser with evidence → `packages/engine/src/analyze`
- Seek alert parser and job-page extractor → `packages/engine/src/parse`
- Salary reference table → `packages/engine/src/salary`
- DOCX CV/letter generator → `apps/web/server/docs` (server-side)
- Profile shape and priority benefits → `packages/engine/src/types.ts`

## What was dropped

NextAuth, PIN login, passkeys, RBAC (Access replaces all of it); Prisma/SQLite;
nodemailer; company/hiring-manager research, interview notes, Anki, recruiter CRM,
analytics, batch page. None of these are in the pipeline's critical path.

## The tuning loop

Every review email carries signed one-click links. *Applied* records the outcome.
*Not for me* asks for a one-line reason and stores it as a preference. *Regenerate with
a note* stores the note and re-runs tailoring. Preferences (tone, avoid, emphasise,
notes) are injected into the tailoring prompt, so the packs improve with use.

## Repo layout

```
packages/engine/   pure TypeScript, zero I/O — analyse, parse, rules, validate, salary
apps/web/          Next.js 15 (OpenNext) + Worker handlers
  server/          db (Drizzle), identity (Access), ai, email, docs, pipeline
  app/             UI + API routes
docs/              this file, SETUP.md, the v1 PRD/plan for history
```

## Commands

```
npm install
npm test                 # vitest, engine + web
npm run typecheck        # tsc, engine + web
npm run dev              # next dev with miniflare-backed D1/R2
npm run deploy           # opennextjs-cloudflare build && deploy
```
