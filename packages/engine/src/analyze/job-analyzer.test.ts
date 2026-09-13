import { describe, expect, it } from 'vitest';
import { FIXTURE_PROFILE } from '../__fixtures__/profile';
import { buildSeekJobPage } from '../__fixtures__/seek-job-page';
import { extractJobAdText } from '../parse/seek-page';
import {
  analysisEvidenceText,
  analyzeJob,
  containsKeyword,
  extractJobInfo,
  extractKeywords,
  extractLocation,
  recommendCertifications,
  scoreMatches,
} from './job-analyzer';

const MODERN_WORKPLACE_AD = `Head of Modern Workplace
Kiwi Energy Group

About the role
Kiwi Energy Group is looking for a Head of Modern Workplace to own our Microsoft 365, Intune and Windows 365 strategy across 3,000+ staff and 4,500 endpoints.

What you'll do
- Set the technology roadmap for the modern workplace domain and drive stakeholder alignment.
- Lead the production rollout of Copilot and Copilot Studio agents with Responsible AI governance.
- Partner with Security on Zero Trust, privileged access management and endpoint security aligned to NIST and ISO.
- Manage the domain budget (OPEX/CAPEX), licensing and forecasting.
- Champion DevOps practices and automation across the platform team.

About you
- 10+ years in technology leadership within a regulated enterprise.
- Deep Azure and Microsoft 365 experience.
- Comfortable using data and analytics to drive decisions.

Hybrid role - 3 days in our Auckland CBD office. KiwiSaver and Southern Cross health insurance included.`;

const CHEF_AD = `Head Chef
Busy Ponsonby restaurant needs a head chef to run the kitchen, plan seasonal menus, manage food cost and lead a brigade of six.
Must have 5 years experience in fine dining and hold a current food safety certificate. Weekend work required.`;

/** Every literal string the profile contains that evidence may cite. */
function profileStrings(): string[] {
  const out: string[] = [];
  for (const role of FIXTURE_PROFILE.career_history) out.push(...role.highlights);
  out.push(...FIXTURE_PROFILE.core_competencies);
  for (const c of FIXTURE_PROFILE.certifications_and_training) out.push(c.name);
  return out;
}

describe('containsKeyword / extractKeywords', () => {
  it('matches on word boundaries, not substrings', () => {
    expect(containsKeyword('AI-ready knowledge', 'ai')).toBe(true);
    expect(containsKeyword('we maintain systems', 'ai')).toBe(false);
    expect(containsKeyword('busy restaurant', 'rest')).toBe(false);
    expect(containsKeyword('REST APIs', 'rest')).toBe(true);
    expect(containsKeyword('html pages', 'ml')).toBe(false);
    expect(containsKeyword('CI/CD pipelines', 'ci/cd')).toBe(true);
    expect(containsKeyword('Head of Digital', 'head of')).toBe(true);
  });

  it('returns distinct keywords in category order', () => {
    const kws = extractKeywords('Azure and Intune and azure again, with DevOps and Azure.');
    expect(kws).toEqual(['azure', 'intune', 'devops']);
  });
});

