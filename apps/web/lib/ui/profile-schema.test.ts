import { describe, it, expect } from 'vitest';
import { parseProfileJson, userProfileSchema, validateProfile } from './profile-schema';

/** v1-shaped master profile: carries `id`, plus legacy keys (`email_work`) that must be stripped, not rejected. */
const V1_PROFILE = {
  id: 'matt',
  personal: {
    name: 'Matt Harkness',
    email: 'matt@example.com',
    email_work: 'matt@work.example.com',
    phone: '021 000 0000',
    address: 'Auckland',
    linkedin: '',
    nationality: 'New Zealand',
    years_experience: 28,
  },
  executive_summary: 'AI and digital transformation leader.',
  core_competencies: ['Technology Roadmaps', 'Zero Trust'],
  career_history: [
    {
      title: 'Product Manager – Modern Workplace',
      company: 'One NZ',
      location: 'Auckland, New Zealand',
      start_date: 'Nov 2021',
      end_date: 'Present',
      highlights: ['Led design and production rollout of a Teams-based AI support assistant.'],
      keywords: ['AI', 'Copilot Studio'],
    },
  ],
  certifications_and_training: [{ name: 'Microsoft Azure Fundamentals', year: 2023 }],
  priority_benefits: [{ keyword: 'KiwiSaver', priority: 1 }],
};

describe('userProfileSchema', () => {
  it('accepts a v1-shaped profile and strips unknown keys', () => {
    const result = validateProfile(V1_PROFILE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.id).toBe('matt');
    expect(result.profile.personal.name).toBe('Matt Harkness');
    expect((result.profile.personal as Record<string, unknown>).email_work).toBeUndefined();
    expect(result.profile.career_history).toHaveLength(1);
    expect(result.profile.priority_benefits?.[0].keyword).toBe('KiwiSaver');
  });

  it('defaults id when absent and treats priority_benefits as optional', () => {
    const { id: _id, priority_benefits: _pb, ...rest } = V1_PROFILE;
    const parsed = userProfileSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe('default');
      expect(parsed.data.priority_benefits).toBeUndefined();
    }
  });

  it('rejects a profile missing required fields, naming the path', () => {
    const { executive_summary: _s, ...noSummary } = V1_PROFILE;
    const r1 = validateProfile(noSummary);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toMatch(/^executive_summary:/);

    const badPersonal = { ...V1_PROFILE, personal: { ...V1_PROFILE.personal, years_experience: 'lots' } };
    const r2 = validateProfile(badPersonal);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/^personal\.years_experience:/);

    const badRole = { ...V1_PROFILE, career_history: [{ title: 'X' }] };
    const r3 = validateProfile(badRole);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error).toMatch(/^career_history\.0\./);
  });

  it('rejects a certification with a non-integer year', () => {
    const r = validateProfile({ ...V1_PROFILE, certifications_and_training: [{ name: 'X', year: '2023' }] });
    expect(r.ok).toBe(false);
  });
});

describe('parseProfileJson', () => {
  it('reports JSON syntax errors separately from shape errors', () => {
    const r = parseProfileJson('{ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Not valid JSON/);
  });

  it('round-trips a valid JSON string', () => {
    const r = parseProfileJson(JSON.stringify(V1_PROFILE));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.profile.core_competencies).toEqual(['Technology Roadmaps', 'Zero Trust']);
  });
});
