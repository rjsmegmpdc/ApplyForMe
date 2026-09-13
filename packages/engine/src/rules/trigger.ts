/**
 * Trigger rules — the gate between "a job arrived" and "spend LLM tokens on
 * it". Given a parsed job (title, company, location, salary text, ad text)
 * and the deterministic match percentage from the analyser, decide whether
 * to process or skip, and say why in plain words so the review email / log
 * can show the reasoning.
 *
 * Evaluation order (first hit wins for skips):
 *   1. excluded company            → skip
 *   2. excluded term in title/text → skip
 *   3. location rule not satisfied → skip
 *   4. parsed salary below minimum → skip (unparseable salary never skips)
 *   5. preferred company           → process (ignores keywords and match %)
 *   6. keywordsAll not all present → skip
 *   7. keywordsAny set, no hit     → skip
 *   8. match % below minimum       → skip
 *   9. otherwise                   → process
 *
 * Pure and deterministic: no I/O, no clock, no randomness.
 */

export interface TriggerRules {
  /** Any of these (case-insensitive substring, word-boundary aware) in title+description → keyword hit. */
  keywordsAny: string[];
  /** All of these must be present (optional, default []). */
  keywordsAll: string[];
  /** Company names that always process, even with no keyword hit (excludes still win). */
  preferredCompanies: string[];
  excludedCompanies: string[];
  /** Terms in title/description that always skip (e.g. "graduate", "contract"). */
  excludedTerms: string[];
  /** Allowed locations (substring match, e.g. "Auckland", "Remote"); empty = any. */
  locations: string[];
  /** Minimum salary (NZD/yr) if a salary can be parsed from the ad; unparseable → not a reason to skip. */
  minSalary: number | null;
  /** Minimum deterministic match percentage to proceed to LLM tailoring (0–100). */
  minMatchPercentage: number;
}

export const DEFAULT_TRIGGER_RULES: TriggerRules = {
  keywordsAny: [],
  keywordsAll: [],
  preferredCompanies: [],
  excludedCompanies: [],
  excludedTerms: ['graduate', 'intern', 'junior'],
  locations: [],
  minSalary: null,
  minMatchPercentage: 40,
};

export interface TriggerInput {
  title: string;
  company: string;
  location: string;
  /** Salary text as shown in the ad / alert (may be empty or "Competitive"). */
  salary: string;
  /** Full ad text (or the alert snippet before the ad is fetched). */
  text: string;
  /** Deterministic match percentage from the analyser; null when not yet computed. */
  matchPercentage: number | null;
}

export interface TriggerDecision {
  decision: 'process' | 'skip';
  reasons: string[];
  keywordHits: string[];
  preferredCompany: boolean;
  parsedSalary: { min: number | null; max: number | null } | null;
}

export interface ParsedSalaryRange {
  min: number | null;
  max: number | null;
}

/**
 * Normalise a company name for comparison: lowercase, drop "new zealand",
 * the words "ltd" / "limited" / "nz", all punctuation and whitespace.
 * "One NZ (formerly Vodafone NZ)" → "oneformerlyvodafone";
 * "Datacom Systems Ltd" → "datacomsystems".
 */
export function normaliseCompany(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\bnew zealand\b/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && w !== 'ltd' && w !== 'limited' && w !== 'nz');
  return words.join('');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary-aware, case-insensitive term test. Uses lookarounds rather
 * than \b so terms that start or end with a non-word character ("C#",
 * ".NET", "M365") still get a clean edge check.
 */
