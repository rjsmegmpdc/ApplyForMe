/**
 * Claim guard — validates Claude's tailored CV/letter output against the
 * user's master profile and the job ad. The engine owns facts, the LLM
 * owns language: it may reorder and reword, but never invent employers,
 * titles, dates, certifications or numbers. Four checks, all literal /
 * token-trace, none semantic:
 *
 *  - Roles & companies: every highlights[] block must name a company and
 *    title from career_history (normalised, containment allowed).
 *  - Highlights: every bullet must trace to one of that role's profile
 *    highlights — content-word containment ≥ HIGHLIGHT_THRESHOLD against a
 *    single highlight, or against the executive summary + core competencies
 *    (for summary-ish bullets). Rewording is fine; inventing is not.
 *  - Numbers: every numeric token in summary, bullets and letter must
 *    appear in profileFactsText(profile) or the job text (commas / "~" /
 *    "k" / "m" normalised, compared by value). Absent years → unknown-year,
 *    anything else → untraceable-number.
 *  - Certifications: a cert-looking phrase must share at least one
 *    significant token with a profile certification or competency.
 *
 * The guard never modifies text; it only reports. profileFactsText() is
 * both the prompt's fact sheet and the source the guard traces against, so
 * a number the model was shown is by construction a number it may repeat.
 * Pure and deterministic.
 */

import type { UserProfile, CareerRole } from '../types';
import { normaliseCompany } from '../rules/trigger';

export interface TailoredOutput {
  /** 3–5 sentence tailored executive summary. */
  summary: string;
  /** Reordered / reworded highlights per role. */
  highlights: { role: string; company: string; bullets: string[] }[];
  coverLetter: { paragraphs: string[] };
}

export type ClaimViolationKind =
  | 'unknown-role'
  | 'unknown-company'
  | 'fabricated-highlight'
  | 'untraceable-number'
  | 'unknown-certification'
  | 'unknown-year';

export interface ClaimViolation {
  kind: ClaimViolationKind;
  /** The offending text (a bullet, a number token, a cert phrase…). */
  text: string;
  /** Human-readable explanation including where it was found. */
  detail: string;
}

export interface ClaimGuardResult {
  ok: boolean;
  violations: ClaimViolation[];
}

/** Fraction of a bullet's content words that must appear in one profile highlight. */
export const HIGHLIGHT_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Fact sheet
// ---------------------------------------------------------------------------

/**
 * Deterministic plain-text rendering of the profile: name, years of
 * experience, executive summary, competencies, every role with dates,
 * highlights and keywords, and every certification with its year. Contact
 * details are deliberately left out — they are not tailoring facts and do
 * not belong in the prompt.
 */
export function profileFactsText(profile: UserProfile): string {
  const lines: string[] = [];
  lines.push(`Name: ${profile.personal.name}`);
  lines.push(`Years of experience: ${profile.personal.years_experience}`);
  lines.push('');
  lines.push('Executive summary:');
  lines.push(profile.executive_summary);
  lines.push('');
  lines.push('Core competencies:');
  for (const c of profile.core_competencies) lines.push(`- ${c}`);
  lines.push('');
  lines.push('Career history:');
  for (const role of profile.career_history) {
    lines.push(`${role.title} — ${role.company} (${role.location}), ${role.start_date} – ${role.end_date}`);
    for (const h of role.highlights) lines.push(`- ${h}`);
    if (role.keywords.length > 0) lines.push(`Keywords: ${role.keywords.join(', ')}`);
    lines.push('');
  }
  lines.push('Certifications and training:');
  for (const cert of profile.certifications_and_training) lines.push(`- ${cert.name} (${cert.year})`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tokenising helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'about', 'above', 'across', 'after', 'again', 'against', 'along', 'also', 'among', 'another',
  'around', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'could', 'does',
  'doing', 'down', 'during', 'each', 'every', 'from', 'further', 'have', 'having', 'here', 'into',
  'itself', 'just', 'more', 'most', 'much', 'must', 'once', 'only', 'other', 'over', 'same',
  'should', 'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'under', 'until', 'very', 'were', 'what', 'when', 'where', 'which',
  'while', 'will', 'with', 'within', 'without', 'would', 'your', 'yours', 'well', 'able', 'across',
  'strong', 'proven', 'track', 'record', 'highly', 'successfully', 'including', 'various', 'wide',
  'range', 'role', 'roles', 'team', 'teams', 'work', 'working', 'experience', 'experienced',
]);

/**
 * Light stemmer so "designed"/"design", "rollouts"/"rollout",
 * "governing"/"govern" collide. Deliberately crude: a full stemmer would
 * over-merge and the threshold already tolerates a few misses.
 */
function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 6 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

/** Lowercased, stopword-free, stemmed content words (≥ 4 chars before stemming). */
function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

