# ApplyForMe

AI-powered CV and cover letter customiser for job applications.

Paste a job description, get a tailored CV, cover letter, and recruiter briefing in seconds. Includes company web scraping, salary benchmarks, interview preparation, and hiring manager research.

## Features

- **Job Analysis**: 12-category keyword matching with evidence-based scoring
- **3 Document Outputs**: Tailored CV, cover letter, recruiter briefing (.docx)
- **Company Research**: Web scraper finds homepage, about, team, careers pages
- **Salary Data**: NZ/AU ranges for 10+ tech leadership roles
- **Interview Prep**: Structured questions with post-call auto-populate
- **Hiring Manager Research**: LinkedIn + company team page analysis
- **Priority Benefits**: Configurable ranked benefits matched against job descriptions
- **Multi-Profile**: Up to 10 profiles with file import (.docx, .xlsx, .json, .md, .txt)
- **Auth**: PIN, OAuth (Microsoft/Google), Passkeys (WebAuthn), RBAC (Admin/User/Viewer)
- **Dark Mode**: Full dark/light theme with persistence

## Quick Start

```bash
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Open http://localhost:3000 and login with `smharkness.nz@gmail.com` / PIN: `123456`

## End-to-end tests

Browser tests live in `e2e/` and use [Playwright](https://playwright.dev) (Chromium).

```bash
npm install
npx playwright install chromium   # first time only, if you don't already have Playwright's Chromium
npm run test:e2e                  # headless run of the whole suite
npm run test:e2e:ui               # interactive UI mode
npm run test:e2e:report           # open the last HTML report (playwright-report/)
npx playwright test e2e/questions.spec.ts   # a single spec
```

`npm run test:e2e` needs no extra setup:

- **Isolated database**: it creates a fresh SQLite file at `e2e/.tmp/e2e.db` (via `e2e/support/prepare-db.mjs`) and starts `next dev` on port **3100** with `DATABASE_URL` pointing at it. `src/lib/db.ts` honours `DATABASE_URL` when set, so your `prisma/applyforme.db` is never touched. Each run reseeds from scratch.
- **Test accounts** (seeded from `e2e/support/users.json`, test-only PINs): `admin@e2e.test` / `111111` (ADMIN), `user@e2e.test` / `222222` (USER), `viewer@e2e.test` / `333333` (VIEWER), plus `lockout@` and `recover@` accounts for the lockout and PIN-recovery tests. `e2e/auth.setup.ts` signs each role in through the real PIN login form once and saves the session to `e2e/.auth/`.
- **External services** are not contacted: OAuth and SMTP env vars are blanked (email goes to the console transport), and the two endpoints that scrape third-party sites (`/api/research/company`, `/api/research/hiring-manager`) are stubbed in the browser by `e2e/analyse.spec.ts`.
- `e2e/destructive.spec.ts` ("Delete Everything") runs last, as its own Playwright project.
- Tests marked `test.fail()` document known app bugs; each has a comment explaining it. When a bug is fixed, that test starts "unexpectedly passing": remove the `.fail` then.
- Set `E2E_SERVER_LOGS=1` to see the Next.js server output, `E2E_PORT` to use a different port, or `E2E_CHROMIUM_PATH` to point at a specific Chromium binary.

## Tech Stack

Next.js 16 | TypeScript | Tailwind CSS v4 | Prisma + SQLite | NextAuth.js v5 | docx

## Docs

- [Product Requirements Document](docs/PRD.md)
- [Implementation Plan](docs/IMPLEMENTATION.md)

## Current Position

Snapshot: 2026-05-21

- Branch: `master`, clean except for `.claude/settings.local.json`
- Last commit: 2026-04-14 — *Add custom questions with moderation, desired outcomes, and admin curation*
- Recent files: `prisma/applyforme.db` (2026-04-14), `src/app/questions/page.tsx`
- State: feature-complete pass; idle since mid-April
- Note: overlap with `Strava-Weekly-Analysis_App\ideas.txt` (job-market scraping) — decide one home before both grow
