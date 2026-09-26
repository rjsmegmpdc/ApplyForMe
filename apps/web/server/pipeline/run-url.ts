/**
 * Run a single job URL through the pipeline on demand — the "paste a job
 * link" path, as opposed to the email-driven one. Builds a minimal listing
 * from the URL (plus optional pasted ad text, used when the page cannot be
 * fetched, e.g. LinkedIn blocking automated reads) and hands it to
 * processListing, so dedupe, rules, analysis, tailoring, DOCX and the review
 * email all behave exactly as for an alert.
 */
import type { JobListing } from '@applyforme/engine';
import { extractJobInfo, jobSourceOfUrl } from '@applyforme/engine';
import { processListing, type PipelineDeps, type ProcessResult } from './run-job';

export interface RunUrlInput {
  userId: number;
  url: string;
  /** Optional pasted job-ad text; becomes the listing snippet (used if the page fetch fails, and as title/company hints). */
  text?: string | null;
}

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function listingFromUrl(url: string, text?: string | null): JobListing {
  const cleaned = (text ?? '').trim();
  const info = cleaned ? extractJobInfo(cleaned) : { title: '', company: '' };
  return {
    title: info.title === 'Target Role' ? '' : info.title,
    company: info.company === 'Target Company' ? '' : info.company,
    location: '',
    salary: '',
    description: cleaned,
    url,
  };
}

export async function runJobUrl(deps: PipelineDeps, input: RunUrlInput): Promise<ProcessResult & { source: string | null }> {
  const listing = listingFromUrl(input.url, input.text);
  const result = await processListing(deps, { userId: input.userId, processedEmailId: null, listing });
  return { ...result, source: jobSourceOfUrl(input.url) };
}