function containment(needle: Set<string>, haystack: Set<string>): number {
  if (needle.size === 0) return 1;
  let hit = 0;
  for (const w of needle) if (haystack.has(w)) hit += 1;
  return hit / needle.size;
}

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function companiesMatch(a: string, b: string): boolean {
  const na = normaliseCompany(a);
  const nb = normaliseCompany(b);
  if (na.length === 0 || nb.length === 0) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 3 && long.includes(short);
}

function titlesMatch(a: string, b: string): boolean {
  const na = normaliseTitle(a);
  const nb = normaliseTitle(b);
  if (na.length === 0 || nb.length === 0) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Numeric-token grammar: thousands-grouped or plain integers, optional
 * decimal, optional "%" or k/m suffix ("4,000", "23%", "150k", "$2m").
 * A k/m directly followed by another letter ("10km") is not a suffix.
 */
const NUMBER_RE = /\d+(?:,\d{3})*(?:\.\d+)?(?:%|[km](?![\p{L}]))?/giu;

interface NumericToken {
  raw: string;
  core: string;
  value: number;
  isYear: boolean;
}

function parseNumericToken(raw: string): NumericToken {
  const lower = raw.toLowerCase();
  const suffix = lower.endsWith('%') || lower.endsWith('k') || lower.endsWith('m') ? lower.slice(-1) : '';
  const core = (suffix ? lower.slice(0, -1) : lower).replace(/,/g, '');
  let value = Number(core);
  if (suffix === 'k') value *= 1_000;
  else if (suffix === 'm') value *= 1_000_000;
  const isYear = suffix === '' && /^(?:19|20)\d{2}$/.test(core);
  return { raw, core, value, isYear };
}

function extractNumerics(text: string): NumericToken[] {
  return [...text.matchAll(NUMBER_RE)].map((m) => parseNumericToken(m[0]));
}

// ---------------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------------

/**
 * Phrases that look like a certification claim. Generic trigger words
 * (certified / certification / certificate) plus well-known names. Bare
 * "Agile" is intentionally NOT a trigger — it is far more often a way of
 * working than a credential; "Agile certification" is still caught by the
 * generic pattern.
 */
const CERT_NAME_RE =
  /\b(?:certified|certifications?|certificate|itil|prince2|cissp|cism|lean\s+six\s+sigma|six\s+sigma|green\s+belt|black\s+belt|aws\s+certified|cobit|togaf|scrum\s+master)\b/gi;
/** Case-sensitive acronyms / exam codes — lowercase "pmp"/"csm" in prose are not credentials. */
const CERT_CODE_RE = /\b(?:PMP|CSM|AZ-\d+|MS-\d+|SC-\d+)\b/g;

/** Trigger words that must not, on their own, count as overlap with a profile cert. */
const CERT_GENERIC = new Set(['certified', 'certification', 'certifications', 'certificate']);
/** Three-letter function words — the cert tokeniser keeps 3-letter acronyms (PMP, CSM, ISO) so needs its own short stoplist. */
const SHORT_STOPWORDS = new Set(['and', 'the', 'for', 'has', 'had', 'was', 'are', 'our', 'its', 'his', 'her', 'who', 'via', 'per', 'not', 'but', 'all', 'any', 'can', 'out', 'one', 'two', 'six', 'ten', 'you', 'now', 'new', 'own', 'led', 'got', 'get']);

function certTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu)) {
    const w = m[0];
    if (w.length < 3 || STOPWORDS.has(w) || SHORT_STOPWORDS.has(w) || CERT_GENERIC.has(w)) continue;
    out.add(w);
  }
  return out;
}

/** ±`radius` words around a match, as a phrase. */
function windowAround(text: string, index: number, length: number, radius: number): string {
  const before = text.slice(0, index).split(/\s+/).filter(Boolean).slice(-radius);
  const after = text
    .slice(index + length)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, radius);
  return [...before, text.slice(index, index + length), ...after].join(' ');
}

