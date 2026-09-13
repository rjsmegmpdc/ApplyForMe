import { z } from 'zod';

/**
 * Defensive readers for the JSON columns on `runs`. The pipeline writes
 * engine shapes (TriggerDecision, AnalysisResult, TailoredOutput) but those
 * modules are still landing, so the detail page parses leniently: every
 * field optional, unknown keys kept, and a null result when the text is not
 * JSON at all — the page then shows the raw text in a <details> instead of
 * crashing.
 */

// Non-string entries collapse to [] rather than failing the whole parse.
const strArr = z.array(z.string()).catch([]);

export const triggerViewSchema = z
  .object({
    decision: z.enum(['process', 'skip']).optional(),
    reasons: strArr.optional(),
    keywordHits: strArr.optional(),
    preferredCompany: z.boolean().optional(),
  })
  .passthrough();
export type TriggerView = z.infer<typeof triggerViewSchema>;

export const analysisViewSchema = z
  .object({
    matchPercentage: z.number().optional(),
    keywordsFound: strArr.optional(),
    matches: z
      .array(
        z
          .object({
            requirement: z
              .object({
                category: z.string().optional(),
                requirement: z.string().optional(),
                importance: z.string().optional(),
              })
              .passthrough(),
            matched: z.boolean().optional(),
            evidence: strArr.optional(),
            matchStrength: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
    missingSkills: strArr.optional(),
    recommendedCertifications: strArr.optional(),
    benefitMatches: z.array(z.object({ keyword: z.string(), found: z.boolean(), context: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough();
export type AnalysisView = z.infer<typeof analysisViewSchema>;

export const tailoredViewSchema = z
  .object({
    summary: z.string().optional(),
    highlights: z.array(z.object({ role: z.string().optional(), company: z.string().optional(), bullets: strArr }).passthrough()).optional(),
    coverLetter: z.object({ paragraphs: strArr }).passthrough().optional(),
  })
  .passthrough();
export type TailoredView = z.infer<typeof tailoredViewSchema>;

// Generic over the schema (not its output) so passthrough objects keep their declared field types.
function readJson<S extends z.ZodTypeAny>(text: string | null | undefined, schema: S): z.output<S> | null {
  if (!text) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data as z.output<S>) : null;
  } catch {
    return null;
  }
}

export const readTrigger = (text: string | null | undefined) => readJson(text, triggerViewSchema);
export const readAnalysis = (text: string | null | undefined) => readJson(text, analysisViewSchema);
export const readTailored = (text: string | null | undefined) => readJson(text, tailoredViewSchema);
