import { z } from 'zod';
import { DEFAULT_TRIGGER_RULES, type TriggerRules } from '@applyforme/engine';

/**
 * Rules page ↔ engine `TriggerRules` mapping. The form holds every list as
 * one free-text string (comma- or newline-separated — whichever the user
 * types), `minSalary` as a string that may be blank, and
 * `minMatchPercentage` as a string; `formToRules` normalises all of that
 * into the engine shape and `rulesToForm` reverses it. Pure functions so
 * the round trip is unit-testable without React.
 */

export interface RulesForm {
  keywordsAny: string;
  keywordsAll: string;
  preferredCompanies: string;
  excludedCompanies: string;
  excludedTerms: string;
  locations: string;
  minSalary: string;
  minMatchPercentage: string;
}

/** Split on commas and newlines, trim, drop blanks, dedupe (first occurrence wins, case-sensitive). */
export function parseList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\n,]/)) {
    const item = raw.trim();
    if (item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function joinList(items: string[]): string {
  return items.join(', ');
}

/** Blank/whitespace → null; otherwise digits with optional $, commas and a trailing k ("$150k" → 150000). Unparseable → null. */
export function parseMinSalary(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[$,\s]/g, '');
  if (s.length === 0) return null;
  const m = /^(\d+(?:\.\d+)?)(k)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function clampPercentage(value: number, fallback = DEFAULT_TRIGGER_RULES.minMatchPercentage): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function rulesToForm(rules: TriggerRules): RulesForm {
  return {
    keywordsAny: joinList(rules.keywordsAny),
    keywordsAll: joinList(rules.keywordsAll),
    preferredCompanies: joinList(rules.preferredCompanies),
    excludedCompanies: joinList(rules.excludedCompanies),
    excludedTerms: joinList(rules.excludedTerms),
    locations: joinList(rules.locations),
    minSalary: rules.minSalary == null ? '' : String(rules.minSalary),
    minMatchPercentage: String(rules.minMatchPercentage),
  };
}

export function formToRules(form: RulesForm): TriggerRules {
  const pct = form.minMatchPercentage.trim() === '' ? DEFAULT_TRIGGER_RULES.minMatchPercentage : Number(form.minMatchPercentage);
  return {
    keywordsAny: parseList(form.keywordsAny),
    keywordsAll: parseList(form.keywordsAll),
    preferredCompanies: parseList(form.preferredCompanies),
    excludedCompanies: parseList(form.excludedCompanies),
    excludedTerms: parseList(form.excludedTerms),
    locations: parseList(form.locations),
    minSalary: parseMinSalary(form.minSalary),
    minMatchPercentage: clampPercentage(pct),
  };
}

/** Wire schema for PUT /api/rules — the engine shape exactly, with the percentage clamped rather than rejected. */
export const triggerRulesSchema = z.object({
  keywordsAny: z.array(z.string()).default([]),
  keywordsAll: z.array(z.string()).default([]),
  preferredCompanies: z.array(z.string()).default([]),
  excludedCompanies: z.array(z.string()).default([]),
  excludedTerms: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  minSalary: z.number().positive().nullable().default(null),
  minMatchPercentage: z.number().default(DEFAULT_TRIGGER_RULES.minMatchPercentage).transform((n) => clampPercentage(n)),
});

/**
 * Parse a stored `rules_json` blob, filling any missing field from the
 * defaults so a rule added to the engine later never breaks an old row.
 * Null/garbage → defaults.
 */
export function rulesFromJson(json: string | null | undefined): TriggerRules {
  if (!json) return { ...DEFAULT_TRIGGER_RULES };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ...DEFAULT_TRIGGER_RULES };
  }
  const parsed = triggerRulesSchema.safeParse({ ...DEFAULT_TRIGGER_RULES, ...(typeof data === 'object' && data ? data : {}) });
  return parsed.success ? parsed.data : { ...DEFAULT_TRIGGER_RULES };
}
