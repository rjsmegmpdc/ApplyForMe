/**
 * Apify fallback for job pages the Worker cannot read directly.
 *
 * Both job boards refuse Cloudflare egress: Seek (every host, including
 * www.seek.co.nz/job/<id> and the email.s.seek.co.nz tracked links) answers
 * 403, LinkedIn answers 429 on /jobs/view/<id> and on its guest job-posting
 * endpoint. So when direct fetch fails and APIFY_TOKEN is set, the page is
 * fetched through an Apify actor — by default `apify/cheerio-scraper` with a
 * residential proxy, whose page function simply returns the page HTML and the
 * URL it finally loaded (tracked links redirect to the canonical job page).
 * The engine's parser then reads that HTML exactly as it would a direct read,
 * and the pipeline adopts the final URL as the Apply link.
 *
 * Everything is configuration because store actors differ:
 *   APIFY_ACTOR   `username~actor-name`         (default apify~cheerio-scraper)
 *   APIFY_INPUT   JSON template for the run; `{{url}}` / `{{id}}` substituted
 * A dedicated job-detail actor also works: when the first dataset item has no
 * `html`, its fields are mapped heuristically (title / company / location /
 * salary / the longest `…desc…` field) into a JSON-LD JobPosting page.
 *
 * Endpoint: POST https://api.apify.com/v2/acts/<actor>/run-sync-get-dataset-items
 */
import { extractLinkedInJobId, extractSeekJobId } from '@applyforme/engine';

export const APIFY_API_BASE = 'https://api.apify.com/v2';
/** Actor run + HTTP wait budget. Apify caps synchronous runs at 300 s; a one-page scrape takes 10–40 s. */
export const APIFY_TIMEOUT_SECONDS = 120;
export const DEFAULT_APIFY_ACTOR = 'apify~cheerio-scraper';

const PAGE_FUNCTION =
  'async function pageFunction(context) { const { $, request } = context; ' +
  'return { url: request.url, loadedUrl: request.loadedUrl || request.url, html: $.html() }; }';

/** One page, no crawling, residential proxy (datacenter IPs get the same blocks the Worker does). */
export const DEFAULT_APIFY_INPUT = JSON.stringify({
  startUrls: [{ url: '{{url}}' }],
  linkSelector: '',
  maxPagesPerCrawl: 1,
  maxRequestRetries: 2,
  pageLoadTimeoutSecs: 30,
  proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
  pageFunction: PAGE_FUNCTION,
});

export interface ApifyConfig {
  token: string;
  /** `username~actor-name` (Apify's URL-safe form) or an actor id. */
  actor: string;
  /** JSON input template; `{{url}}` and `{{id}}` are substituted (JSON-escaped). */
  inputTemplate: string;
  timeoutSeconds: number;
}

export interface ApifyEnv {
  APIFY_TOKEN?: string;
  APIFY_ACTOR?: string;
  APIFY_INPUT?: string;
}

/** What a fetch produced: the page and, when known, the URL it finally loaded (after redirects). */
export interface FetchedPage {
  html: string;
  finalUrl: string | null;
}

/** null when no token is configured — the fallback is then inert. */
export function apifyConfigFromEnv(env: ApifyEnv): ApifyConfig | null {
  const token = env.APIFY_TOKEN?.trim();
  if (!token) return null;
  return {
    token,
    actor: normaliseActor(env.APIFY_ACTOR?.trim() || DEFAULT_APIFY_ACTOR),
    inputTemplate: env.APIFY_INPUT?.trim() || DEFAULT_APIFY_INPUT,
    timeoutSeconds: APIFY_TIMEOUT_SECONDS,
  };
}

/** Accept `user/actor` (store URL form) as well as `user~actor`. */
export function normaliseActor(actor: string): string {
  return actor.replace(/^https?:\/\/apify\.com\//i, '').replace(/\/+$/, '').replace('/', '~');
}

/** Substitute placeholders and parse; falls back to the default template if the configured one is not valid JSON. */
export function buildActorInput(template: string, url: string): unknown {
  const id = extractLinkedInJobId(url) ?? extractSeekJobId(url) ?? '';
  const fill = (t: string) => t.replace(/\{\{\s*url\s*\}\}/g, jsonEscape(url)).replace(/\{\{\s*id\s*\}\}/g, jsonEscape(id));
  try {
    return JSON.parse(fill(template));
  } catch {
    console.warn('[apify] APIFY_INPUT is not valid JSON after substitution; using default input');
    return JSON.parse(fill(DEFAULT_APIFY_INPUT));
  }
}

function jsonEscape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

export function runSyncUrl(config: ApifyConfig): string {
  const u = new URL(`${APIFY_API_BASE}/acts/${encodeURIComponent(config.actor)}/run-sync-get-dataset-items`);
  u.searchParams.set('timeout', String(config.timeoutSeconds));
  u.searchParams.set('clean', 'true');
  return u.toString();
}

// ---------------------------------------------------------------------------
// Dataset item → page
// ---------------------------------------------------------------------------

export interface ApifyJobItem {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  /** Description as HTML or plain text. */
  description?: string;
  url?: string;
}

type Item = Record<string, unknown>;

const HTML_KEYS = ['html', 'pageHtml', 'body', 'content'];
const FINAL_URL_KEYS = ['loadedUrl', 'finalUrl', 'url', 'link', 'jobUrl', 'job_url'];
const TITLE_KEYS = ['title', 'jobTitle', 'job_title', 'name', 'positionName'];
const COMPANY_KEYS = ['companyName', 'company', 'company_name', 'organization', 'employer', 'hiringOrganization'];
const LOCATION_KEYS = ['location', 'jobLocation', 'job_location', 'formattedLocation', 'city'];
const SALARY_KEYS = ['salary', 'salaryInfo', 'salary_info', 'salaryText', 'compensation', 'pay', 'baseSalary'];

function firstString(item: Item, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = scalarText(item[k]);
    if (s) return s;
  }
  return undefined;
}

