import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildSeekJobPage } from '../../../../packages/engine/src/__fixtures__/seek-job-page';
import { DEFAULT_TRIGGER_RULES, type JobListing, type TriggerDecision } from '@applyforme/engine';
import { schema } from '@/server/db';
import { createRun, getRun, recordFeedback, saveTriggerRules } from '@/server/runs';
import { verifyActionLink } from '@/lib/action-links';
import { DAILY_TAILOR_BUDGET } from '@/server/ai/budget';
import type { GenerateFn } from '@/server/ai/anthropic';
import { ACTION_LINK_TTL_SECONDS, nzLongDate, parseTriggerRules, processListing, processRegenerate } from './run-job';
import { escapeHtml } from './review-email';
import { FABRICATED_OUTPUT, FIXED_NOW_MS, USER, VALID_OUTPUT, fakeDeps, fakeEnv, insertRunAt, scriptedGenerate, setupDb } from './test-support';

const LISTING: JobListing = {
  title: 'Head of Modern Workplace',
  company: 'Kiwi Energy Group',
  location: 'Auckland CBD, Auckland',
  salary: '$180,000 – $200,000 per year + KiwiSaver',
  description: 'Own the Microsoft 365, Intune and Windows 365 roadmap for 3,000+ staff. Lead a team of 8 across endpoint, identity and collaboration.',
  url: 'https://www.seek.co.nz/job/84120987?type=standard&ref=jobmail&tracking=JM-1',
};

const PAGE = buildSeekJobPage();
const fetchFixture = async (): Promise<string | null> => PAGE;

async function permissiveRules(db: Awaited<ReturnType<typeof setupDb>>): Promise<void> {
  await saveTriggerRules(db, USER, JSON.stringify({ ...DEFAULT_TRIGGER_RULES, minMatchPercentage: 0 }));
}

describe('parseTriggerRules', () => {
  it('defaults on null / garbage and fills gaps in a partial object', () => {
    expect(parseTriggerRules(null)).toEqual(DEFAULT_TRIGGER_RULES);
    expect(parseTriggerRules('{not json')).toEqual(DEFAULT_TRIGGER_RULES);
    expect(parseTriggerRules('[]')).toEqual(DEFAULT_TRIGGER_RULES);
    const partial = parseTriggerRules(JSON.stringify({ keywordsAny: ['M365', 7], minSalary: 150000, minMatchPercentage: 'x' }));
    expect(partial.keywordsAny).toEqual(['M365']);
    expect(partial.minSalary).toBe(150000);
    expect(partial.minMatchPercentage).toBe(DEFAULT_TRIGGER_RULES.minMatchPercentage);
    expect(partial.excludedTerms).toEqual(DEFAULT_TRIGGER_RULES.excludedTerms);
  });
});

describe('nzLongDate', () => {
  it('formats the NZ local date', () => {
    expect(nzLongDate(FIXED_NOW_MS)).toBe('13 September 2026');
  });
});