describe('analyzeJob', () => {
  it('scores a Head of Modern Workplace ad well above 50 against the fixture profile', () => {
    const a = analyzeJob(MODERN_WORKPLACE_AD, FIXTURE_PROFILE);
    expect(a.matchPercentage).toBeGreaterThan(50);
    expect(a.jobTitle).toBe('Head of Modern Workplace');
    expect(a.officeLocation).toBe('Auckland (Hybrid)');
    expect(a.requirements.length).toBeGreaterThanOrEqual(6);
    expect(a.matches.filter((m) => m.matched).length).toBeGreaterThanOrEqual(6);
    expect(a.keywordsFound).toContain('intune');
    expect(a.coverLetterPoints.length).toBeGreaterThan(0);
    expect(a.tailoredSummary).toContain('Head of Modern Workplace');
    expect(a).not.toHaveProperty('interviewQuestions');
  });

  it('cites only evidence that literally appears in the profile', () => {
    const a = analyzeJob(MODERN_WORKPLACE_AD, FIXTURE_PROFILE);
    const literals = profileStrings();
    const allEvidence = a.matches.flatMap((m) => m.evidence);
    expect(allEvidence.length).toBeGreaterThan(5);
    for (const e of allEvidence) {
      expect(literals.some((s) => e.includes(s))).toBe(true);
    }
    for (const p of a.coverLetterPoints) {
      expect(allEvidence).toContain(p);
    }
  });

  it('scores an unrelated (chef) ad low', () => {
    const a = analyzeJob(CHEF_AD, FIXTURE_PROFILE);
    expect(a.matchPercentage).toBeLessThan(25);
    expect(a.jobTitle).toBe('Head Chef');
    expect(a.requirements.length).toBeLessThanOrEqual(2);
  });

  it('is deterministic', () => {
    const a = analyzeJob(MODERN_WORKPLACE_AD, FIXTURE_PROFILE);
    const b = analyzeJob(MODERN_WORKPLACE_AD, FIXTURE_PROFILE);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('works on text produced by the page parser and honours hints', () => {
    const text = extractJobAdText(buildSeekJobPage());
    const a = analyzeJob(text, FIXTURE_PROFILE, { title: 'Head of Modern Workplace', company: 'Kiwi Energy Group' });
    expect(a.jobTitle).toBe('Head of Modern Workplace');
    expect(a.company).toBe('Kiwi Energy Group');
    expect(a.matchPercentage).toBeGreaterThan(50);
    expect(a.tailoredSummary).toContain('at Kiwi Energy Group');
  });

  it('reports missing categories and recommends certifications the user does not hold', () => {
    const thinProfile = {
      ...FIXTURE_PROFILE,
      career_history: [],
      core_competencies: ['People leadership'],
      certifications_and_training: [{ name: 'FinOps Certified Practitioner', year: 2020 }],
    };
    const a = analyzeJob(MODERN_WORKPLACE_AD, thinProfile);
    expect(a.missingSkills).toContain('Cloud & Infrastructure');
    expect(a.missingSkills).toContain('Microsoft 365');
    expect(a.missingSkills).toContain('Financial Management');
    expect(a.recommendedCertifications).toContain('Microsoft 365 Certified: Fundamentals (MS-900)');
    expect(a.recommendedCertifications).toContain('Microsoft Certified: Azure Fundamentals (AZ-900)');
    // Already held is not recommended again.
    expect(a.recommendedCertifications).not.toContain('FinOps Certified Practitioner');
    expect(a.matchPercentage).toBeLessThan(30);
  });

  it('recognises a held certification by its exam code', () => {
    const p = { ...FIXTURE_PROFILE, certifications_and_training: [{ name: 'Azure Fundamentals AZ-900 (Microsoft)', year: 2021 }] };
    const r = recommendCertifications(['Cloud & Infrastructure'], p);
    expect(r).toEqual(['AWS Certified Cloud Practitioner']);
  });

  it('includes benefit matches from the profile priorities', () => {
    const a = analyzeJob(MODERN_WORKPLACE_AD, {
      ...FIXTURE_PROFILE,
      priority_benefits: [
        { keyword: 'KiwiSaver', priority: 1 },
        { keyword: 'company car', priority: 2 },
      ],
    });
    expect(a.benefitMatches).toHaveLength(2);
    expect(a.benefitMatches[0]).toMatchObject({ keyword: 'KiwiSaver', found: true });
    expect(a.benefitMatches[1]).toMatchObject({ keyword: 'company car', found: false, context: '' });
    expect(analyzeJob(MODERN_WORKPLACE_AD, FIXTURE_PROFILE).benefitMatches).toEqual([]);
  });

  it('falls back to the base summary when nothing matches moderately', () => {
    const a = analyzeJob('No relevant content here at all.', FIXTURE_PROFILE);
    expect(a.matchPercentage).toBe(0);
    expect(a.tailoredSummary).toBe(FIXTURE_PROFILE.executive_summary);
    expect(a.jobTitle).toBe('Target Role');
    expect(a.company).toBe('Target Company');
  });
});

describe('scoreMatches', () => {
  const req = (importance: 'critical' | 'important' | 'nice-to-have') => ({
    category: 'x', requirement: 'x', keywords: ['x'], importance,
  });
  it('returns 0 for no requirements', () => {
    expect(scoreMatches([], [])).toBe(0);
  });
  it('is 100 when every requirement is strongly matched with full coverage', () => {
    const matches = [
      { requirement: req('critical'), matched: true, evidence: ['a', 'b', 'c'], matchStrength: 'strong' as const },
      { requirement: req('nice-to-have'), matched: true, evidence: ['a', 'b', 'c'], matchStrength: 'strong' as const },
    ];
    expect(scoreMatches(matches, ['1', '2', '3', '4', '5', '6', '7'])).toBe(100);
  });
  it('scales down when the ad uses little of the vocabulary', () => {
    const matches = [
      { requirement: req('nice-to-have'), matched: true, evidence: ['a'], matchStrength: 'weak' as const },
    ];
    expect(scoreMatches(matches, ['cost'])).toBe(8);
  });
});

describe('extractJobInfo / extractLocation', () => {
  it('strips role/company labels', () => {
    expect(extractJobInfo('Role: Senior Product Owner\nCompany: ASB Bank\n')).toEqual({
      title: 'Senior Product Owner',
      company: 'ASB Bank',
    });
  });

  it('detects remote, hybrid and cities', () => {
    expect(extractLocation('This is a fully remote position.')).toBe('Fully Remote');
    expect(extractLocation('Based in Wellington, hybrid with 2 days in the office.')).toBe('Wellington (Hybrid)');
    expect(extractLocation('Great team in Christchurch.')).toBe('Christchurch');
    expect(extractLocation('WFH friendly.')).toBe('Remote / WFH mentioned');
    expect(extractLocation('No location here.')).toBe('Not specified');
  });
});

describe('recommendCertifications', () => {
  it('returns nothing for no gaps and dedupes', () => {
    expect(recommendCertifications([], FIXTURE_PROFILE)).toEqual([]);
    const r = recommendCertifications(['Risk & Governance', 'Risk & Governance'], FIXTURE_PROFILE);
    expect(new Set(r).size).toBe(r.length);
  });
});

describe('analysisEvidenceText', () => {
  it('renders the facts the LLM may use as plain text', () => {
    const a = analyzeJob(MODERN_WORKPLACE_AD, FIXTURE_PROFILE);
    const text = analysisEvidenceText(a, FIXTURE_PROFILE);
    expect(text).toContain('Candidate: Matt Harkness (28+ years experience)');
    expect(text).toContain('Job title: Head of Modern Workplace');
    expect(text).toContain(`Requirement match: ${a.matchPercentage}%`);
    expect(text).toContain('Matched requirements (');
    expect(text).toContain('Missing / unevidenced requirements (');
    for (const e of a.matches.flatMap((m) => m.evidence)) {
      expect(text).toContain(`* ${e}`);
    }
    for (const s of a.missingSkills) expect(text).toContain(`- ${s}`);
  });
});
