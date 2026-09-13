import { describe, it, expect } from 'vitest';
import { FIXTURE_PROFILE } from '../../../../packages/engine/src/__fixtures__/profile';
import { buildSeekJobPage } from '../../../../packages/engine/src/__fixtures__/seek-job-page';
import { analyzeJob, checkClaims, extractJobAdText, type TailoredOutput } from '@applyforme/engine';
import { buildTailorPrompt, deterministicTailored, renderTuningNotes, tailoredOutputSchema, tailorWithGuard, type TailorInput } from './tailor';
import type { GenerateFn } from './anthropic';
import { FABRICATED_OUTPUT, VALID_OUTPUT, scriptedGenerate } from '../pipeline/test-support';

const JOB_TEXT = extractJobAdText(buildSeekJobPage());
const JOB = { title: 'Head of Modern Workplace', company: 'Kiwi Energy Group', location: 'Auckland CBD, Auckland', url: 'https://www.seek.co.nz/job/84120987' };

function input(overrides: Partial<TailorInput> = {}): TailorInput {
  return {
    profile: FIXTURE_PROFILE,
    analysis: analyzeJob(JOB_TEXT, FIXTURE_PROFILE, { title: JOB.title, company: JOB.company }),
    jobText: JOB_TEXT,
    job: JOB,
    preferences: [],
    ...overrides,
  };
}

describe('tailoredOutputSchema', () => {
  it('accepts the TailoredOutput shape and rejects a missing section', () => {
    expect(tailoredOutputSchema.safeParse(VALID_OUTPUT).success).toBe(true);
    expect(tailoredOutputSchema.safeParse({ summary: 'x', highlights: [] }).success).toBe(false);
    expect(tailoredOutputSchema.safeParse({ ...VALID_OUTPUT, highlights: [{ role: 'r', company: 'c' }] }).success).toBe(false);
  });
});