describe('processListing', () => {
  it('happy path: full ad fetched, live tailoring, pack emailed, run sent', async () => {
    const db = await setupDb();
    const { generate, calls } = scriptedGenerate([VALID_OUTPUT]);
    const { deps, sent } = fakeDeps({ db, generate, fetchPage: fetchFixture });

    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result.status).toBe('sent');

    const run = (await getRun(db, result.runId))!;
    expect(run.status).toBe('sent');
    expect(run.seekJobId).toBe('84120987');
    expect(run.jobTextSource).toBe('full-ad');
    expect(run.jobText).toContain('Kiwi Energy Group is looking for a Head of Modern Workplace');
    expect(run.matchPercentage).toBeGreaterThan(50);
    expect(run.origin).toBe('live');
    expect(JSON.parse(run.tailoredJson!)).toEqual(VALID_OUTPUT);
    expect(run.analysisJson).toContain('"matchPercentage"');
    expect(JSON.parse(run.triggerJson!).decision).toBe('process');
    expect(run.profileId).toBe(1);
    expect(run.emailMessageId).toBe('test-1');
    expect(run.cvKey).toBeNull(); // no DOCS binding in tests
    expect(run.error).toBeNull();

    expect(calls).toHaveLength(1);
    expect(calls[0].messages[0].content).toContain('Kiwi Energy Group is looking for');

    expect(sent).toHaveLength(1);
    const email = sent[0];
    expect(email.to).toBe('test@example.com');
    expect(email.subject).toBe(`[ApplyForMe] ${run.matchPercentage}% · Head of Modern Workplace · Kiwi Energy Group`);
    expect(email.html).toContain(`href="${escapeHtml(LISTING.url)}"`);
    expect(email.text).toContain(`Apply on Seek: ${LISTING.url}`);
    expect(email.html).toContain('Apply on Seek');
    expect(email.html).not.toContain('FALLBACK');
    expect(email.attachments?.map((a) => a.filename)).toEqual(['Matt_Harkness_CV_Kiwi_Energy_Group.docx', 'Matt_Harkness_Cover_Letter_Kiwi_Energy_Group.docx']);
    for (const a of email.attachments!) {
      expect(a.contentType).toContain('wordprocessingml');
      expect(a.base64.startsWith('UEs')).toBe(true); // "PK" in base64
    }

    // Signed links verify with the same secret and expire ACTION_LINK_TTL_SECONDS after now (unix seconds).
    const applied = new URL(email.html.match(/href="([^"]*a=applied[^"]*)"/)![1].replace(/&amp;/g, '&'));
    expect(applied.pathname).toBe(`/api/runs/${run.id}/action`);
    const exp = applied.searchParams.get('exp');
    expect(Number(exp)).toBe(Math.floor(FIXED_NOW_MS / 1000) + ACTION_LINK_TTL_SECONDS);
    const verified = await verifyActionLink({ runId: run.id, action: 'applied', exp, sig: applied.searchParams.get('sig'), secret: 'secret', now: Math.floor(FIXED_NOW_MS / 1000) });
    expect(verified).toEqual({ ok: true, action: 'applied' });
    for (const action of ['rejected', 'regenerate', 'thumbs-up']) expect(email.text).toContain(`a=${action}`);
  });

  it('duplicate: an existing run for the same Seek job id is skipped without a new row or email', async () => {
    const db = await setupDb();
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: fetchFixture });
    const first = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    const again = await processListing(deps, { userId: USER, processedEmailId: null, listing: { ...LISTING, url: 'https://www.seek.co.nz/job/84120987' } });
    expect(again).toEqual({ runId: first.runId, status: 'skipped', reason: 'duplicate' });
    expect(await db.select().from(schema.runs)).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('skip by rules: run row is skipped with reasons, no model call, no email', async () => {
    const db = await setupDb();
    await saveTriggerRules(db, USER, JSON.stringify({ ...DEFAULT_TRIGGER_RULES, excludedCompanies: ['Kiwi Energy Group'] }));
    const { deps, sent, generateForCalls } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: fetchFixture });

    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('excluded company');

    const run = (await getRun(db, result.runId))!;
    expect(run.status).toBe('skipped');
    expect(run.origin).toBeNull();
    const decision = JSON.parse(run.triggerJson!) as TriggerDecision;
    expect(decision.decision).toBe('skip');
    expect(decision.reasons).toEqual(['excluded company: Kiwi Energy Group']);
    expect(run.matchPercentage).toBeGreaterThan(0);
    expect(sent).toHaveLength(0);
    expect(generateForCalls).toHaveLength(0);
  });

  it('fallback when no model is configured: deterministic documents, origin fallback, banner in the email', async () => {
    const db = await setupDb();
    const { deps, sent } = fakeDeps({ db, generate: null, fetchPage: fetchFixture });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result.status).toBe('sent');
    const run = (await getRun(db, result.runId))!;
    expect(run.origin).toBe('fallback');
    const tailored = JSON.parse(run.tailoredJson!);
    expect(tailored.highlights).toHaveLength(6);
    expect(sent[0].html).toContain('FALLBACK — deterministic documents');
    expect(sent[0].html).toContain('No Anthropic API key');
  });

  it('fallback when the model fails the guard twice', async () => {
    const db = await setupDb();
    const { generate, calls } = scriptedGenerate([FABRICATED_OUTPUT]);
    const { deps, sent } = fakeDeps({ db, generate, fetchPage: fetchFixture });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result.status).toBe('sent');
    expect(calls).toHaveLength(2);
    expect((await getRun(db, result.runId))!.origin).toBe('fallback');
    expect(sent[0].html).toContain('failed the fact check twice');
  });

  it('fallback when the model request throws — the pack is still sent', async () => {
    const db = await setupDb();
    const generate: GenerateFn = async () => {
      throw new Error('529 overloaded');
    };
    const { deps, sent } = fakeDeps({ db, generate, fetchPage: fetchFixture });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result.status).toBe('sent');
    expect((await getRun(db, result.runId))!.origin).toBe('fallback');
    expect(sent[0].html).toContain('request failed');
  });

  it('fetchPage null → alert snippet is analysed and stored as such', async () => {
    const db = await setupDb();
    await permissiveRules(db);
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: async () => null });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result.status).toBe('sent');
    const run = (await getRun(db, result.runId))!;
    expect(run.jobTextSource).toBe('alert-snippet');
    expect(run.jobText).toContain(LISTING.description);
    expect(run.jobText).toContain(LISTING.title);
    expect(sent[0].html).toContain('alert snippet');
  });

  it('a throwing fetchPage is treated like null', async () => {
    const db = await setupDb();
    await permissiveRules(db);
    const { deps } = fakeDeps({
      db,
      generate: scriptedGenerate([VALID_OUTPUT]).generate,
      fetchPage: async () => {
        throw new Error('network');
      },
    });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect((await getRun(db, result.runId))!.jobTextSource).toBe('alert-snippet');
  });

  it('no profile → run failed with error "no profile", nothing sent', async () => {
    const db = await setupDb({ profile: false });
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: fetchFixture });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result).toMatchObject({ status: 'failed', reason: 'no profile' });
    const run = (await getRun(db, result.runId))!;
    expect(run.status).toBe('failed');
    expect(run.error).toBe('no profile');
    expect(sent).toHaveLength(0);
  });

  it('over the daily budget → origin none, deterministic pack still sent with a budget note', async () => {
    const db = await setupDb();
    const when = new Date(FIXED_NOW_MS - 60_000);
    for (let i = 0; i < DAILY_TAILOR_BUDGET; i++) {
      await insertRunAt(db, { userId: USER, seekJobId: `b${i}`, jobTitle: 'x', jobUrl: 'u', jobText: 't', jobTextSource: 'alert-snippet', origin: 'live', status: 'sent' }, when);
    }
    const { generate, calls } = scriptedGenerate([VALID_OUTPUT]);
    const { deps, sent, generateForCalls } = fakeDeps({ db, generate, fetchPage: fetchFixture });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result.status).toBe('sent');
    expect((await getRun(db, result.runId))!.origin).toBe('none');
    expect(calls).toHaveLength(0);
    expect(generateForCalls).toHaveLength(0);
    expect(sent[0].html).toContain('daily budget reached');
  });

  it('without ACTION_LINK_SECRET the buttons point at the run page and the email says so', async () => {
    const db = await setupDb();
    const { deps, sent } = fakeDeps({ db, env: fakeEnv({ ACTION_LINK_SECRET: undefined }), generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: fetchFixture });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(sent[0].html).toContain(`https://app.test/runs/${result.runId}`);
    expect(sent[0].html).not.toContain('/action?');
    expect(sent[0].html).toContain('not signed');
  });

  it('uploads both documents to R2 under runs/<id>/ when the DOCS binding exists', async () => {
    const db = await setupDb();
    const puts: { key: string; bytes: number; contentType?: string }[] = [];
    const DOCS = {
      put: async (key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) => {
        puts.push({ key, bytes: value.byteLength, contentType: opts?.httpMetadata?.contentType });
        return null;
      },
    } as unknown as R2Bucket;
    const { deps } = fakeDeps({ db, env: fakeEnv({ DOCS }), generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: fetchFixture });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    const run = (await getRun(db, result.runId))!;
    expect(run.cvKey).toBe(`runs/${run.id}/Matt_Harkness_CV_Kiwi_Energy_Group.docx`);
    expect(run.letterKey).toBe(`runs/${run.id}/Matt_Harkness_Cover_Letter_Kiwi_Energy_Group.docx`);
    expect(puts.map((p) => p.key).sort()).toEqual([run.cvKey, run.letterKey].sort());
    for (const p of puts) {
      expect(p.bytes).toBeGreaterThan(1000);
      expect(p.contentType).toContain('wordprocessingml');
    }
  });

  it('a failing send marks the run failed with the error (truncated) and never throws', async () => {
    const db = await setupDb();
    const { deps } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: fetchFixture });
    deps.send = async () => {
      throw new Error('smtp down '.repeat(100));
    };
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(result.status).toBe('failed');
    const run = (await getRun(db, result.runId))!;
    expect(run.status).toBe('failed');
    expect(run.error!.length).toBe(500);
    expect(run.error).toContain('smtp down');
  });

  it('a listing with no Seek link still gets a run, keyed on title+company', async () => {
    const db = await setupDb();
    await permissiveRules(db);
    const { deps } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate });
    const result = await processListing(deps, { userId: USER, processedEmailId: null, listing: { ...LISTING, url: '' } });
    expect(result.status).toBe('sent');
    expect((await getRun(db, result.runId))!.seekJobId).toBe('nolink:head of modern workplace|kiwi energy group');
    const again = await processListing(deps, { userId: USER, processedEmailId: null, listing: { ...LISTING, url: '' } });
    expect(again.reason).toBe('duplicate');
  });
});

