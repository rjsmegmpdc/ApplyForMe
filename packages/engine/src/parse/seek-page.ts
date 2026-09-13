/**
 * Seek.co.nz job page parser — HTML in, job-ad text and metadata out. This is
 * the parsing half of v1's `fetchSeekJobPage` (src/lib/parsers/seek-email-parser.ts);
 * the fetch lives in apps/web, the engine never touches the network.
 *
 * Sources, most reliable first:
 *  1. A `<script type="application/ld+json">` JobPosting block — Seek emits
 *     one with the full description, employer, location and salary.
 *  2. The `data-automation="jobAdDetails"` container (nested divs handled by
 *     depth-counting, unlike v1's non-greedy `</div>` match), plus the
 *     `job-detail-title` / `advertiser-name` / `job-detail-location` /
 *     `job-detail-salary` elements for metadata.
 *  3. The whole page body, stripped, as a last resort.
 *
 * Output is capped at MAX_JOB_AD_CHARS so a runaway page cannot blow the
 * tailoring prompt. Pure and deterministic.
 */
import { collapseWhitespace, decodeEntities, htmlToText, innerHtmlOfElement, stripNonContent } from './html-text';

export const MAX_JOB_AD_CHARS = 12000;

export interface JobAdMeta {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
}

/** The subset of schema.org JobPosting we read. */
export interface JobPostingLd {
  title?: string;
  description?: string;
  company?: string;
  location?: string;
  salary?: string;
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const LD_SCRIPT_RE = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function isRecord(v: Json | undefined): v is { [k: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: Json | undefined): string | undefined {
  if (typeof v === 'string') {
    const s = collapseWhitespace(decodeEntities(v));
    return s.length ? s : undefined;
  }
  if (typeof v === 'number') return String(v);
  return undefined;
}

function hasType(node: { [k: string]: Json }, type: string): boolean {
  const t = node['@type'];
  if (typeof t === 'string') return t.toLowerCase() === type.toLowerCase();
  if (Array.isArray(t)) return t.some((x) => typeof x === 'string' && x.toLowerCase() === type.toLowerCase());
  return false;
}

function findJobPostingNode(root: Json): { [k: string]: Json } | null {
  if (Array.isArray(root)) {
    for (const item of root) {
      const hit = findJobPostingNode(item);
      if (hit) return hit;
    }
    return null;
  }
  if (!isRecord(root)) return null;
  if (hasType(root, 'JobPosting')) return root;
  const graph = root['@graph'];
  if (graph !== undefined) return findJobPostingNode(graph);
  return null;
}

function formatMoney(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function unitLabel(unit: string | undefined): string {
  switch ((unit ?? '').toUpperCase()) {
    case 'YEAR': return 'per year';
    case 'MONTH': return 'per month';
    case 'WEEK': return 'per week';
    case 'DAY': return 'per day';
    case 'HOUR': return 'per hour';
    default: return '';
  }
}

function salaryFromLd(base: Json | undefined): string | undefined {
  if (typeof base === 'string') return asString(base);
  if (!isRecord(base)) return undefined;
  const currency = asString(base.currency) ?? '';
  const value = base.value;
  let range = '';
  let unit = '';
  if (isRecord(value)) {
    const min = typeof value.minValue === 'number' ? value.minValue : undefined;
    const max = typeof value.maxValue === 'number' ? value.maxValue : undefined;
    const single = typeof value.value === 'number' ? value.value : undefined;
    unit = unitLabel(asString(value.unitText));
    if (min !== undefined && max !== undefined) range = `${formatMoney(min)} – ${formatMoney(max)}`;
    else if (single !== undefined) range = formatMoney(single);
    else if (min !== undefined) range = `${formatMoney(min)}+`;
    else if (max !== undefined) range = `up to ${formatMoney(max)}`;
  } else if (typeof value === 'number') {
    range = formatMoney(value);
  }
  if (!range) return undefined;
  return collapseWhitespace(`${currency} ${range} ${unit}`);
}

function locationFromLd(loc: Json | undefined): string | undefined {
  if (loc === undefined || loc === null) return undefined;
  if (typeof loc === 'string') return asString(loc);
  if (Array.isArray(loc)) {
    for (const item of loc) {
      const s = locationFromLd(item);
      if (s) return s;
    }
    return undefined;
  }
  if (!isRecord(loc)) return undefined;
  const address = loc.address;
  if (typeof address === 'string') return asString(address);
  if (isRecord(address)) {
    const parts = [address.addressLocality, address.addressRegion]
      .map(asString)
      .filter((s): s is string => Boolean(s));
    // Drop a region that merely repeats the locality ("Auckland, Auckland").
    const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
    if (unique.length) return unique.join(', ');
    return asString(address.addressCountry);
  }
  return asString(loc.name);
}

/** Parse the first JSON-LD JobPosting on the page, or null when absent/invalid. */
export function extractJsonLdJobPosting(html: string): JobPostingLd | null {
  LD_SCRIPT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LD_SCRIPT_RE.exec(html)) !== null) {
    let parsed: Json;
    try {
      parsed = JSON.parse(m[1].trim()) as Json;
    } catch {
      continue;
    }
    const node = findJobPostingNode(parsed);
    if (!node) continue;

    const org = node.hiringOrganization;
    const company = isRecord(org) ? asString(org.name) : asString(org);
    const description = typeof node.description === 'string' ? htmlToText(node.description) : undefined;

    return {
      title: asString(node.title),
      description: description && description.length ? description : undefined,
      company,
      location: locationFromLd(node.jobLocation),
      salary: salaryFromLd(node.baseSalary),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// DOM (data-automation) path
// ---------------------------------------------------------------------------

function textOfAutomation(html: string, name: string): string | undefined {
  const inner = innerHtmlOfElement(html, 'data-automation', name);
  if (inner === null) return undefined;
  const text = collapseWhitespace(htmlToText(inner));
  return text.length ? text : undefined;
}

function cap(text: string): string {
  return text.length > MAX_JOB_AD_CHARS ? text.slice(0, MAX_JOB_AD_CHARS).trimEnd() : text;
}

/**
 * The job ad as plain text: JSON-LD description, else the jobAdDetails
 * container, else the stripped page. Empty string for empty input.
 */
export function extractJobAdText(html: string): string {
  if (!html || !html.trim()) return '';

  const ld = extractJsonLdJobPosting(html);
  if (ld?.description) return cap(ld.description);

  const details = innerHtmlOfElement(html, 'data-automation', 'jobAdDetails');
  if (details !== null) {
    const text = htmlToText(details);
    if (text.length) return cap(text);
  }

  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  const source = bodyMatch ? bodyMatch[1] : stripNonContent(html);
  return cap(htmlToText(source));
}

/** Title / company / location / salary from JSON-LD first, then Seek's data-automation markup. */
export function extractJobAdMeta(html: string): JobAdMeta {
  if (!html || !html.trim()) return {};

  const ld = extractJsonLdJobPosting(html);
  const meta: JobAdMeta = {};

  const title = ld?.title ?? textOfAutomation(html, 'job-detail-title');
  const company = ld?.company ?? textOfAutomation(html, 'advertiser-name');
  const location = ld?.location ?? textOfAutomation(html, 'job-detail-location');
  const salary = ld?.salary ?? textOfAutomation(html, 'job-detail-salary');

  if (title) meta.title = title;
  if (company) meta.company = company;
  if (location) meta.location = location;
  if (salary) meta.salary = salary;

  if (!meta.title) {
    const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (t) {
      const cleaned = collapseWhitespace(decodeEntities(t[1])).replace(/\s+job\s+in\s+.*$/i, '').replace(/\s*[-|]\s*seek\s*$/i, '');
      if (cleaned) meta.title = cleaned;
    }
  }

  return meta;
}
