# ApplyForMe - Product Requirements Document

## Overview

ApplyForMe is an AI-powered CV and cover letter customisation platform that takes job descriptions from any source (URL, paste, document, recruiter email) and produces tailored application documents. It analyses job requirements against a candidate's career profile, generates match scoring with evidence, researches the target company, and prepares interview briefings — all outputting professional Word documents ready to send.

## Problem Statement

Job seekers with extensive careers (15-30+ years) face a repetitive, time-consuming process when applying for roles:
- Manually tailoring a CV for each application
- Writing unique cover letters that address specific job requirements
- Researching the target company's culture, WFH stance, and salary expectations
- Preparing for recruiter phone screens with relevant questions
- Tracking which version of their CV was sent where

This creates friction, delays applications, and results in generic documents that don't maximise the candidate's match to each role.

## Solution

A local-first web application that automates the entire application preparation workflow:

1. **Paste a job description** (from any source)
2. **Instant analysis** against the candidate's profile across 12 skill categories
3. **Tailored document generation** (CV, cover letter, recruiter briefing) as .docx
4. **Company research** via web scraping (homepage, about, team, careers, LinkedIn)
5. **Interview preparation** with structured questions and hiring manager research
6. **Priority benefits matching** to quickly assess if a role meets personal requirements

## Target Users

- Senior technology professionals (15+ years experience) in NZ/AU
- People managing multiple career profiles (e.g. targeting different role types)
- Up to 10 profiles per installation

## Core Features

### 1. Job Analysis Engine
- **Keyword extraction** across 12 categories: AI/ML, Cloud, Security, M365, DevOps, Leadership, Data, Product, Financial, Power Platform, Integration, Risk
- **Evidence-based matching**: every match cites specific career highlights, competencies, or certifications
- **Match scoring**: Strong (3+ evidence), Moderate (2), Weak (1), None (0)
- **Office location extraction**: detects NZ/AU cities, remote/hybrid patterns
- **Gap analysis**: identifies unmatched requirements

### 2. Document Generation
- **Tailored CV** (.docx): professional formatting, role-relevant competencies prioritised, career highlights reordered by relevance
- **Cover Letter** (.docx): dynamic paragraphs built from match evidence (not hardcoded templates)
- **Recruiter Briefing** (.docx): company snapshot, culture, WFH stance, salary comparison, hiring manager profile, alignment strategy, talking points

### 3. Company Research (Web Scraper)
- Discovers company homepage via TLD probing (.co.nz, .com, .com.au, etc.)
- Crawls homepage to find About, Team/Leadership, Careers pages via link analysis
- Falls back to direct path probing (/about, /team, /leadership, etc.)
- Extracts: industry, employee count, HQ, overview, culture signals, remote policy, Glassdoor rating, recent news
- Leadership extraction: detects name/title patterns from team pages
- LinkedIn company page scraping for supplementary data

### 4. Salary & Market Research
- Built-in NZ/AU salary reference table for 10+ tech leadership roles
- Ranges in local currency (NZD/AUD) with low/median/high
- Common benefits by market (KiwiSaver, Superannuation, health insurance, etc.)
- Market demand notes

### 5. Interview Preparation
- **Structured question generator**: 5 categories (Role Basics, Compensation, Role-Specific, Culture, Process)
- Role-specific questions generated dynamically based on matched categories
- Benefits questions reference the user's priority list
- **Editable answer fields**: fill in during/after the recruiter call
- **Auto-populate**: location answer updates analysis, salary answer adds to market comparison
- **Hiring manager research trigger**: entering a name triggers LinkedIn + company team page scraping

### 6. Hiring Manager Research
- LinkedIn public profile scraping
- Company team/leadership page cross-reference
- Theme/driver extraction: what topics they write/talk about
- Recommended approach: how to align your pitch to their priorities
- Included in briefing DOCX

### 7. Priority Benefits (Per-Profile)
- Configurable ranked list of benefit keywords (e.g. remote, KiwiSaver, health insurance)
- Keyword-searched across full job description text
- Green tick/red cross display with context sentence where found
- Included in briefing DOCX

### 8. Multi-Profile Management
- Up to 10 profiles per installation
- Each profile: personal info, executive summary, competencies, career history, certifications, priority benefits
- **File import**: .docx, .xlsx, .json, .md, .txt with structured extraction (section detection, date parsing, bullet extraction)
- Inline editing: all fields editable including career highlights and keywords

### 9. Application History
- Every analysis saved to database with full results
- Searchable by date, role, company, match percentage
- Detail view with re-download capability

## Authentication & Access Control

### Auth Methods
- **PIN login**: 6-digit numeric, bcrypt hashed, rate-limited (5 attempts = 15 min lockout)
- **OAuth**: Microsoft Entra ID + Google (configurable via .env.local)
- **Passkeys**: WebAuthn (Windows Hello, Touch ID, YubiKey)
- **Email recovery**: token-based PIN reset

### RBAC Roles
| Permission | ADMIN | USER | VIEWER |
|---|---|---|---|
| View own profile | Yes | Yes | Yes |
| Edit own profile | Yes | Yes | No |
| View all profiles | Yes | No | No |
| Delete profiles | Yes | No | No |
| Run analysis | Yes | Yes | No |
| Download documents | Yes | Yes | No |
| Manage users/roles | Yes | No | No |
| Import files | Yes | Yes | No |
| Delete all data | Yes | No | No |

### Admin Features
- User management page: change roles, view all users
- Settings: delete everything (requires typing "DELETE" to confirm)
- First registered user auto-promoted to ADMIN

## Non-Functional Requirements

### Security
- Parameterised queries via Prisma (SQL injection safe)
- HTTP-only session cookies with CSRF protection
- PIN bcrypt hashed (cost factor 12)
- WebAuthn challenge stored server-side with 60s expiry
- Recovery tokens single-use, 1-hour expiry
- All API routes validate session + role before processing
- Profile data filtered by ownership unless ADMIN

### Performance
- Client-side DOCX generation (no server round-trip for document rendering)
- Parallel page fetching during web scraping
- 8-second timeout on external HTTP requests
- SQLite database (no external server dependency)

### Deployment
- Local-first: runs on localhost, no cloud dependency
- Cloud-ready: just update environment variables for OAuth, email, WebAuthn origin
- SQLite portable database file

## Technical Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | SQLite via Prisma 6 |
| Auth | NextAuth.js v5 (Auth.js) |
| Documents | docx npm package |
| File parsing | mammoth (docx), xlsx (SheetJS) |
| WebAuthn | @simplewebauthn/server v9 |
| Scraping | Native fetch with HTML parsing |

---

> **Superseded 2026-09-13.** This is the v1 product document, kept for history. The
> v2 pipeline design is in [ARCHITECTURE.md](ARCHITECTURE.md).
