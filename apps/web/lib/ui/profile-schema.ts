import { z } from 'zod';
import type { UserProfile } from '@applyforme/engine';

/**
 * Zod mirror of the engine's `UserProfile` (packages/engine/src/types.ts).
 * Used by PUT /api/profile and the Profile editor's "Apply JSON" step so a
 * malformed paste is rejected with a field path rather than stored and
 * discovered by the tailoring prompt later.
 *
 * Deliberately strict on shape (every required key must exist) but lenient
 * on content (empty strings are fine — a blank LinkedIn is a real state).
 * Unknown keys are stripped, so v1's `email_work` / `copilot_365_detail`
 * paste cleanly. `id` defaults to 'default' when absent — v1 JSON carries
 * one, hand-written JSON usually doesn't.
 */

const str = z.string();

export const careerRoleSchema = z.object({
  title: str,
  company: str,
  location: str,
  start_date: str,
  end_date: str,
  highlights: z.array(str),
  keywords: z.array(str),
});

export const certificationSchema = z.object({
  name: str,
  year: z.number().int(),
});

export const priorityBenefitSchema = z.object({
  keyword: str,
  priority: z.number(),
});

export const userProfileSchema = z.object({
  id: str.min(1).default('default'),
  personal: z.object({
    name: str,
    email: str,
    phone: str,
    address: str,
    linkedin: str,
    nationality: str,
    years_experience: z.number(),
  }),
  executive_summary: str,
  core_competencies: z.array(str),
  career_history: z.array(careerRoleSchema),
  certifications_and_training: z.array(certificationSchema),
  priority_benefits: z.array(priorityBenefitSchema).optional(),
});

// Compile-time check that the schema's output is assignable to the engine type.
type SchemaOutput = z.output<typeof userProfileSchema>;
const _assignable: UserProfile = null as unknown as SchemaOutput;
void _assignable;

export type ProfileParseResult = { ok: true; profile: UserProfile } | { ok: false; error: string };

/** Human-readable first issue, e.g. "personal.years_experience: Expected number, received string". */
export function formatZodError(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'invalid';
  const path = issue.path.length ? issue.path.join('.') : '(root)';
  return `${path}: ${issue.message}`;
}

/** Parse raw JSON text into a validated `UserProfile`. */
export function parseProfileJson(text: string): ProfileParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  return validateProfile(data);
}

export function validateProfile(data: unknown): ProfileParseResult {
  const parsed = userProfileSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  return { ok: true, profile: parsed.data };
}

/** A blank-but-valid profile for the Fields editor when the user starts from nothing. */
export function emptyProfile(): UserProfile {
  return {
    id: 'default',
    personal: { name: '', email: '', phone: '', address: '', linkedin: '', nationality: '', years_experience: 0 },
    executive_summary: '',
    core_competencies: [],
    career_history: [],
    certifications_and_training: [],
  };
}
