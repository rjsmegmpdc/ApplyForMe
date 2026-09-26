/**
 * The `email` Worker handler — Email Routing delivers every message sent
 * to jobs@<domain> here as a raw MIME stream. This module classifies the
 * message and hands Seek alerts to the pipeline:
 *
 *   raw → parseInboundEmail → already processed? → Gmail forwarding
 *   confirmation? (store the code as a preference note so the Settings
 *   page can show it) → not a Seek alert? ('ignored') → parseSeekAlert →
 *   processed_emails row → processListing per job, under ctx.waitUntil so
 *   the handler returns to Email Routing promptly.
 *
 * `buildPipelineDeps` is the only place real I/O is wired (D1 from env,
 * the mailer, a fetch with a desktop UA and a 10 s timeout, the model
 * resolver, the clock) — `processInboundEmail` takes those deps as a
 * parameter so tests drive the same path with fakes.
 *
 * Single user for now: every alert is processed for DEFAULT_USER_ID.
 * Multi-user routing (map the recipient address — e.g. jobs+matt@… — to a
 * users row) is a later step; the `to` address is already parsed.
 */
import { extractLinkedInJobId, parseJobAlert, type JobListing, type JobSource } from '@applyforme/engine';
import { dbFromEnv, schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { detectAlertSource, extractForwardConfirmationCode, extractForwardConfirmationLinks, parseInboundEmail, readRawMessage, type InboundEmail } from '@/server/email/inbound';
import { resolveSendFn } from '@/server/email/send';
import { resolveGenerateFn } from '@/server/ai/resolve-generate';
import { ensureDefaultUser, findProcessedEmail, recordProcessedEmail } from '@/server/runs';
import { processListing, type PipelineDeps, type ProcessResult } from './run-job';
import { apifyConfigFromEnv, fetchPageViaApify, type ApifyConfig, type FetchedPage } from '@/server/fetch/apify';

export const FETCH_TIMEOUT_MS = 10_000;
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
/** Sent on every outbound page/redirect request so we look like a browser click, not a bare bot. */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': DESKTOP_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

/**
 * Fetch a job page like a desktop browser; null on non-2xx, timeout, network
 * error, or a page with no usable job content (the pipeline then uses the
 * alert snippet). For LinkedIn URLs the guest job-posting endpoint is tried
 * first, then /jobs/view/. In practice both boards refuse Cloudflare egress
 * (Seek 403 on every host, LinkedIn 429), so when every direct read fails and
 * Apify is configured (APIFY_TOKEN) the page is fetched through an Apify
 * actor as a last resort — which also resolves Seek's tracked links, so the
 * returned `finalUrl` is the canonical job page. Outcomes are logged.
 */
export async function fetchJobPage(url: string, apify: ApifyConfig | null = null): Promise<FetchedPage | null> {
  const liId = extractLinkedInJobId(url);
  const candidates = liId
    ? [`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${liId}`, `https://www.linkedin.com/jobs/view/${liId}/`, url]
    : [url];
  for (const candidate of [...new Set(candidates)]) {
    const html = await fetchOnce(candidate);
    if (html && looksLikeJobContent(html)) {
      console.log(`[fetch] ok ${candidate} bytes=${html.length}`);
      return { html, finalUrl: candidate === url ? null : candidate };
    }
  }
  if (apify) {
    console.log(`[fetch] direct reads failed for ${url}; trying Apify actor ${apify.actor}`);
    const target = liId ? `https://www.linkedin.com/jobs/view/${liId}/` : url;
    const page = await fetchPageViaApify(target, apify, looksLikeJobContent);
    if (page) return page;
    if (liId) return fetchPageViaApify(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${liId}`, apify, looksLikeJobContent);
  }
  return null;
}

/** Cheap check that a fetched page is a job ad rather than a login/consent/error shell. */
export function looksLikeJobContent(html: string): boolean {
  if (html.length < 800) return false;
  if (/authwall|sign in to view|join now to see|checkpoint\/challenge|captcha/i.test(html) && !/jobAdDetails|description__text|JobPosting/i.test(html)) return false;
  return /JobPosting|jobAdDetails|description__text|show-more-less-html|job-details|jobDescription|<h1/i.test(html);
}

async function fetchOnce(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    console.log(`[fetch] ${res.status} ${url} -> ${res.url} bytes=${text.length}`);
    if (!res.ok) return null;
    return text;
  } catch (e) {
    console.log(`[fetch] error ${url}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Follow redirects manually (max 6 hops) and return the final URL without
 * downloading the destination body — Seek's tracked links 302 to the job page.
 */
export async function resolveRedirectUrl(url: string): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, { method: 'GET', redirect: 'manual', headers: BROWSER_HEADERS, signal: controller.signal });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current).toString();
        continue;
      }
      console.log(`[resolve] ${url} -> ${current} (${res.status})`);
      return current;
    } catch (e) {
      console.log(`[resolve] error ${current}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  console.log(`[resolve] too many redirects for ${url}`);
  return current;
}

/** Real dependencies from the Worker env — the only place the pipeline touches bindings directly. */
export function buildPipelineDeps(env: CloudflareEnv): PipelineDeps {
  const db = dbFromEnv(env);
  return {
    db,
    env,
    send: resolveSendFn(env),
    fetchPage: (url) => fetchJobPage(url, apifyConfigFromEnv(env)),
    resolveRedirect: resolveRedirectUrl,
    generateFor: (userId) => resolveGenerateFn(db, env, userId),
    now: Date.now,
  };
}

export type InboundOutcome =
  | { kind: 'duplicate'; messageId: string }
  | { kind: 'forward-confirmation'; code: string }
  | { kind: 'ignored'; messageId: string }
  | { kind: 'processed'; processedEmailId: number; jobs: number };

/** Run every listing in order; a throw in one listing never stops the others. Marks the ledger row 'failed' if any listing threw. */
export async function processListings(deps: PipelineDeps, email: InboundEmail, source: JobSource, processedEmailId: number, listings: JobListing[]): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  const errors: string[] = [];
  for (const listing of listings) {
    try {
      results.push(await processListing(deps, { userId: DEFAULT_USER_ID, processedEmailId, listing }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[inbound] listing ${listing.url || listing.title} threw: ${msg}`);
      errors.push(`${listing.title}: ${msg}`);
    }
  }
  if (errors.length > 0) {
    await recordProcessedEmail(deps.db, {
      messageId: email.messageId,
      source,
      subject: email.subject,
      receivedAt: email.date,
      jobsFound: listings.length,
      status: 'failed',
      error: errors.join(' | ').slice(0, 500),
    });
  }
  return results;
}

