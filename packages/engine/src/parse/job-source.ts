/**
 * Which job board an alert email or job URL belongs to, and a stable key for
 * deduping runs across sources. Pure.
 */
import type { JobListing } from '../types';
import { extractLinkedInJobId, parseLinkedInAlert } from './linkedin-email';
import { extractSeekJobId, parseSeekAlert } from './seek-email';

export type JobSource = 'seek' | 'linkedin';

const SEEK_LINK_RE = /https?:\/\/(?:www\.)?seek\.co\.nz\/job\/\d+/i;
const LINKEDIN_LINK_RE = /https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/(?:comm\/)?jobs\/view\//i;

/** Detect the source of an alert from sender, subject and body. Null when it is not a job alert we understand. */
export function detectJobSource(input: { from: string; subject: string; body: string }): JobSource | null {
  const { from, subject, body } = input;
  if (/seek\.co\.nz/i.test(from) || (/seek/i.test(subject + body) && SEEK_LINK_RE.test(body))) return 'seek';
  if (/linkedin\.com/i.test(from) || LINKEDIN_LINK_RE.test(body)) return 'linkedin';
  return null;
}

/** Parse an alert with the parser for its source. */
export function parseJobAlert(source: JobSource, htmlOrText: string, subject = ''): JobListing[] {
  return source === 'seek' ? parseSeekAlert(htmlOrText) : parseLinkedInAlert(htmlOrText, subject);
}

/** Source of a single job URL, if recognised. */
export function jobSourceOfUrl(url: string): JobSource | null {
  if (extractSeekJobId(url)) return 'seek';
  if (extractLinkedInJobId(url)) return 'linkedin';
  return null;
}

/**
 * Stable dedupe key for a listing: `seek:<id>` / `linkedin:<id>` when the URL
 * carries a job id, else null (callers fall back to a hash of title+company).
 * Seek ids stay bare (`<id>`) for compatibility with rows written before
 * LinkedIn support existed.
 */
export function listingKey(listing: Pick<JobListing, 'url'>): string | null {
  const seek = extractSeekJobId(listing.url);
  if (seek) return seek;
  const li = extractLinkedInJobId(listing.url);
  if (li) return `linkedin:${li}`;
  return null;
}

/** Human label for the apply button / link. */
export function sourceLabel(source: JobSource | null): string {
  return source === 'linkedin' ? 'LinkedIn' : source === 'seek' ? 'Seek' : 'the job board';
}