/** A string, a number, an array of strings joined, or an object's `name`/`text` — anything else is ignored. */
function scalarText(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    const parts = v.map(scalarText).filter((s): s is string => Boolean(s));
    return parts.length ? parts.join(' ') : undefined;
  }
  if (v && typeof v === 'object') {
    const o = v as Item;
    return scalarText(o.name) ?? scalarText(o.text) ?? scalarText(o.value);
  }
  return undefined;
}

/** The longest string under any key containing "desc" (descriptionHtml, descriptionText, jobDescription, …). */
function descriptionOf(item: Item): string | undefined {
  let best: string | undefined;
  for (const [k, v] of Object.entries(item)) {
    if (!/desc/i.test(k)) continue;
    const s = scalarText(v);
    if (s && (!best || s.length > best.length)) best = s;
  }
  return best;
}

/** Map one dataset item to the fields we need; null when there is no usable description. */
export function jobItemFromDataset(items: unknown): ApifyJobItem | null {
  if (!Array.isArray(items)) return null;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Item;
    const description = descriptionOf(item);
    if (!description || description.length < 80) continue;
    return {
      title: firstString(item, TITLE_KEYS),
      company: firstString(item, COMPANY_KEYS),
      location: firstString(item, LOCATION_KEYS),
      salary: firstString(item, SALARY_KEYS),
      description,
      url: firstString(item, FINAL_URL_KEYS),
    };
  }
  return null;
}

/**
 * The page from a dataset: a raw-HTML item (generic scraper) wins; else a
 * job-detail item is rendered as a JSON-LD page. null when neither is usable.
 */
export function pageFromDataset(items: unknown, isJobPage: (html: string) => boolean): FetchedPage | null {
  if (Array.isArray(items)) {
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Item;
      const html = firstString(item, HTML_KEYS);
      if (html && /<html|<body|<script|<div/i.test(html) && isJobPage(html)) {
        return { html, finalUrl: firstString(item, FINAL_URL_KEYS) ?? null };
      }
    }
  }
  const job = jobItemFromDataset(items);
  return job ? { html: jobItemToHtml(job), finalUrl: job.url ?? null } : null;
}

/**
 * Render as the smallest HTML page the engine parser fully understands: a
 * JSON-LD JobPosting. A plain-text description gets `<br>` line breaks so
 * htmlToText keeps its paragraph structure.
 */
export function jobItemToHtml(job: ApifyJobItem): string {
  const description = job.description ?? '';
  const descriptionHtml = /<[a-z][^>]*>/i.test(description) ? description : escapeHtml(description).replace(/\r?\n/g, '<br>');
  const posting: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'JobPosting', description: descriptionHtml };
  if (job.title) posting.title = job.title;
  if (job.company) posting.hiringOrganization = { '@type': 'Organization', name: job.company };
  if (job.location) posting.jobLocation = { '@type': 'Place', address: job.location };
  if (job.salary) posting.baseSalary = job.salary;
  if (job.url) posting.url = job.url;
  // `</script>` inside the JSON would end the block early — JSON allows `<\/`.
  const json = JSON.stringify(posting).replace(/<\//g, '<\\/');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(job.title ?? 'Job')}</title>` +
    `<script type="application/ld+json">${json}</script></head><body data-source="apify"></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Run the actor for one URL and return the page, or null on any failure
 * (HTTP error, timeout, no usable item). Never throws.
 */
export async function fetchPageViaApify(
  url: string,
  config: ApifyConfig,
  isJobPage: (html: string) => boolean,
  fetchImpl: FetchLike = fetch
): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (config.timeoutSeconds + 15) * 1000);
  const started = Date.now();
  try {
    const res = await fetchImpl(runSyncUrl(config), {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildActorInput(config.inputTemplate, url)),
      signal: controller.signal,
    });
    const text = await res.text();
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (!res.ok) {
      console.log(`[apify] ${res.status} actor=${config.actor} url=${url} (${secs}s): ${text.slice(0, 300)}`);
      return null;
    }
    let items: unknown;
    try {
      items = JSON.parse(text);
    } catch {
      console.log(`[apify] non-JSON response actor=${config.actor} url=${url} (${secs}s)`);
      return null;
    }
    const page = pageFromDataset(items, isJobPage);
    if (!page) {
      const n = Array.isArray(items) ? items.length : 0;
      const keys = Array.isArray(items) && items[0] && typeof items[0] === 'object' ? Object.keys(items[0] as Item).join(',') : '';
      console.log(`[apify] no usable page actor=${config.actor} url=${url} items=${n} keys=${keys} (${secs}s)`);
      return null;
    }
    console.log(`[apify] ok actor=${config.actor} url=${url} -> ${page.finalUrl ?? '?'} bytes=${page.html.length} (${secs}s)`);
    return page;
  } catch (e) {
    console.log(`[apify] error actor=${config.actor} url=${url}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