export function containsTerm(haystack: string, term: string): boolean {
  const t = term.trim();
  if (t.length === 0) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(t)}(?![\\p{L}\\p{N}])`, 'iu');
  return re.test(haystack);
}

const HOURLY_OR_DAILY_RE = /\b(?:per|an|\/)\s*(?:hour|hr|day)\b|\bp\/?h\b|\bhourly\b|\bdaily\b|\bday\s*rate\b|\bph\b/i;

/** Plausible annual salary window; anything outside is a year, a headcount, a percentage… */
const MIN_ANNUAL = 20_000;
const MAX_ANNUAL = 2_000_000;

/**
 * Parse an annual salary range from ad text. Handles
 *   "$150,000 - $180,000", "$150k-$180k", "150-180k", "150k+",
 *   "NZD 160,000", "Up to $180,000", "$160,000 per annum plus super".
 * Hourly / daily rates ("$85 per hour", "$900/day") return null — only
 * annual figures are comparable to the minimum-salary rule. A single figure
 * becomes {min: v, max: v}; a "+" figure {min: v, max: null}; an "up to"
 * figure {min: null, max: v}. Returns null when nothing plausible is found.
 */
export function parseSalaryRange(text: string): ParsedSalaryRange | null {
  if (!text || HOURLY_OR_DAILY_RE.test(text)) return null;

  const tokenRe = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k)?(?![\p{L}\p{N}])/giu;
  const raw: { value: number; hasK: boolean; plus: boolean; index: number }[] = [];
  for (const m of text.matchAll(tokenRe)) {
    const whole = m[1].replace(/,/g, '');
    const frac = m[2] ?? '';
    const base = Number(frac ? `${whole}.${frac}` : whole);
    const hasK = m[3] != null;
    const after = text.slice(m.index! + m[0].length).trimStart();
    raw.push({ value: base, hasK, plus: after.startsWith('+'), index: m.index! });
  }
  if (raw.length === 0) return null;

  // "150-180k": a k on the second figure applies to the first as well.
  const anyK = raw.some((r) => r.hasK);
  const candidates = raw
    .map((r) => ({
      value: r.hasK || (anyK && r.value < 1000) ? r.value * 1000 : r.value,
      plus: r.plus,
    }))
    .filter((r) => r.value >= MIN_ANNUAL && r.value <= MAX_ANNUAL);
  if (candidates.length === 0) return null;

  const first = candidates[0];
  const second = candidates.find((c) => c.value > first.value);

  if (second) return { min: first.value, max: second.value };
  if (first.plus) return { min: first.value, max: null };
  if (/\bup\s+to\b|\bmax(?:imum)?\b/i.test(text)) return { min: null, max: first.value };
  return { min: first.value, max: first.value };
}

function formatNzd(n: number): string {
  return `$${n.toLocaleString('en-NZ')}`;
}

function matchesLocation(input: TriggerInput, rule: string): boolean {
  const r = rule.trim().toLowerCase();
  if (r.length === 0) return false;
  if (input.location.toLowerCase().includes(r)) return true;
  if (r === 'remote' || r === 'work from home' || r === 'wfh') {
    const haystack = `${input.title}\n${input.location}\n${input.text}`;
    return /\bremote\b|\bwork(?:ing)?\s+from\s+home\b|\bwfh\b/i.test(haystack);
  }
  return false;
}

/** Decide whether to spend LLM tokens on this job. See module doc for order. */
export function evaluateTrigger(input: TriggerInput, rules: TriggerRules): TriggerDecision {
  const titleAndText = `${input.title}\n${input.text}`;
  const companyNorm = normaliseCompany(input.company);
  const parsedSalary = parseSalaryRange(input.salary) ?? parseSalaryRange(input.text);
  const keywordHits = rules.keywordsAny.filter((k) => containsTerm(titleAndText, k));
  const preferredCompany = rules.preferredCompanies.some(
    (c) => normaliseCompany(c).length > 0 && normaliseCompany(c) === companyNorm
  );

  const base = { keywordHits, preferredCompany, parsedSalary };
  const skip = (reason: string): TriggerDecision => ({ decision: 'skip', reasons: [reason], ...base });

  // 1. Excluded company — beats everything, including preferred.
  const excludedCompany = rules.excludedCompanies.find(
    (c) => normaliseCompany(c).length > 0 && normaliseCompany(c) === companyNorm
  );
  if (excludedCompany !== undefined) return skip(`excluded company: ${input.company}`);

  // 2. Excluded terms in title or text.
  for (const term of rules.excludedTerms) {
    if (containsTerm(input.title, term)) return skip(`excluded term "${term}" in title`);
    if (containsTerm(input.text, term)) return skip(`excluded term "${term}" in description`);
  }

  // 3. Location allow-list.
  const locationRules = rules.locations.filter((l) => l.trim().length > 0);
  if (locationRules.length > 0 && !locationRules.some((l) => matchesLocation(input, l))) {
    return skip(`location "${input.location}" not in allowed locations (${locationRules.join(', ')})`);
  }

  // 4. Minimum salary — only when a figure was actually parsed.
  if (rules.minSalary != null && parsedSalary) {
    const ceiling = parsedSalary.max ?? parsedSalary.min;
    if (ceiling != null && ceiling < rules.minSalary) {
      return skip(`salary ${formatNzd(ceiling)} below minimum ${formatNzd(rules.minSalary)}`);
    }
  }

  const reasons: string[] = [];

  // 5. Preferred company — process regardless of keywords / match %.
  if (preferredCompany) {
    reasons.push(`preferred company: ${input.company}`);
    if (keywordHits.length > 0) reasons.push(`keyword hits: ${keywordHits.join(', ')}`);
    if (input.matchPercentage != null) reasons.push(`match ${input.matchPercentage}% (not enforced for preferred company)`);
    return { decision: 'process', reasons, ...base };
  }

  // 6. All required keywords present.
  const missingAll = rules.keywordsAll.filter((k) => k.trim().length > 0 && !containsTerm(titleAndText, k));
  if (missingAll.length > 0) return skip(`missing required keyword${missingAll.length > 1 ? 's' : ''}: ${missingAll.join(', ')}`);

  // 7. At least one keyword hit when keywordsAny is set.
  if (rules.keywordsAny.length > 0 && keywordHits.length === 0) {
    return skip(`no keyword hit (looking for any of: ${rules.keywordsAny.join(', ')})`);
  }

  // 8. Deterministic match threshold.
  if (input.matchPercentage != null && input.matchPercentage < rules.minMatchPercentage) {
    return skip(`match ${input.matchPercentage}% < ${rules.minMatchPercentage}%`);
  }

  // 9. Process.
  if (keywordHits.length > 0) reasons.push(`keyword hits: ${keywordHits.join(', ')}`);
  if (rules.keywordsAll.length > 0) reasons.push(`all required keywords present: ${rules.keywordsAll.join(', ')}`);
  if (input.matchPercentage != null) reasons.push(`match ${input.matchPercentage}% ≥ ${rules.minMatchPercentage}%`);
  else reasons.push('match % not available; threshold not enforced');
  if (parsedSalary && rules.minSalary != null) reasons.push(`salary meets minimum ${formatNzd(rules.minSalary)}`);
  if (reasons.length === 0) reasons.push('no rules excluded this job');
  return { decision: 'process', reasons, ...base };
}
