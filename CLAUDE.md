# ApplyForMe

Job-application assistant: paste a job description and get a tailored CV, cover letter and
recruiter briefing (.docx), plus company, salary and hiring-manager research. NZ/AU market;
dates are Pacific/Auckland.

## Stack and layout

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Prisma + SQLite · NextAuth v5
(PIN, Microsoft/Google OAuth, passkeys) · `docx` for document output.

- `src/app/` — pages; `src/app/api/` — route handlers (auth, analyze, research, profiles,
  applications, interviews, email, admin).
- `src/lib/` — job analysis (`job-analyzer.ts`), research scrapers, parsers, Anki export,
  auth helpers, moderation, `docx-generator.ts`.
- `prisma/schema.prisma`, `prisma/seed.ts`; `docs/PRD.md`, `docs/IMPLEMENTATION.md`.

## Commands

```bash
npm install
npx prisma db push          # sync schema to the local SQLite db
npx tsx prisma/seed.ts      # seed the local db
npm run dev                 # http://localhost:3000
npx tsc --noEmit            # typecheck (no test suite yet)
npm run build               # production build — run before declaring done
```

## Rules

- No automated tests exist: typecheck and build must pass, and exercise the changed page or
  route in `npm run dev` before declaring done.
- `src/middleware.ts` requires a session everywhere except `/login`, `/register`, `/welcome`
  and `/api/auth`; never widen that list. New routes also check role with `hasPermission`
  from `src/lib/auth-helpers.ts` (Admin/User/Viewer).
- `prisma/applyforme.db` is real local data and is gitignored. Ask before `prisma db push
  --force-reset`, `migrate reset`, deleting the db, or any bulk delete.
- Never read or commit `.env` / `.env.local`; add new variables to `.env.example` with no value.
- Ask before sending real email (`/api/email/send`, nodemailer) or scraping beyond a single
  test request.
- `.claude/settings.local.json` is personal and gitignored; shared permissions go in
  `.claude/settings.json`.
