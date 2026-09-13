import { describe, it, expect } from 'vitest';
import { SEEK_ALERT_HTML, SEEK_ALERT_JOB_IDS } from '../../../../packages/engine/src/__fixtures__/seek-alert';
import { DEFAULT_TRIGGER_RULES } from '@applyforme/engine';
import { schema } from '@/server/db';
import { findProcessedEmail, listPreferences, saveTriggerRules } from '@/server/runs';
import { processInboundEmail } from './inbound-handler';
import { USER, VALID_OUTPUT, fakeDeps, scriptedGenerate, setupDb } from './test-support';

function mime(lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

const FORWARD_CONFIRMATION = mime([
  'From: forwarding-noreply@google.com',
  'To: jobs@applyforme.test',
  'Subject: (#553914227) Gmail Forwarding Confirmation - Receive Mail from sam@gmail.com',
  'Message-ID: <fwd-confirm@google.com>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'sam@gmail.com has requested to automatically forward mail to your email address jobs@applyforme.test.',
  'Confirmation code: 553914227',
]);

const NEWSLETTER = mime([
  'From: newsletter@example.com',
  'To: jobs@applyforme.test',
  'Subject: Weekly digest',
  'Message-ID: <digest@example.com>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Nothing to see here.',
]);

/** The engine's three-job Seek alert fixture, as a Gmail auto-forward (From rewritten to the Gmail account). */
const SEEK_ALERT = mime([
  'From: Matt <matt@gmail.com>',
  'To: jobs@applyforme.test',
  'Subject: Fwd: 3 new Head of Modern Workplace jobs in Auckland',
  'Date: Sun, 13 Sep 2026 09:15:00 +1200',
  'Message-ID: <alert-1@seek.co.nz>',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  SEEK_ALERT_HTML,
]);

function collector(): { waitUntil: (p: Promise<unknown>) => void; settle: () => Promise<void> } {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (p) => void pending.push(p), settle: async () => void (await Promise.all(pending)) };
}

describe('processInboundEmail', () => {
  it('stores the Gmail forwarding confirmation code as a preference note and logs the message as ignored', async () => {
    const db = await setupDb();
    const { deps, sent } = fakeDeps({ db });
    const { waitUntil, settle } = collector();
    const outcome = await processInboundEmail(FORWARD_CONFIRMATION, deps, waitUntil);
    await settle();
    expect(outcome).toEqual({ kind: 'forward-confirmation', code: '553914227' });
    const prefs = await listPreferences(db, USER);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatchObject({ kind: 'note', source: 'feedback', text: 'Gmail forwarding confirmation code: 553914227' });
    expect((await findProcessedEmail(db, 'fwd-confirm@google.com'))?.status).toBe('ignored');
    expect(sent).toHaveLength(0);
  });

  it('non-Seek mail is recorded as ignored and creates no runs', async () => {
    const db = await setupDb();
    const { deps } = fakeDeps({ db });
    const { waitUntil, settle } = collector();
    const outcome = await processInboundEmail(NEWSLETTER, deps, waitUntil);
    await settle();
    expect(outcome).toEqual({ kind: 'ignored', messageId: 'digest@example.com' });
    const row = (await findProcessedEmail(db, 'digest@example.com'))!;
    expect(row.status).toBe('ignored');
    expect(row.source).toBe('other');
    expect(row.subject).toBe('Weekly digest');
    expect(await db.select().from(schema.runs)).toHaveLength(0);
  });

  it('a Seek alert with 3 jobs → ledger row with jobsFound 3 → 3 runs, each emailed, all under waitUntil', async () => {
    const db = await setupDb();
    await saveTriggerRules(db, USER, JSON.stringify({ ...DEFAULT_TRIGGER_RULES, minMatchPercentage: 0 }));
    const fetched: string[] = [];
    const { deps, sent } = fakeDeps({
      db,
      generate: scriptedGenerate([VALID_OUTPUT]).generate,
      fetchPage: async (url) => {
        fetched.push(url);
        return null;
      },
    });
    const { waitUntil, settle } = collector();

    const outcome = await processInboundEmail(SEEK_ALERT, deps, waitUntil);
    expect(outcome).toMatchObject({ kind: 'processed', jobs: 3 });
    // The handler returned before the listings were processed…
    expect(await db.select().from(schema.runs)).toHaveLength(0);
    await settle();
    // …and the waitUntil work finished them.
    const runs = await db.select().from(schema.runs);
    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.seekJobId).sort()).toEqual([...SEEK_ALERT_JOB_IDS].sort());
    expect(runs.every((r) => r.status === 'sent')).toBe(true);
    expect(runs.every((r) => r.processedEmailId === (outcome as { processedEmailId: number }).processedEmailId)).toBe(true);
    expect(runs.every((r) => r.jobTextSource === 'alert-snippet')).toBe(true);
    expect(fetched).toEqual(runs.map((r) => r.jobUrl));
    expect(sent).toHaveLength(3);

    const ledger = (await findProcessedEmail(db, 'alert-1@seek.co.nz'))!;
    expect(ledger.source).toBe('seek');
    expect(ledger.jobsFound).toBe(3);
    expect(ledger.status).toBe('processed');
    expect(ledger.receivedAt).toContain('2026-09-1');
  });

  it('a redelivered alert is a duplicate — no second batch of runs', async () => {
    const db = await setupDb();
    await saveTriggerRules(db, USER, JSON.stringify({ ...DEFAULT_TRIGGER_RULES, minMatchPercentage: 0 }));
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate });
    const first = collector();
    await processInboundEmail(SEEK_ALERT, deps, first.waitUntil);
    await first.settle();
    const second = collector();
    expect(await processInboundEmail(SEEK_ALERT, deps, second.waitUntil)).toEqual({ kind: 'duplicate', messageId: 'alert-1@seek.co.nz' });
    await second.settle();
    expect(await db.select().from(schema.runs)).toHaveLength(3);
    expect(sent).toHaveLength(3);
  });

  it('one listing throwing does not stop the others; the ledger row records the failure', async () => {
    const db = await setupDb();
    await saveTriggerRules(db, USER, JSON.stringify({ ...DEFAULT_TRIGGER_RULES, minMatchPercentage: 0 }));
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate });
    let n = 0;
    deps.fetchPage = async () => {
      n += 1;
      if (n === 2) throw new Error('boom'); // processListing swallows this (snippet fallback)…
      return null;
    };
    const originalSend = deps.send;
    let sends = 0;
    deps.send = async (email) => {
      sends += 1;
      if (sends === 1) throw new Error('mailer hiccup'); // …and this marks only that run failed.
      return originalSend(email);
    };
    const { waitUntil, settle } = collector();
    await processInboundEmail(SEEK_ALERT, deps, waitUntil);
    await settle();
    const runs = await db.select().from(schema.runs);
    expect(runs.map((r) => r.status).sort()).toEqual(['failed', 'sent', 'sent']);
    expect(runs.find((r) => r.status === 'failed')!.error).toBe('mailer hiccup');
    expect(sent).toHaveLength(2);
    expect((await findProcessedEmail(db, 'alert-1@seek.co.nz'))!.status).toBe('processed');
  });
});
