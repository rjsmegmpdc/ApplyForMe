import { describe, expect, it } from 'vitest';
import { FIXTURE_PROFILE } from '../__fixtures__/profile';
import {
  buildRepairInstruction,
  checkClaims,
  profileFactsText,
  type ClaimViolation,
  type TailoredOutput,
} from './claim-guard';

const profile = FIXTURE_PROFILE;

const jobText =
  'Senior Product Manager – AI Platforms. Datacom is looking for a leader to own our Copilot rollout across 12 business units. ' +
  'You will manage a budget of $3.5m and report to the CTO. Auckland based, hybrid.';

/** A well-behaved LLM output: reworded real highlights, numbers from the profile, a cert the profile has. */
const validOutput: TailoredOutput = {
  summary:
    'AI and digital transformation leader with 28 years of experience moving organisations from AI curiosity to AI reality. ' +
    'Led the production rollout of enterprise AI assistants and established scalable governance for agent platforms. ' +
    'Strong security and risk background across Zero Trust and privileged access, with ITIL and Lean Six Sigma (Green Belt) foundations.',
  highlights: [
    {
      role: 'Product Manager – Modern Workplace',
      company: 'One NZ',
      bullets: [
        'Designed and rolled out a Teams-based AI support assistant on Copilot Studio, anchored to curated internal knowledge with guardrails.',
        'Governs Microsoft 365, Intune and Windows 365 strategy across 6 FTEs and 4,000+ endpoints.',
        'Built an agentic automation business case spanning ServiceNow, SharePoint and licensing, forecasting a ~23% reduction in manual work.',
      ],
    },
    {
      role: 'Customer eXperience Owner (CXO) – Cloud Enablement',
      company: 'ASB Bank',
      bullets: [
        'Led the migration from VMware Horizon to Windows 365 Cloud PCs with significant OPEX savings.',
        'Directed a 180-day Windows 365 proof of concept demonstrating feasibility and cost benefits.',
      ],
    },
  ],
  coverLetter: {
    paragraphs: [
      'I am writing to apply for the Senior Product Manager – AI Platforms role at Datacom.',
      'At One NZ I led the production rollout of a Copilot Studio assistant and now govern Microsoft 365 strategy across 4,000+ endpoints; a Copilot rollout across 12 business units is exactly the kind of work I do today.',
      'I would welcome the chance to discuss how I can help.',
    ],
  },
};

function withSummary(summary: string): TailoredOutput {
  return { ...validOutput, summary };
}

function withBullets(bullets: string[]): TailoredOutput {
  return { ...validOutput, highlights: [{ ...validOutput.highlights[0], bullets }] };
}

function kinds(v: ClaimViolation[]): string[] {
  return v.map((x) => x.kind);
}

describe('profileFactsText', () => {
  it('contains every highlight, title, company, date, competency and certification verbatim', () => {
    const text = profileFactsText(profile);
    for (const role of profile.career_history) {
      expect(text).toContain(role.title);
      expect(text).toContain(role.company);
      expect(text).toContain(role.start_date);
      expect(text).toContain(role.end_date);
      for (const h of role.highlights) expect(text).toContain(h);
    }
    for (const c of profile.core_competencies) expect(text).toContain(c);
    for (const cert of profile.certifications_and_training) {
      expect(text).toContain(`${cert.name} (${cert.year})`);
    }
    expect(text).toContain(profile.executive_summary);
    expect(text).toContain('Years of experience: 28');
  });

  it('leaves contact details out of the fact sheet', () => {
    const text = profileFactsText(profile);
    expect(text).not.toContain(profile.personal.email);
    expect(text).not.toContain(profile.personal.phone);
  });

  it('is deterministic', () => {
    expect(profileFactsText(profile)).toBe(profileFactsText(profile));
    expect(profileFactsText(structuredClone(profile))).toBe(profileFactsText(profile));
  });
});

