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