/**
 * Classify one raw message and start the pipeline for a Seek alert. The
 * per-listing work is handed to `waitUntil` (ctx.waitUntil in the Worker,
 * a collector in tests) so the caller can return as soon as the ledger
 * row exists.
 */
export async function processInboundEmail(raw: string, deps: PipelineDeps, waitUntil: (work: Promise<unknown>) => void): Promise<InboundOutcome> {
  const { db } = deps;
  const email = await parseInboundEmail(raw);

  // Redelivery (or a Gmail double-forward) is a no-op — checked first so the
  // confirmation-code and ignore paths are idempotent too.
  if (await findProcessedEmail(db, email.messageId)) {
    return { kind: 'duplicate', messageId: email.messageId };
  }
  await ensureDefaultUser(db);

  const code = extractForwardConfirmationCode(email);
  if (code) {
    const links = extractForwardConfirmationLinks(email);
    const link = links[0] ?? null;
    await db.insert(schema.preferences).values({
      userId: DEFAULT_USER_ID,
      kind: 'note',
      source: 'feedback',
      text: `Gmail forwarding confirmation code: ${code}${links.length ? ` | links: ${links.slice(0, 5).join(' ')}` : ''}`,
    });
    await recordProcessedEmail(db, { messageId: email.messageId, source: 'other', subject: email.subject, receivedAt: email.date, status: 'ignored' });
    console.log(`[inbound] Gmail forwarding confirmation code received: ${code}${link ? ` link: ${link}` : ''}`);
    return { kind: 'forward-confirmation', code };
  }

  const source = detectAlertSource(email);
  if (!source) {
    await recordProcessedEmail(db, { messageId: email.messageId, source: 'other', subject: email.subject, receivedAt: email.date, status: 'ignored' });
    // Logged (not stored) so an unrecognised alert format can be diagnosed from Workers Logs.
    const links = [...`${email.text ?? ''}\n${email.html ?? ''}`.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)].map((m) => m[0]).slice(0, 25);
    console.log(`[inbound] ignored subject=${JSON.stringify(email.subject)} from=${email.from} links=${JSON.stringify(links)}`);
    return { kind: 'ignored', messageId: email.messageId };
  }

  const listings = parseJobAlert(source, email.html ?? email.text ?? '', email.subject);
  const ledger = await recordProcessedEmail(db, {
    messageId: email.messageId,
    source,
    subject: email.subject,
    receivedAt: email.date,
    jobsFound: listings.length,
    status: 'processed',
  });

  waitUntil(processListings(deps, email, source, ledger.id, listings));
  return { kind: 'processed', processedEmailId: ledger.id, jobs: listings.length };
}

/** Worker entry (worker.ts `email`). */
export async function handleInboundEmail(message: ForwardableEmailMessage, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
  const raw = await readRawMessage(message);
  // Keep the raw message (30-day housekeeping is manual for now) so an alert
  // the parser mishandled can be replayed and the parser fixed against it.
  if (env.DOCS) {
    const key = `inbound/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.eml`;
    ctx.waitUntil(env.DOCS.put(key, raw, { httpMetadata: { contentType: 'message/rfc822' } }).then(() => console.log(`[inbound] archived ${key} bytes=${raw.length}`)).catch((e) => console.log(`[inbound] archive failed: ${e}`)));
  }
  const outcome = await processInboundEmail(raw, buildPipelineDeps(env), (work) => ctx.waitUntil(work));
  console.log(`[inbound] ${outcome.kind}${outcome.kind === 'processed' ? ` jobs=${outcome.jobs}` : ''}`);
}
