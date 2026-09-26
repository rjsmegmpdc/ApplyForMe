/**
 * Run a single job URL through the pipeline on demand — the "paste a job
 * link" path, as opposed to the email-driven one. Builds a minimal listing
 * from the URL (plus optional pasted ad text, used when the page cannot be
 * fetched, e.g. LinkedIn blocking automated reads, and optional explicit
 * title / company / location / salary) and hands it to processListing, so
 * dedupe, rules, analysis, tailoring, DOCX and the review email all behave
 * exactly as for an alert.
 */
import { z } from 'zod';
import type { JobListing } from '@applyforme/engine';
import { extractJobInfo, jobSourceOfUrl } from '@applyforme/engine';
import { processListing, type PipelineDeps, type ProcessResult } from './run-job';

export interface RunUrlInput {
  userId: number;
  url: string;
  /** Optional pasted job-ad text; becomes the listing snippet (used if the page fetch fails, and as title/company hints). */
  text?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  salary?: string | null;
}

const optionalLine = z.string().trim().max(300).optional().nullable();

export const runUrlBodySchema = z.object({
  url: z.string().trim().min(8).max(2000),
  text: z.string().max(60_000).optional().nullable(),
  title: optionalLine,
  company: optionalLine,
  location: optionalLine,
  salary: optionalLine,
});

export type RunUrlBody = z.infer<typeof runUrlBodySchema>;

/** Validate a request body; null when the shape or URL is unusable. */
export function parseRunUrlBody(body: unknown): RunUrlBody | null {
  const parsed = runUrlBodySchema.safeParse(body);
  if (!parsed.success || !isHttpUrl(parsed.data.url)) return null;
  return parsed.data;
}

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function listingFromUrl(url: string, text?: string | null, fields: Omit<RunUrlBody, 'url' | 'text'> = {}): JobListing {
  const cleaned = (text ?? '').trim();
  const info = cleaned ? extractJobInfo(cleaned) : { title: '', company: '' };
  return {
    title: fields.title?.trim() || (info.title === 'Target Role' ? '' : info.title),
    company: fields.company?.trim() || (info.company === 'Target Company' ? '' : info.company),
    location: fields.location?.trim() || '',
    salary: fields.salary?.trim() || '',
    description: cleaned,
    url,
  };
}

export async function runJobUrl(deps: PipelineDeps, input: RunUrlInput): Promise<ProcessResult & { source: string | null }> {
  const { userId, url, text, ...fields } = input;
  const listing = listingFromUrl(url, text, fields);
  const result = await processListing(deps, { userId, processedEmailId: null, listing });
  return { ...result, source: jobSourceOfUrl(url) };
}
