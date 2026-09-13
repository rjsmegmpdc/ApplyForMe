import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRIGGER_RULES,
  evaluateTrigger,
  normaliseCompany,
  parseSalaryRange,
  containsTerm,
  type TriggerInput,
  type TriggerRules,
} from './trigger';

const baseInput: TriggerInput = {
  title: 'Product Manager – AI Platforms',
  company: 'Datacom Systems Ltd',
  location: 'Auckland CBD, Auckland',
  salary: '$160,000 – $190,000 per annum',
  text: 'Lead the Copilot and AI governance roadmap for a large enterprise. Hybrid working, 2 days remote.',
  matchPercentage: 72,
};

const rules = (overrides: Partial<TriggerRules> = {}): TriggerRules => ({ ...DEFAULT_TRIGGER_RULES, ...overrides });

describe('normaliseCompany', () => {
  it('lowercases and strips ltd / limited / nz / new zealand / punctuation / whitespace', () => {
    expect(normaliseCompany('Datacom Systems Ltd')).toBe('datacomsystems');
    expect(normaliseCompany('Datacom Systems Limited.')).toBe('datacomsystems');
    expect(normaliseCompany('Vodafone New Zealand')).toBe('vodafone');
    expect(normaliseCompany('One NZ (formerly Vodafone NZ)')).toBe('oneformerlyvodafone');
    expect(normaliseCompany('  ASB  Bank ')).toBe('asbbank');
  });

  it('does not strip "nz" from inside a word', () => {
    expect(normaliseCompany('Anzco Foods')).toBe('anzcofoods');
  });
});

describe('containsTerm', () => {
  it('is case-insensitive and word-boundary aware', () => {
    expect(containsTerm('We said AI is great', 'ai')).toBe(true);
    expect(containsTerm('We said it is great', 'ai')).toBe(false);
    expect(containsTerm('Copilot Studio experience', 'copilot')).toBe(true);
    expect(containsTerm('Experience with C# and .NET', 'C#')).toBe(true);
    expect(containsTerm('Experience with M365 tooling', 'M365')).toBe(true);
    expect(containsTerm('', 'x')).toBe(false);
    expect(containsTerm('x', '')).toBe(false);
  });
});

describe('parseSalaryRange', () => {
  it.each([
    ['$150,000 - $180,000', { min: 150000, max: 180000 }],
    ['$150,000 – $180,000 per annum', { min: 150000, max: 180000 }],
    ['$150k-$180k', { min: 150000, max: 180000 }],
    ['150-180k', { min: 150000, max: 180000 }],
    ['$150,000 to $180,000 plus super', { min: 150000, max: 180000 }],
    ['150k+', { min: 150000, max: null }],
    ['$150,000+', { min: 150000, max: null }],
    ['NZD 160,000', { min: 160000, max: 160000 }],
    ['NZ$160,000 p.a.', { min: 160000, max: 160000 }],
    ['Up to $180,000', { min: null, max: 180000 }],
  ])('parses %s', (text, expected) => {
    expect(parseSalaryRange(text)).toEqual(expected);
  });

  it.each([
    ['$85 per hour'],
    ['$85 - $95 per hour'],
    ['$900/day'],
    ['$110 p/h'],
    ['Hourly rate $120'],
    ['Competitive'],
    [''],
    ['Posted in 2024, 5 roles available'],
  ])('returns null for %s', (text) => {
    expect(parseSalaryRange(text)).toBeNull();
  });
});

