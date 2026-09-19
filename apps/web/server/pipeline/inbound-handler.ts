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
import { parseSeekAlert, type JobListing } from '@applyforme/engine';
import { dbFromEnv, schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { extractForwardConfirmationCode, extractForwardConfirmationLinks, isSeekAlert, parseInboundEmail, readRawMessage, type InboundEmail } from '@/server/email/inbound';
import { resolveSendFn } from '@/server/email/send';
import { resolveGenerateFn } from '@/server/ai/resolve-generate';
import { ensureDefaultUser, findProcessedEmail, recordProcessedEmail } from '@/server/runs';
import { processListing, type PipelineDeps, type ProcessResult } from './run-job';

export const FETCH_TIMEOUT_MS = 10_000;
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** Fetch a job page like a desktop browser; null on non-2xx, timeout or network error (the pipeline then uses the alert snippet). */
export async function fetchJobPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': DESKTOP_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-NZ,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Real dependencies from the Worker env — the only place the pipeline touches bindings directly. */
export function buildPipelineDeps(env: CloudflareEnv): PipelineDeps {
  const db = dbFromEnv(env);
  return {
    db,
    env,
    send: resolveSendFn(env),
    fetchPage: fetchJobPage,
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
export async function processListings(deps: PipelineDeps, email: InboundEmail, processedEmailId: number, listings: JobListing[]): Promise<ProcessResult[]> {
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
      source: 'seek',
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

  if (!isSeekAlert(email)) {
    await recordProcessedEmail(db, { messageId: email.messageId, source: 'other', subject: email.subject, receivedAt: email.date, status: 'ignored' });
    return { kind: 'ignored', messageId: email.messageId };
  }

  const listings = parseSeekAlert(email.html ?? email.text ?? '');
  const ledger = await recordProcessedEmail(db, {
    messageId: email.messageId,
    source: 'seek',
    subject: email.subject,
    receivedAt: email.date,
    jobsFound: listings.length,
    status: 'processed',
  });

  waitUntil(processListings(deps, email, ledger.id, listings));
  return { kind: 'processed', processedEmailId: ledger.id, jobs: listings.length };
}

/** Worker entry (worker.ts `email`). */
export async function handleInboundEmail(message: ForwardableEmailMessage, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
  const raw = await readRawMessage(message);
  const outcome = await processInboundEmail(raw, buildPipelineDeps(env), (work) => ctx.waitUntil(work));
  console.log(`[inbound] ${outcome.kind}${outcome.kind === 'processed' ? ` jobs=${outcome.jobs}` : ''}`);
}