describe('processRegenerate', () => {
  it('re-tailors a run flagged regenerate with the newest preferences, from stored job text, and re-sends', async () => {
    const db = await setupDb();
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: fetchFixture });
    const first = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });

    // The email's "Regenerate with a note" link → recordFeedback → status 'regenerate' + a preference row.
    await recordFeedback(db, first.runId, 'regenerate', 'Lead with the Copilot Studio work');
    expect((await getRun(db, first.runId))!.status).toBe('regenerate');

    const { generate: generate2, calls } = scriptedGenerate([VALID_OUTPUT]);
    deps.generateFor = async () => ({ generate: generate2, provider: 'fake' });
    let fetches = 0;
    deps.fetchPage = async () => {
      fetches += 1;
      return PAGE;
    };

    const result = await processRegenerate(deps, first.runId);
    expect(result).toEqual({ runId: first.runId, status: 'sent' });
    expect(fetches).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].system[1].text).toContain('Note: Lead with the Copilot Studio work');
    expect(calls[0].messages[0].content).toContain('Kiwi Energy Group is looking for');

    const run = (await getRun(db, first.runId))!;
    expect(run.status).toBe('sent');
    expect(run.origin).toBe('live');
    expect(run.emailMessageId).toBe('test-2');
    expect(sent).toHaveLength(2);
    expect(await db.select().from(schema.runs)).toHaveLength(1);
  });

  it('a re-forwarded alert for a run flagged regenerate regenerates instead of skipping', async () => {
    const db = await setupDb();
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: fetchFixture });
    const first = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    await recordFeedback(db, first.runId, 'regenerate');
    const again = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(again).toEqual({ runId: first.runId, status: 'sent' });
    expect(sent).toHaveLength(2);
  });

  it('re-analyses when the stored analysis is missing, and fails cleanly on an unknown run', async () => {
    const db = await setupDb();
    await permissiveRules(db);
    const run = await createRun(db, { userId: USER, seekJobId: '1', jobTitle: 'Head of Modern Workplace', company: 'Kiwi Energy Group', jobUrl: 'https://www.seek.co.nz/job/1', jobText: PAGE, jobTextSource: 'full-ad', status: 'regenerate' });
    const { deps } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate });
    expect(await processRegenerate(deps, run.id)).toEqual({ runId: run.id, status: 'sent' });
    expect((await db.select().from(schema.runs).where(eq(schema.runs.id, run.id)))[0].tailoredJson).toContain('"summary"');
    expect(await processRegenerate(deps, 999)).toMatchObject({ runId: 999, status: 'failed' });
  });
});
