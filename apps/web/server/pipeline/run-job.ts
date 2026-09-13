/**
 * The orchestrator — one Seek listing in, one review pack out. Pure of I/O
 * except through the injected `PipelineDeps` (db, env bindings, mailer,
 * page fetcher, model resolver, clock), so the same code runs from the
 * `email` handler, the `scheduled` sweep and the tests.
 *
 * processListing:
 *   1. dedupe on the Seek job id (an existing run is skipped; one flagged
 *      'regenerate' is regenerated instead)
 *   2. default profile (none → run 'failed')
 *   3. fetch the full ad, else fall back to the alert snippet
 *   4. deterministic analysis (engine)
 *   5. trigger rules → run row created either way ('skipped' costs no tokens)
 *   6–10. tailorAndDeliver: budget → model (or deterministic fallback) →
 *      DOCX → R2 → signed links → review email → run 'sent'
 * Any throw inside 6–10 marks the run 'failed' with the message; nothing is
 * rethrown, so one bad listing never takes the rest of an alert down.
 *
 * processRegenerate re-runs 6–10 on an existing run from its stored job
 * text and analysis with the newest preferences.
 */
import { eq } from 'drizzle-orm';
import {
  analyzeJob,
  DEFAULT_TRIGGER_RULES,
  evaluateTrigger,
  extractJobAdMeta,
  extractJobAdText,
  extractSeekJobId,
  type AnalysisResult,
  type JobListing,
  type TailoredOutput,
  type TriggerDecision,
  type TriggerRules,
} from '@applyforme/engine';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import type { Profile, Run, RunStatus } from '@/server/db/schema';
import { createRun, findRunBySeekJobId, getOrCreateDefaultProfile, getRun, getTriggerRules, listPreferences, updateRun } from '@/server/runs';
import type { SendFn } from '@/server/email/send';
import { signActionLink, type RunAction } from '@/lib/action-links';
import type { GenerateFn } from '@/server/ai/anthropic';
import { checkDailyBudget, DAILY_TAILOR_BUDGET, NZ_TIME_ZONE } from '@/server/ai/budget';
import { deterministicTailored, tailorWithGuard, type TailorInput } from '@/server/ai/tailor';
import { base64ToBytes, docxToBase64, DOCX_CONTENT_TYPE, renderCvDocx, renderLetterDocx, safeFilename } from '@/server/docs/docx';
import { buildReviewEmail, type ReviewLinks, type ReviewOrigin } from './review-email';

export interface PipelineDeps {
  db: Db;
  env: CloudflareEnv;
  send: SendFn;
  /** Full HTML of a job page, or null when it cannot be fetched (non-2xx, timeout, network error). */
  fetchPage: (url: string) => Promise<string | null>;
  /** Model resolution per user (server/ai/resolve-generate.ts); `generate` null means deterministic-only. */
  generateFor: (userId: number) => Promise<{ generate: GenerateFn | null; provider: string }>;
  /** Milliseconds since epoch — injected so tests pin the date. */
  now: () => number;
}

export interface ProcessResult {
  runId: number;
  status: RunStatus;
  reason?: string;
}

/** How long a signed action link stays valid — `exp` is UNIX SECONDS (verifyActionLink compares against Math.floor(Date.now()/1000)). */
export const ACTION_LINK_TTL_SECONDS = 14 * 24 * 60 * 60;
const MAX_ERROR_CHARS = 500;
const ACTIONS: { key: keyof ReviewLinks; action: RunAction }[] = [
  { key: 'applied', action: 'applied' },
  { key: 'rejected', action: 'rejected' },
  { key: 'regenerate', action: 'regenerate' },
  { key: 'thumbsUp', action: 'thumbs-up' },
];

/* ------------------------------------------------------------------------ */
/* Small helpers                                                             */
/* ------------------------------------------------------------------------ */

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, MAX_ERROR_CHARS);
}