function findCertPhrases(text: string): string[] {
  const phrases: string[] = [];
  for (const re of [CERT_NAME_RE, CERT_CODE_RE]) {
    for (const m of text.matchAll(re)) phrases.push(windowAround(text, m.index!, m[0].length, 4));
  }
  return phrases;
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

interface Located {
  where: string;
  text: string;
}

function allProse(output: TailoredOutput): Located[] {
  const out: Located[] = [{ where: 'summary', text: output.summary }];
  output.highlights.forEach((h, i) => {
    h.bullets.forEach((b, j) => out.push({ where: `highlights[${i}] (${h.company}) bullet ${j + 1}`, text: b }));
  });
  output.coverLetter.paragraphs.forEach((p, i) => out.push({ where: `cover letter paragraph ${i + 1}`, text: p }));
  return out;
}

/** Validate tailored output against the profile and job text. Reports; never edits. */
export function checkClaims(output: TailoredOutput, profile: UserProfile, jobText: string): ClaimGuardResult {
  const violations: ClaimViolation[] = [];
  const seen = new Set<string>();
  const report = (v: ClaimViolation): void => {
    const key = `${v.kind}|${v.text}|${v.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(v);
  };

  const facts = profileFactsText(profile);
  const summaryPool = contentWords(`${profile.executive_summary}\n${profile.core_competencies.join('\n')}`);

  // --- Roles, companies, highlights ---------------------------------------
  output.highlights.forEach((block, i) => {
    const where = `highlights[${i}]`;
    const byCompany = profile.career_history.filter((r) => companiesMatch(r.company, block.company));
    if (byCompany.length === 0) {
      report({
        kind: 'unknown-company',
        text: block.company,
        detail: `${where}: company "${block.company}" is not in the profile's career history`,
      });
      return;
    }
    const roles: CareerRole[] = byCompany.filter((r) => titlesMatch(r.title, block.role));
    if (roles.length === 0) {
      report({
        kind: 'unknown-role',
        text: block.role,
        detail: `${where}: title "${block.role}" does not match any role at ${byCompany[0].company} (profile has: ${byCompany
          .map((r) => `"${r.title}"`)
          .join(', ')})`,
      });
      return;
    }
    const highlightSets = roles.flatMap((r) => r.highlights.map((h) => contentWords(h)));
    block.bullets.forEach((bullet, j) => {
      const words = contentWords(bullet);
      if (words.size === 0) return;
      const best = Math.max(0, ...highlightSets.map((h) => containment(words, h)));
      if (best >= HIGHLIGHT_THRESHOLD) return;
      if (containment(words, summaryPool) >= HIGHLIGHT_THRESHOLD) return;
      report({
        kind: 'fabricated-highlight',
        text: bullet,
        detail: `${where} bullet ${j + 1}: "${truncate(bullet)}" does not trace to any ${
          roles[0].company
        } highlight in the profile (best overlap ${Math.round(best * 100)}%, need ${Math.round(
          HIGHLIGHT_THRESHOLD * 100
        )}%)`,
      });
    });
  });

  // --- Numbers -------------------------------------------------------------
  const allowedCores = new Set<string>();
  const allowedValues = new Set<number>();
  for (const t of extractNumerics(`${facts}\n${jobText}`)) {
    allowedCores.add(t.core);
    if (Number.isFinite(t.value)) allowedValues.add(t.value);
  }
  const prose = allProse(output);
  for (const { where, text } of prose) {
    for (const t of extractNumerics(text)) {
      if (allowedCores.has(t.core) || allowedValues.has(t.value)) continue;
      if (t.isYear) {
        report({
          kind: 'unknown-year',
          text: t.raw,
          detail: `${where}: year "${t.raw}" does not appear in the profile or the job ad`,
        });
      } else {
        report({
          kind: 'untraceable-number',
          text: t.raw,
          detail: `${where}: number "${t.raw}" does not appear in the profile or the job ad`,
        });
      }
    }
  }

  // --- Certifications ------------------------------------------------------
  const profileCertPool = certTokens(
    [...profile.certifications_and_training.map((c) => c.name), ...profile.core_competencies].join('\n')
  );
  for (const { where, text } of prose) {
    for (const phrase of findCertPhrases(text)) {
      const tokens = certTokens(phrase);
      let overlap = false;
      for (const tok of tokens) {
        if (profileCertPool.has(tok)) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      report({
        kind: 'unknown-certification',
        text: phrase,
        detail: `${where}: "${phrase}" looks like a certification claim but matches no certification or competency in the profile`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * A user-turn message for the repair pass: lists every violation and tells
 * the model to fix ONLY those, keep everything else identical, and return
 * the same JSON shape.
 */
export function buildRepairInstruction(violations: ClaimViolation[]): string {
  const lines: string[] = [];
  const n = violations.length;
  lines.push(
    `Your previous output failed fact validation against the candidate's master profile with ${n} issue${
      n === 1 ? '' : 's'
    }. Fix ONLY the issues listed below. Keep every other sentence, bullet and paragraph exactly as it was, in the same order.`
  );
  lines.push('');
  violations.forEach((v, i) => {
    lines.push(`${i + 1}. [${v.kind}] "${v.text}" — ${v.detail}`);
  });
  lines.push('');
  lines.push('Rules for the fix:');
  lines.push('- Use only facts from the profile fact sheet and the job ad; do not introduce any new employer, title, date, number or certification.');
  lines.push('- For a fabricated highlight, replace it with a reworded version of a real highlight from that role, or remove it.');
  lines.push('- For an untraceable number or year, remove the figure or replace it with one from the fact sheet.');
  lines.push('- For an unknown certification, remove the claim unless it appears in the fact sheet.');
  lines.push('- For an unknown company or role, use the exact company name and title from the fact sheet.');
  lines.push('');
  lines.push('Return the complete corrected output as JSON with exactly the same shape: { "summary": string, "highlights": [{ "role": string, "company": string, "bullets": string[] }], "coverLetter": { "paragraphs": string[] } }. No commentary.');
  return lines.join('\n');
}
