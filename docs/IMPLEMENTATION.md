# ApplyForMe - Implementation Plan

## Architecture

```
src/
  app/                          # Next.js App Router pages
    api/                        # API routes (server-side)
      auth/                     # NextAuth + PIN/OAuth/Passkey/Recovery
      profiles/                 # Profile CRUD + file import
      analyze/                  # Job analysis engine
      research/                 # Company, salary, hiring manager research
      applications/             # Application history
      interviews/               # Interview notes CRUD
      admin/                    # User role management
      settings/                 # System reset
    login/                      # PIN + Passkey + OAuth login
    register/                   # Account creation
    welcome/                    # Public landing page with about
    profiles/                   # Profile list, edit, import wizard
    history/                    # Application history + detail
    settings/                   # Theme toggle + delete everything
    admin/                      # User management (ADMIN only)
  lib/                          # Shared business logic
    auth.ts                     # NextAuth configuration
    auth-helpers.ts             # PIN hashing, RBAC permissions
    db.ts                       # Prisma client singleton
    job-analyzer.ts             # Keyword matching + analysis engine
    docx-generator.ts           # CV, cover letter, briefing DOCX
    profile-loader.ts           # DB to UserProfile converter
    types.ts                    # All TypeScript interfaces
    webauthn.ts                 # WebAuthn registration/authentication
    parsers/                    # File import parsers
      index.ts                  # Router by file extension
      profile-extractor.ts      # Text to structured profile
    research/                   # Research modules
      company-researcher.ts     # Text analysis for company data
      salary-data.ts            # NZ/AU salary reference table
      hiring-manager-researcher.ts  # HM profile analysis
      briefing-generator.ts     # Combines research into briefing
      web-scraper.ts            # HTTP scraping + HTML parsing
  components/                   # Shared React components
    Sidebar.tsx                 # Navigation sidebar
    AuthGuard.tsx               # Role-based UI gating
    ThemeContext.tsx             # Dark/light mode provider
    ProfileContext.tsx           # Active profile context
    ProfileSelector.tsx         # Profile dropdown
  data/
    master-profile.json         # Seed data (Matt Harkness profile)
prisma/
  schema.prisma                 # Database schema
  seed.ts                       # Database seeder
  applyforme.db                 # SQLite database (generated)
```

## Database Schema

### Auth Models
- **Account**: OAuth provider links
- **Session**: Active sessions
- **VerificationToken**: Email recovery tokens
- **Authenticator**: WebAuthn passkey credentials

### App Models
- **User**: Profile + auth fields (name, email, PIN hash, role, lockout state)
- **CoreCompetency**: Ordered list per user
- **CareerEntry**: Job roles with title, company, dates
- **CareerHighlight**: Bullet points per career entry
- **CareerKeyword**: Searchable tags per career entry
- **Certification**: Name + year per user
- **PriorityBenefit**: Ranked benefit keywords per user
- **Application**: Saved analysis results with JSON blobs
- **InterviewNote**: Structured Q&A per application

## Implementation Phases (As Built)

### Phase 1: Foundation
- Next.js project setup with Tailwind CSS v4
- Prisma + SQLite database with full schema
- TypeScript interfaces for all data structures
- Matt Harkness profile seeded from ChatGPT export data
- Master profile JSON extracted from conversation history

### Phase 2: Core Engine
- Job analyzer: 12 keyword categories, evidence-based matching
- DOCX generator: CV, cover letter with dynamic evidence paragraphs
- Profile loader: DB records to UserProfile converter
- Analysis API route with application saving

### Phase 3: Multi-User & Auth
- NextAuth.js with PIN credentials provider
- OAuth providers (Microsoft Entra ID, Google)
- WebAuthn passkey registration and login
- RBAC middleware enforcing 3 roles on all routes
- Registration with auto-ADMIN for first user
- Email recovery with token-based PIN reset
- Rate limiting on PIN attempts

### Phase 4: Research & Briefing
- Web scraper: homepage discovery, page crawling, link analysis
- Company researcher: text extraction for industry, culture, WFH
- Salary reference table: 10+ NZ/AU tech roles
- Hiring manager researcher: LinkedIn + team page scraping
- Briefing generator combining all research
- Briefing DOCX with 7 sections

### Phase 5: Interview Workflow
- Structured question generator (5 categories, dynamic role-specific)
- Interview notes CRUD with DB persistence
- Post-call auto-populate (location, salary, hiring manager)
- HM research trigger on name entry

### Phase 6: Profile Management
- Profile CRUD API with max 10 enforcement
- File import: .docx, .xlsx, .json, .md, .txt parsing
- Profile extractor: section detection, date parsing, bullet extraction
- Inline editing: career history, highlights, keywords, certifications, competencies
- Priority benefits configuration

### Phase 7: UI & UX
- Sidebar navigation with role-based admin link
- Dark/light mode with localStorage persistence
- Welcome page with feature showcase and about
- Settings page with theme toggle and data deletion
- Admin user management with role dropdowns
- Application history with detail view and re-download

## Key Design Decisions

1. **Client-side DOCX generation**: Keeps document rendering instant, no server dependency
2. **SQLite over PostgreSQL**: Local-first, no server to manage, portable database file
3. **Prisma over raw SQL**: Parameterised queries (security), typed client (DX), migrations
4. **NextAuth.js v5**: Standard Next.js auth with multi-provider support, works local and cloud
5. **Keyword matching over LLM**: Deterministic, instant, no API costs, transparent evidence
6. **Web scraping over search APIs**: No API keys needed for basic research, graceful fallback
7. **Per-profile priority benefits**: Users define what matters to them, system checks every job

## Setup Instructions

```bash
# Install dependencies
npm install

# Create database and seed
npx prisma db push
npx tsx prisma/seed.ts

# Start dev server
npm run dev
```

Default login: `smharkness.nz@gmail.com` / PIN: `123456`

### Environment Variables (.env.local)
```
NEXTAUTH_SECRET=<random-32-char>
NEXTAUTH_URL=http://localhost:3000

# Optional: OAuth providers
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# WebAuthn
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=ApplyForMe
WEBAUTHN_ORIGIN=http://localhost:3000
```

## Future Enhancements

1. **LLM-powered analysis**: Use Claude API for deeper job description understanding
2. **PDF export**: Convert DOCX to PDF for direct submission
3. **Job board integration**: Fetch job descriptions from Seek, LinkedIn, Trade Me Jobs
4. **Email integration**: Send applications directly from the app
5. **Analytics dashboard**: Track application success rates, interview conversion
6. **Cloud deployment**: Vercel/Railway with PostgreSQL, Redis for sessions
7. **Mobile responsive**: Optimise for phone-based job searching
8. **Batch processing**: Analyse multiple jobs simultaneously
9. **AI cover letter enhancement**: Use LLM to improve prose quality
10. **Recruiter CRM**: Track recruiter relationships and follow-ups