/** "13 September 2026" in NZ local time — the cover letter's date line. */
export function nzLongDate(ms: number): string {
  return new Intl.DateTimeFormat('en-NZ', { timeZone: NZ_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
}

/** Stored rules JSON → TriggerRules, defaults filling any gap; malformed JSON → defaults. */
export function parseTriggerRules(rulesJson: string | null | undefined): TriggerRules {
  if (!rulesJson) return DEFAULT_TRIGGER_RULES;
  try {
    const parsed = JSON.parse(rulesJson) as Partial<TriggerRules> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_TRIGGER_RULES;
    const list = (v: unknown, fallback: string[]): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback);
    return {
      keywordsAny: list(parsed.keywordsAny, DEFAULT_TRIGGER_RULES.keywordsAny),
      keywordsAll: list(parsed.keywordsAll, DEFAULT_TRIGGER_RULES.keywordsAll),
      preferredCompanies: list(parsed.preferredCompanies, DEFAULT_TRIGGER_RULES.preferredCompanies),
      excludedCompanies: list(parsed.excludedCompanies, DEFAULT_TRIGGER_RULES.excludedCompanies),
      excludedTerms: list(parsed.excludedTerms, DEFAULT_TRIGGER_RULES.excludedTerms),
      locations: list(parsed.locations, DEFAULT_TRIGGER_RULES.locations),
      minSalary: typeof parsed.minSalary === 'number' ? parsed.minSalary : null,
      minMatchPercentage: typeof parsed.minMatchPercentage === 'number' ? parsed.minMatchPercentage : DEFAULT_TRIGGER_RULES.minMatchPercentage,
    };
  } catch {
    return DEFAULT_TRIGGER_RULES;
  }
}

/** The alert's own text when the page cannot be fetched. */
function snippetText(listing: JobListing): string {
  return [listing.title, listing.company, listing.location, listing.salary, listing.description].filter((s) => s && s.trim().length > 0).join('\n');
}

/** A listing with no Seek link (legacy alert shape) still needs a dedupe key. */
function fallbackJobId(listing: JobListing): string {
  return `nolink:${listing.title}|${listing.company}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseJson<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Steps 6–10                                                                */
/* ------------------------------------------------------------------------ */

interface DeliveryContext {
  run: Run;
  profile: Profile;
  analysis: AnalysisResult;
  decision: TriggerDecision;
}

/** Budget → model or fallback → DOCX → R2 → links → email → run 'sent'. Throws on infrastructure failure; the caller marks the run failed. */
async function tailorAndDeliver(deps: PipelineDeps, ctx: DeliveryContext): Promise<Run> {
  const { db, env } = deps;
  const { run, profile, analysis, decision } = ctx;
  const nowMs = deps.now();
  const userProfile = profile.profileJson;

  const preferences = await listPreferences(db, run.userId);
  const input: TailorInput = {
    profile: userProfile,
    analysis,
    jobText: run.jobText,
    job: { title: run.jobTitle, company: run.company ?? '', location: run.location ?? '', url: run.jobUrl },
    preferences: preferences.map((p) => ({ kind: p.kind, text: p.text })),
  };

  // 6–7. Budget, then the model with the claim guard, else deterministic.
  let output: TailoredOutput;
  let origin: ReviewOrigin;
  const notes: string[] = [];
  const budget = await checkDailyBudget(db, run.userId, new Date(nowMs).toISOString());
  if (!budget.allowed) {
    output = deterministicTailored(input);
    origin = 'none';
    notes.push(`Daily tailoring budget of ${DAILY_TAILOR_BUDGET} reached (${budget.used} live runs today).`);
  } else {
    const { generate, provider } = await deps.generateFor(run.userId);
    if (!generate) {
      output = deterministicTailored(input);
      origin = 'fallback';
      notes.push('No Anthropic API key is configured — add one in Settings to get tailored documents.');
    } else {
      try {
        const result = await tailorWithGuard(generate, input);
        if (result) {
          output = result.output;
          origin = result.origin;
        } else {
          output = deterministicTailored(input);
          origin = 'fallback';
          notes.push('Claude\'s reply failed the fact check twice (or was refused), so the documents were built deterministically.');
        }
      } catch (err) {
        // A model outage should not cost the user the Apply link and a pack —
        // send the deterministic documents and say so; "Regenerate" retries.
        console.error(`[pipeline] run ${run.id}: model request failed (${provider}): ${errorMessage(err)}`);
        output = deterministicTailored(input);
        origin = 'fallback';
        notes.push(`The Claude request failed (${provider}); documents were built deterministically. Use "Regenerate" to retry.`);
      }
    }
  }

  // 8. Documents → R2 (skipped when the bucket binding is absent, e.g. tests / local without R2).
  const job = { title: run.jobTitle, company: run.company ?? '' };
  const [cvBase64, letterBase64] = await Promise.all([
    docxToBase64(renderCvDocx(output, userProfile, job)),
    docxToBase64(renderLetterDocx(output, userProfile, job, nzLongDate(nowMs))),
  ]);
  const cvName = safeFilename(userProfile.personal.name, 'CV', job.company);
  const letterName = safeFilename(userProfile.personal.name, 'Cover_Letter', job.company);
  let cvKey: string | null = null;
  let letterKey: string | null = null;
  if (env.DOCS) {
    cvKey = `runs/${run.id}/${cvName}`;
    letterKey = `runs/${run.id}/${letterName}`;
    await Promise.all([
      env.DOCS.put(cvKey, base64ToBytes(cvBase64), { httpMetadata: { contentType: DOCX_CONTENT_TYPE } }),
      env.DOCS.put(letterKey, base64ToBytes(letterBase64), { httpMetadata: { contentType: DOCX_CONTENT_TYPE } }),
    ]);
  }

  // 9. Action links (signed when the secret exists), review email, send.
  const appBaseUrl = env.APP_BASE_URL;
  const links = {} as ReviewLinks;
  const linksSigned = !!env.ACTION_LINK_SECRET;
  if (env.ACTION_LINK_SECRET) {
    const expiresAt = Math.floor(nowMs / 1000) + ACTION_LINK_TTL_SECONDS;
    for (const { key, action } of ACTIONS) {
      links[key] = await signActionLink({ baseUrl: appBaseUrl, runId: run.id, action, secret: env.ACTION_LINK_SECRET, expiresAt });
    }
  } else {
    const runUrl = `${appBaseUrl.replace(/\/+$/, '')}/runs/${run.id}`;
    for (const { key } of ACTIONS) links[key] = runUrl;
  }

  const email = buildReviewEmail({ run, analysis, output, origin, decision, links, appBaseUrl, jobUrl: run.jobUrl, linksSigned, notes });

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, run.userId) });
  const to = user?.reviewEmail ?? user?.email ?? null;
  if (!to) throw new Error(`user ${run.userId} has no review email address`);

  const { messageId } = await deps.send({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [
      { filename: cvName, contentType: DOCX_CONTENT_TYPE, base64: cvBase64 },
      { filename: letterName, contentType: DOCX_CONTENT_TYPE, base64: letterBase64 },
    ],
  });

  // 10. Persist.
  const updated = await updateRun(db, run.id, {
    tailoredJson: JSON.stringify(output),
    origin,
    cvKey,
    letterKey,
    emailMessageId: messageId,
    status: 'sent',
    error: null,
  });
  return updated ?? run;
}

async function markFailed(db: Db, runId: number, err: unknown): Promise<ProcessResult> {
  const reason = errorMessage(err);
  console.error(`[pipeline] run ${runId} failed: ${reason}`);
  try {
    await updateRun(db, runId, { status: 'failed', error: reason });
  } catch (updateErr) {
    console.error(`[pipeline] run ${runId}: could not record failure: ${errorMessage(updateErr)}`);
  }
  return { runId, status: 'failed', reason };
}

/* ------------------------------------------------------------------------ */
/* Entry points                                                              */
/* ------------------------------------------------------------------------ */

export async function processListing(
  deps: PipelineDeps,
  opts: { userId: number; processedEmailId: number | null; listing: JobListing }
): Promise<ProcessResult> {
  const { db } = deps;
  const { userId, processedEmailId, listing } = opts;

  // 1. Dedupe.
  const seekJobId = extractSeekJobId(listing.url) ?? fallbackJobId(listing);
  const existing = await findRunBySeekJobId(db, userId, seekJobId);
  if (existing) {
    if (existing.status === 'regenerate') return processRegenerate(deps, existing.id);
    return { runId: existing.id, status: 'skipped', reason: 'duplicate' };
  }

  // 2. Profile.
  const profile = await getOrCreateDefaultProfile(db, userId);
  if (!profile) {
    const failed = await createRun(db, {
      userId,
      processedEmailId,
      seekJobId,
      jobTitle: listing.title || 'Untitled role',
      company: listing.company || null,
      location: listing.location || null,
      salaryText: listing.salary || null,
      jobUrl: listing.url,
      jobText: snippetText(listing),
      jobTextSource: 'alert-snippet',
      status: 'failed',
      error: 'no profile',
    });
    return { runId: failed.id, status: 'failed', reason: 'no profile' };
  }

  // 3. Full ad, else the alert snippet.
  let html: string | null = null;
  if (listing.url) {
    try {
      html = await deps.fetchPage(listing.url);
    } catch (err) {
      console.warn(`[pipeline] fetch failed for ${listing.url}: ${errorMessage(err)}`);
      html = null;
    }
  }
  const meta = html ? extractJobAdMeta(html) : {};
  let jobText = html ? extractJobAdText(html) : '';
  let jobTextSource: Run['jobTextSource'] = 'full-ad';
  if (!jobText.trim()) {
    jobText = snippetText(listing);
    jobTextSource = 'alert-snippet';
  }
  const title = listing.title.trim() || meta.title || 'Untitled role';
  const company = listing.company.trim() || meta.company || '';
  const location = listing.location.trim() || meta.location || '';
  const salary = listing.salary.trim() || meta.salary || '';

  // 4. Analyse.
  const analysis = analyzeJob(jobText, profile.profileJson, { title, company });

  // 5. Trigger rules → the run row.
  const rulesRow = await getTriggerRules(db, userId);
  const rules = parseTriggerRules(rulesRow?.rulesJson);
  const decision = evaluateTrigger({ title, company, location, salary, text: jobText, matchPercentage: analysis.matchPercentage }, rules);

  const run = await createRun(db, {
    userId,
    profileId: profile.id,
    processedEmailId,
    seekJobId,
    jobTitle: title,
    company: company || null,
    location: location || null,
    salaryText: salary || null,
    jobUrl: listing.url,
    jobText,
    jobTextSource,
    matchPercentage: analysis.matchPercentage,
    analysisJson: JSON.stringify(analysis),
    triggerJson: JSON.stringify(decision),
    status: decision.decision === 'skip' ? 'skipped' : 'pending',
  });
  if (decision.decision === 'skip') {
    return { runId: run.id, status: 'skipped', reason: decision.reasons.join('; ') };
  }

  // 6–10.
  try {
    await tailorAndDeliver(deps, { run, profile, analysis, decision });
    return { runId: run.id, status: 'sent' };
  } catch (err) {
    return markFailed(db, run.id, err);
  }
}

/** Re-run tailoring and delivery for an existing run (status 'regenerate', or a stale 'pending' retry) from its stored job text. */
export async function processRegenerate(deps: PipelineDeps, runId: number): Promise<ProcessResult> {
  const { db } = deps;
  const run = await getRun(db, runId);
  if (!run) return { runId, status: 'failed', reason: 'run not found' };

  const stored = run.profileId ? await db.query.profiles.findFirst({ where: eq(schema.profiles.id, run.profileId) }) : null;
  const profile = stored ?? (await getOrCreateDefaultProfile(db, run.userId));
  if (!profile) return markFailed(db, run.id, new Error('no profile'));

  const analysis =
    parseJson<AnalysisResult>(run.analysisJson) ??
    analyzeJob(run.jobText, profile.profileJson, { title: run.jobTitle, company: run.company ?? undefined });
  const decision: TriggerDecision = parseJson<TriggerDecision>(run.triggerJson) ?? {
    decision: 'process',
    reasons: ['regenerate requested'],
    keywordHits: [],
    preferredCompany: false,
    parsedSalary: null,
  };

  // In flight: a crash leaves it 'pending' for the scheduled sweep to retry.
  const pending = (await updateRun(db, run.id, { status: 'pending', profileId: profile.id })) ?? run;

  try {
    await tailorAndDeliver(deps, { run: pending, profile, analysis, decision });
    return { runId: run.id, status: 'sent' };
  } catch (err) {
    return markFailed(db, run.id, err);
  }
}