describe('evaluateTrigger', () => {
  it('processes a sensible input with DEFAULT rules, with non-empty reasons', () => {
    const d = evaluateTrigger(baseInput, DEFAULT_TRIGGER_RULES);
    expect(d.decision).toBe('process');
    expect(d.reasons.length).toBeGreaterThan(0);
    expect(d.reasons.join(' ')).toContain('match 72% ≥ 40%');
    expect(d.parsedSalary).toEqual({ min: 160000, max: 190000 });
    expect(d.preferredCompany).toBe(false);
  });

  it('preferred company processes even with no keyword hit and low match %', () => {
    const d = evaluateTrigger(
      { ...baseInput, matchPercentage: 5 },
      rules({ keywordsAny: ['kubernetes'], preferredCompanies: ['datacom systems'] })
    );
    expect(d.decision).toBe('process');
    expect(d.preferredCompany).toBe(true);
    expect(d.keywordHits).toEqual([]);
    expect(d.reasons[0]).toContain('preferred company');
  });

  it('excluded company beats preferred company', () => {
    const d = evaluateTrigger(
      baseInput,
      rules({ preferredCompanies: ['Datacom Systems'], excludedCompanies: ['Datacom Systems Limited'] })
    );
    expect(d.decision).toBe('skip');
    expect(d.reasons[0]).toMatch(/excluded company/);
  });

  it('skips on an excluded term in the title or description', () => {
    const byTitle = evaluateTrigger({ ...baseInput, title: 'Graduate Product Manager' }, DEFAULT_TRIGGER_RULES);
    expect(byTitle.decision).toBe('skip');
    expect(byTitle.reasons[0]).toBe('excluded term "graduate" in title');

    const byText = evaluateTrigger(
      { ...baseInput, text: `${baseInput.text} This is a 6-month contract.` },
      rules({ excludedTerms: ['contract'] })
    );
    expect(byText.decision).toBe('skip');
    expect(byText.reasons[0]).toBe('excluded term "contract" in description');
  });

  it('excluded terms are word-boundary aware', () => {
    // "internal" must not trip the default "intern" exclusion.
    const d = evaluateTrigger({ ...baseInput, text: 'Support internal stakeholders.' }, DEFAULT_TRIGGER_RULES);
    expect(d.decision).toBe('process');
  });

  it('location rules: substring match on location, and Remote matches remote/work-from-home text', () => {
    expect(evaluateTrigger(baseInput, rules({ locations: ['Auckland'] })).decision).toBe('process');
    const wellington = evaluateTrigger(baseInput, rules({ locations: ['Wellington'] }));
    expect(wellington.decision).toBe('skip');
    expect(wellington.reasons[0]).toMatch(/location "Auckland CBD, Auckland" not in allowed locations/);

    const remoteViaText = evaluateTrigger(
      { ...baseInput, location: 'Christchurch', text: 'Fully remote role, Copilot focus.' },
      rules({ locations: ['Remote'] })
    );
    expect(remoteViaText.decision).toBe('process');

    const wfh = evaluateTrigger(
      { ...baseInput, location: 'Christchurch', text: 'Work from home with quarterly meetups. Copilot focus.' },
      rules({ locations: ['Remote'] })
    );
    expect(wfh.decision).toBe('process');

    const notRemote = evaluateTrigger(
      { ...baseInput, location: 'Christchurch', text: 'Office based, Copilot focus.' },
      rules({ locations: ['Remote'] })
    );
    expect(notRemote.decision).toBe('skip');
  });

  it('skips when the parsed salary ceiling is below the minimum; unparseable salary never skips', () => {
    const low = evaluateTrigger({ ...baseInput, salary: '$120,000 - $140,000' }, rules({ minSalary: 150000 }));
    expect(low.decision).toBe('skip');
    expect(low.reasons[0]).toBe('salary $140,000 below minimum $150,000');

    const ok = evaluateTrigger(baseInput, rules({ minSalary: 150000 }));
    expect(ok.decision).toBe('process');

    const minOnly = evaluateTrigger({ ...baseInput, salary: '140k+' }, rules({ minSalary: 150000 }));
    expect(minOnly.decision).toBe('skip');

    const unparseable = evaluateTrigger({ ...baseInput, salary: 'Competitive' }, rules({ minSalary: 150000 }));
    expect(unparseable.decision).toBe('process');
    expect(unparseable.parsedSalary).toBeNull();

    const hourly = evaluateTrigger({ ...baseInput, salary: '$85 per hour' }, rules({ minSalary: 150000 }));
    expect(hourly.decision).toBe('process');
  });

  it('falls back to a salary parsed from the ad text when the salary field is empty', () => {
    const d = evaluateTrigger(
      { ...baseInput, salary: '', text: 'Salary $120,000 to $130,000. Copilot focus.' },
      rules({ minSalary: 150000 })
    );
    expect(d.decision).toBe('skip');
    expect(d.parsedSalary).toEqual({ min: 120000, max: 130000 });
  });

  it('keywordsAny: records hits and skips when none hit', () => {
    const hit = evaluateTrigger(baseInput, rules({ keywordsAny: ['AI', 'copilot', 'kubernetes'] }));
    expect(hit.decision).toBe('process');
    expect(hit.keywordHits).toEqual(['AI', 'copilot']);
    expect(hit.reasons).toContain('keyword hits: AI, copilot');

    const miss = evaluateTrigger(baseInput, rules({ keywordsAny: ['kubernetes', 'golang'] }));
    expect(miss.decision).toBe('skip');
    expect(miss.reasons[0]).toBe('no keyword hit (looking for any of: kubernetes, golang)');
  });

  it('keywordsAll: every required keyword must be present', () => {
    expect(evaluateTrigger(baseInput, rules({ keywordsAll: ['AI', 'governance'] })).decision).toBe('process');
    const d = evaluateTrigger(baseInput, rules({ keywordsAll: ['AI', 'kubernetes'] }));
    expect(d.decision).toBe('skip');
    expect(d.reasons[0]).toBe('missing required keyword: kubernetes');
  });

  it('minMatchPercentage: skips below threshold, processes at or above, ignores null', () => {
    const low = evaluateTrigger({ ...baseInput, matchPercentage: 39 }, DEFAULT_TRIGGER_RULES);
    expect(low.decision).toBe('skip');
    expect(low.reasons[0]).toBe('match 39% < 40%');

    expect(evaluateTrigger({ ...baseInput, matchPercentage: 40 }, DEFAULT_TRIGGER_RULES).decision).toBe('process');

    const unknown = evaluateTrigger({ ...baseInput, matchPercentage: null }, DEFAULT_TRIGGER_RULES);
    expect(unknown.decision).toBe('process');
    expect(unknown.reasons).toContain('match % not available; threshold not enforced');
  });

  it('is deterministic for the same input', () => {
    const r = rules({ keywordsAny: ['ai'], locations: ['Auckland'], minSalary: 100000 });
    expect(evaluateTrigger(baseInput, r)).toEqual(evaluateTrigger(baseInput, r));
  });
});
