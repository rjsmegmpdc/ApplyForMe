import { describe, it, expect } from 'vitest';
import { DEFAULT_TRIGGER_RULES, type TriggerRules } from '@applyforme/engine';
import { clampPercentage, formToRules, parseList, parseMinSalary, rulesFromJson, rulesToForm, triggerRulesSchema } from './rules-form';

describe('parseList', () => {
  it('splits on commas and newlines, trims, drops blanks, dedupes', () => {
    expect(parseList('a, b\nc ,, \n d, a')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseList('')).toEqual([]);
    expect(parseList('  \n , ')).toEqual([]);
  });
});

describe('parseMinSalary', () => {
  it('blank → null; digits, $, commas and k suffix are accepted', () => {
    expect(parseMinSalary('')).toBeNull();
    expect(parseMinSalary('   ')).toBeNull();
    expect(parseMinSalary('150000')).toBe(150000);
    expect(parseMinSalary('$150,000')).toBe(150000);
    expect(parseMinSalary('150k')).toBe(150000);
    expect(parseMinSalary('$1.5k')).toBe(1500);
    expect(parseMinSalary('lots')).toBeNull();
    expect(parseMinSalary('0')).toBeNull();
  });
});

describe('clampPercentage', () => {
  it('clamps to 0–100 and rounds; NaN falls back to the default', () => {
    expect(clampPercentage(-5)).toBe(0);
    expect(clampPercentage(140)).toBe(100);
    expect(clampPercentage(42.6)).toBe(43);
    expect(clampPercentage(Number.NaN)).toBe(DEFAULT_TRIGGER_RULES.minMatchPercentage);
  });
});

describe('form ↔ TriggerRules round trip', () => {
  const rules: TriggerRules = {
    keywordsAny: ['Product Manager', 'Modern Workplace'],
    keywordsAll: ['M365'],
    preferredCompanies: ['One NZ'],
    excludedCompanies: ['Acme'],
    excludedTerms: ['graduate', 'intern'],
    locations: ['Auckland', 'Remote'],
    minSalary: 150000,
    minMatchPercentage: 55,
  };

  it('rulesToForm → formToRules is the identity', () => {
    expect(formToRules(rulesToForm(rules))).toEqual(rules);
  });

  it('renders null minSalary as blank and parses blank back to null', () => {
    const form = rulesToForm({ ...rules, minSalary: null });
    expect(form.minSalary).toBe('');
    expect(formToRules(form).minSalary).toBeNull();
  });

  it('normalises messy form input', () => {
    const out = formToRules({
      keywordsAny: 'pm,\n product owner ,pm',
      keywordsAll: '',
      preferredCompanies: '',
      excludedCompanies: '',
      excludedTerms: 'junior',
      locations: '',
      minSalary: ' 120k ',
      minMatchPercentage: '250',
    });
    expect(out.keywordsAny).toEqual(['pm', 'product owner']);
    expect(out.keywordsAll).toEqual([]);
    expect(out.minSalary).toBe(120000);
    expect(out.minMatchPercentage).toBe(100);
  });

  it('blank minMatchPercentage falls back to the engine default', () => {
    expect(formToRules({ ...rulesToForm(rules), minMatchPercentage: '' }).minMatchPercentage).toBe(DEFAULT_TRIGGER_RULES.minMatchPercentage);
  });
});

describe('rulesFromJson / triggerRulesSchema', () => {
  it('returns defaults for null or garbage', () => {
    expect(rulesFromJson(null)).toEqual(DEFAULT_TRIGGER_RULES);
    expect(rulesFromJson('not json')).toEqual(DEFAULT_TRIGGER_RULES);
  });

  it('fills missing fields from defaults and keeps stored ones', () => {
    const out = rulesFromJson(JSON.stringify({ keywordsAny: ['x'], minMatchPercentage: 70 }));
    expect(out.keywordsAny).toEqual(['x']);
    expect(out.minMatchPercentage).toBe(70);
    expect(out.excludedTerms).toEqual(DEFAULT_TRIGGER_RULES.excludedTerms);
    expect(out.minSalary).toBeNull();
  });

  it('wire schema clamps the percentage rather than rejecting it', () => {
    const parsed = triggerRulesSchema.safeParse({ ...DEFAULT_TRIGGER_RULES, minMatchPercentage: 999 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.minMatchPercentage).toBe(100);
  });

  it('wire schema rejects a non-positive minSalary', () => {
    expect(triggerRulesSchema.safeParse({ ...DEFAULT_TRIGGER_RULES, minSalary: -1 }).success).toBe(false);
  });
});