describe('checkClaims', () => {
  it('accepts a valid output (reworded real highlights, profile numbers, profile certs)', () => {
    const r = checkClaims(validOutput, profile, jobText);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('flags a fabricated bullet', () => {
    const r = checkClaims(
      withBullets(['Negotiated a multi-vendor telecommunications tower sharing agreement with Spark and 2degrees.']),
      profile,
      jobText
    );
    expect(r.ok).toBe(false);
    expect(kinds(r.violations)).toContain('fabricated-highlight');
    const v = r.violations.find((x) => x.kind === 'fabricated-highlight')!;
    expect(v.text).toMatch(/tower sharing/);
    expect(v.detail).toMatch(/highlights\[0\] bullet 1/);
  });

  it('accepts a summary-ish bullet that traces to the executive summary / competencies', () => {
    const r = checkClaims(
      withBullets(['Combined governance-first enablement with practical delivery and operational cost discipline.']),
      profile,
      jobText
    );
    expect(r.ok).toBe(true);
  });

  it('flags an invented company', () => {
    const out: TailoredOutput = {
      ...validOutput,
      highlights: [{ role: 'Product Manager', company: 'Spark New Zealand', bullets: ['Led rollout of AI assistants.'] }],
    };
    const r = checkClaims(out, profile, jobText);
    expect(kinds(r.violations)).toEqual(['unknown-company']);
    expect(r.violations[0].text).toBe('Spark New Zealand');
  });

  it('flags a role title the profile does not have at that company', () => {
    const out: TailoredOutput = {
      ...validOutput,
      highlights: [{ role: 'Chief Technology Officer', company: 'One NZ', bullets: [] }],
    };
    const r = checkClaims(out, profile, jobText);
    expect(kinds(r.violations)).toEqual(['unknown-role']);
    expect(r.violations[0].detail).toMatch(/Product Manager – Modern Workplace/);
  });

  it('allows a shortened title contained in the profile title, and a longer company form', () => {
    const out: TailoredOutput = {
      ...validOutput,
      highlights: [
        { role: 'Product Manager', company: 'One NZ (formerly Vodafone NZ)', bullets: [] },
        { role: 'Product Owner – Integration', company: 'ASB Bank Limited', bullets: [] },
      ],
    };
    expect(checkClaims(out, profile, jobText).ok).toBe(true);
  });

  it('flags a number that is in neither the profile nor the job text, but accepts it once the job text has it', () => {
    const out = withSummary('Managed a $7.2m budget across the programme.');
    const missing = checkClaims(out, profile, jobText);
    expect(kinds(missing.violations)).toContain('untraceable-number');
    expect(missing.violations.find((v) => v.kind === 'untraceable-number')!.text).toBe('7.2m');

    const present = checkClaims(out, profile, `${jobText} The programme budget is $7.2m.`);
    expect(present.ok).toBe(true);
  });

  it('normalises commas, "~", "%" and k/m suffixes when tracing numbers', () => {
    // 4,000+ endpoints and ~23% are in the profile; $3.5m is in the job text.
    const out = withSummary('Manages 4000 endpoints, forecast a 23 percent reduction, and can own a $3,500,000 budget.');
    expect(checkClaims(out, profile, jobText).ok).toBe(true);
  });

  it('flags a year absent from profile and job as unknown-year', () => {
    const r = checkClaims(withSummary('Joined One NZ in 2015 and led AI assistants.'), profile, jobText);
    expect(kinds(r.violations)).toContain('unknown-year');
    expect(r.violations.find((v) => v.kind === 'unknown-year')!.text).toBe('2015');

    const ok = checkClaims(withSummary('Joined One NZ in 2021 and led AI assistants.'), profile, jobText);
    expect(ok.ok).toBe(true);
  });

  it('accepts a certification the profile has (by name or competency)', () => {
    const r = checkClaims(
      withSummary('ITIL and Lean Six Sigma Green Belt practitioner with a Microsoft Azure AI Fundamentals certification.'),
      profile,
      jobText
    );
    expect(r.violations.filter((v) => v.kind === 'unknown-certification')).toEqual([]);
  });

  it('flags a certification the profile does not have', () => {
    const r = checkClaims(withSummary('Holds PMP and CISSP and is an AWS Certified Solutions Architect.'), profile, jobText);
    const certs = r.violations.filter((v) => v.kind === 'unknown-certification');
    expect(certs.length).toBe(3);
    expect(certs.map((v) => v.text).join(' ')).toMatch(/PMP/);
    expect(certs.map((v) => v.text).join(' ')).toMatch(/CISSP/);
    expect(certs.map((v) => v.text).join(' ')).toMatch(/AWS Certified/);
  });

  it('does not treat bare "agile" or lowercase "pmp" prose as a certification claim', () => {
    const r = checkClaims(
      withSummary('Agile product leader who has led AI assistants; the pmp of the team was strong.'),
      profile,
      jobText
    );
    expect(r.violations.filter((v) => v.kind === 'unknown-certification')).toEqual([]);
  });

  it('a generic "certified" phrase must overlap on something other than the trigger word', () => {
    const r = checkClaims(withSummary('Certified Kubernetes Administrator leading AI assistants.'), profile, jobText);
    expect(kinds(r.violations)).toContain('unknown-certification');
  });

  it('checks cover letter paragraphs too, and reports where', () => {
    const out: TailoredOutput = {
      ...validOutput,
      coverLetter: { paragraphs: ['I saved the business $9,999,999 last year.'] },
    };
    const r = checkClaims(out, profile, jobText);
    expect(r.ok).toBe(false);
    expect(r.violations[0].detail).toMatch(/cover letter paragraph 1/);
  });

  it('never modifies its inputs and is deterministic', () => {
    const out = structuredClone(validOutput);
    const before = JSON.stringify(out);
    const a = checkClaims(out, profile, jobText);
    const b = checkClaims(out, profile, jobText);
    expect(JSON.stringify(out)).toBe(before);
    expect(a).toEqual(b);
  });
});

describe('buildRepairInstruction', () => {
  it('lists every violation and asks for the same JSON shape with only those fixed', () => {
    const violations: ClaimViolation[] = [
      { kind: 'fabricated-highlight', text: 'Negotiated tower sharing.', detail: 'highlights[0] bullet 1: not traceable' },
      { kind: 'untraceable-number', text: '7.2m', detail: 'summary: number "7.2m" not in profile or ad' },
      { kind: 'unknown-certification', text: 'Holds PMP and', detail: 'summary: no matching cert' },
    ];
    const msg = buildRepairInstruction(violations);
    for (const v of violations) {
      expect(msg).toContain(`[${v.kind}]`);
      expect(msg).toContain(v.text);
      expect(msg).toContain(v.detail);
    }
    expect(msg).toContain('3 issues');
    expect(msg).toMatch(/Fix ONLY/);
    expect(msg).toMatch(/same shape/);
    expect(msg).toContain('"summary"');
    expect(msg).toContain('"coverLetter"');
  });

  it('uses singular wording for one issue', () => {
    expect(buildRepairInstruction([{ kind: 'unknown-year', text: '2015', detail: 'x' }])).toContain('1 issue.');
  });
});