describe('buildTailorPrompt', () => {
  it('puts rules, tuning notes, then the fact sheet (with the cache breakpoint) in the system prompt', () => {
    const { system } = buildTailorPrompt(input({ preferences: [{ kind: 'tone', text: 'direct, no fluff' }, { kind: 'avoid', text: 'the word synergy' }] }));
    expect(system).toHaveLength(3);
    expect(system[0].text).toMatch(/NEVER add an employer/);
    expect(system[0].cache_control).toBeUndefined();
    expect(system[1].text).toContain('Tone: direct, no fluff');
    expect(system[1].text).toContain('Avoid: the word synergy');
    expect(system[2].text).toContain('FACT SHEET');
    expect(system[2].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('the fact sheet contains every profile highlight and certification; the user turn carries the job and the full ad text', () => {
    const { system, user } = buildTailorPrompt(input());
    const facts = system[2].text;
    for (const role of FIXTURE_PROFILE.career_history) {
      expect(facts).toContain(role.title);
      expect(facts).toContain(role.company);
      for (const h of role.highlights) expect(facts).toContain(h);
    }
    for (const cert of FIXTURE_PROFILE.certifications_and_training) expect(facts).toContain(cert.name);

    expect(user).toContain(`Title: ${JOB.title}`);
    expect(user).toContain(`Company: ${JOB.company}`);
    expect(user).toContain(`URL: ${JOB.url}`);
    expect(user).toContain(JOB_TEXT);
    expect(user).toContain('Matched requirements');
  });

  it('renders "(none yet)" when there are no preferences so the block shape is stable', () => {
    expect(renderTuningNotes([])).toContain('(none yet)');
    expect(renderTuningNotes([{ kind: 'note', text: '   ' }])).toContain('(none yet)');
    expect(renderTuningNotes([{ kind: 'emphasise', text: 'M365 migrations' }])).toContain('- Emphasise: M365 migrations');
  });
});

describe('tailorWithGuard', () => {
  it('valid first reply → origin live, one call', async () => {
    const { generate, calls } = scriptedGenerate([VALID_OUTPUT]);
    const result = await tailorWithGuard(generate, input());
    expect(result).toEqual({ output: VALID_OUTPUT, origin: 'live' });
    expect(calls).toHaveLength(1);
    expect(calls[0].schema).toBe(tailoredOutputSchema);
  });

  it('fabricated bullet then valid → origin live-repaired with exactly 2 calls, the repair turn naming the violation', async () => {
    const { generate, calls } = scriptedGenerate([FABRICATED_OUTPUT, VALID_OUTPUT]);
    const result = await tailorWithGuard(generate, input());
    expect(result?.origin).toBe('live-repaired');
    expect(result?.output).toEqual(VALID_OUTPUT);
    expect(calls).toHaveLength(2);

    const repair = calls[1].messages;
    expect(repair).toHaveLength(3);
    expect(repair[1].role).toBe('assistant');
    expect(repair[1].content).toBe(JSON.stringify(FABRICATED_OUTPUT));
    expect(repair[2].role).toBe('user');
    const instruction = String(repair[2].content);
    expect(instruction).toContain('failed fact validation');
    expect(instruction).toContain('fabricated-highlight');
    expect(instruction).toContain('chess championship');
    expect(instruction).toContain('unknown-year');
    // Same system prompt on the repair turn — the cached fact sheet is reused.
    expect(calls[1].system).toEqual(calls[0].system);
  });

  it('always-bad → null after exactly 2 calls', async () => {
    const { generate, calls } = scriptedGenerate([FABRICATED_OUTPUT]);
    expect(await tailorWithGuard(generate, input())).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('a refusal / unparseable first reply → null without a repair turn', async () => {
    const { generate, calls } = scriptedGenerate([null]);
    expect(await tailorWithGuard(generate, input())).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('propagates a thrown model error (the orchestrator decides what to do with it)', async () => {
    const generate: GenerateFn = async () => {
      throw new Error('529 overloaded');
    };
    await expect(tailorWithGuard(generate, input())).rejects.toThrow('529 overloaded');
  });
});

describe('deterministicTailored', () => {
  it('passes the claim guard against the fixture profile and the fixture ad', () => {
    const out = deterministicTailored(input());
    const check = checkClaims(out, FIXTURE_PROFILE, JOB_TEXT);
    expect(check.violations).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it('uses the analysis summary and the profile\'s exact role/company strings, in profile order', () => {
    const inp = input();
    const out = deterministicTailored(inp);
    expect(out.summary).toBe(inp.analysis.tailoredSummary);
    expect(out.highlights.map((h) => [h.role, h.company])).toEqual(FIXTURE_PROFILE.career_history.map((r) => [r.title, r.company]));
    for (const block of out.highlights) {
      expect(block.bullets.length).toBeGreaterThan(0);
      const role = FIXTURE_PROFILE.career_history.find((r) => r.title === block.role)!;
      for (const b of block.bullets) expect(role.highlights).toContain(b);
    }
  });

  it('builds v1-style letter prose: opening names role and company, evidence paragraphs, warm closing', () => {
    const out = deterministicTailored(input());
    const paras = out.coverLetter.paragraphs;
    expect(paras.length).toBeGreaterThanOrEqual(3);
    expect(paras[0]).toContain('Head of Modern Workplace position at Kiwi Energy Group');
    expect(paras[0]).toContain('28+ years');
    expect(paras.slice(1, -1).some((p) => /^(In the area of|Regarding) /.test(p))).toBe(true);
    expect(paras[paras.length - 1]).toContain('to Kiwi Energy Group');
    expect(paras.some((p) => /Dear|Yours sincerely/.test(p))).toBe(false);
  });

  it('a job with no evidence still yields a complete, guard-clean output', () => {
    const chefText = 'Head Chef. Busy restaurant needs a head chef to run the kitchen, plan menus and lead a brigade of six.';
    const inp = input({ jobText: chefText, analysis: analyzeJob(chefText, FIXTURE_PROFILE, { title: 'Head Chef', company: 'Ponsonby Bistro' }), job: { ...JOB, title: 'Head Chef', company: 'Ponsonby Bistro' } });
    const out: TailoredOutput = deterministicTailored(inp);
    expect(out.coverLetter.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(checkClaims(out, FIXTURE_PROFILE, chefText).ok).toBe(true);
  });
});
