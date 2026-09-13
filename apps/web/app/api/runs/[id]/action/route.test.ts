import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { createTestDb, seedUser } from '@/server/test/db';
import { createRun } from '@/server/runs';
import { signActionLink } from '@/lib/action-links';
import { GET, POST } from './route';

/**
 * Full-handler tests for the one-click action links. `@/server/db` is
 * mocked so getDb/getEnv hand the route a real in-memory database and a
 * controllable env (same convention as AICoach's route tests).
 */

let testDb: Db;
let envOverrides: Record<string, unknown> = {};

vi.mock('@/server/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/db')>();
  return {
    ...actual,
    getDb: () => testDb,
    getEnv: () => ({
      APP_BASE_URL: 'https://app.test',
      ACTION_LINK_SECRET: 'test-secret',
      ...envOverrides,
    }),
  };
});

const SECRET = 'test-secret';
const BASE = 'https://app.test';
const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const PAST = Math.floor(Date.now() / 1000) - 60;

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

let runId: number;

beforeEach(async () => {
  testDb = createTestDb().db;
  await seedUser(testDb);
  envOverrides = {};
  const run = await createRun(testDb, {
    userId: schema.DEFAULT_USER_ID,
    seekJobId: '123',
    jobTitle: 'Product Manager',
    company: 'Acme',
    jobUrl: 'https://www.seek.co.nz/job/123',
    jobText: 'Lead things.',
    jobTextSource: 'alert-snippet',
    status: 'sent',
  });
  runId = run.id;
});

async function link(action: 'applied' | 'rejected' | 'regenerate' | 'thumbs-up', expiresAt = FUTURE, secret = SECRET, id = runId) {
  return signActionLink({ baseUrl: BASE, runId: id, action, secret, expiresAt });
}

async function status(id = runId) {
  const row = await testDb.query.runs.findFirst({ where: eq(schema.runs.id, id) });
  return row?.status;
}

async function feedbackRows() {
  return testDb.select().from(schema.feedback);
}

describe('GET /api/runs/[id]/action — refusals', () => {
  it('403s a bad signature and records nothing', async () => {
    const url = await link('applied', FUTURE, 'wrong-secret');
    const res = await GET(new Request(url), ctx(runId));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('not valid');
    expect(await status()).toBe('sent');
    expect(await feedbackRows()).toHaveLength(0);
  });

  it('403s an expired link with an "expired" message', async () => {
    const url = await link('applied', PAST);
    const res = await GET(new Request(url), ctx(runId));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('expired');
    expect(await status()).toBe('sent');
  });

  it('403s an unknown action and a sig signed for a different run', async () => {
    const res1 = await GET(new Request(`${BASE}/api/runs/${runId}/action?a=delete&exp=${FUTURE}&sig=abc`), ctx(runId));
    expect(res1.status).toBe(403);
    // Signed for run 999, presented against our run.
    const url = await link('applied', FUTURE, SECRET, 999);
    const res2 = await GET(new Request(url.replace('/runs/999/', `/runs/${runId}/`)), ctx(runId));
    expect(res2.status).toBe(403);
  });

  it('503s when ACTION_LINK_SECRET is unset', async () => {
    envOverrides = { ACTION_LINK_SECRET: undefined };
    const res = await GET(new Request(await link('applied')), ctx(runId));
    expect(res.status).toBe(503);
  });

  it('404s a valid link for a run that no longer exists', async () => {
    const url = await link('applied', FUTURE, SECRET, 4242);
    const res = await GET(new Request(url), ctx(4242));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/runs/[id]/action — valid links', () => {
  it('applied: records feedback, flips status, renders a confirmation with a back link', async () => {
    const res = await GET(new Request(await link('applied')), ctx(runId));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Marked as applied');
    expect(html).toContain('https://app.test/runs');
    expect(await status()).toBe('applied');
    const rows = await feedbackRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('applied');
  });

  it('thumbs-up: records feedback without changing status', async () => {
    const res = await GET(new Request(await link('thumbs-up')), ctx(runId));
    expect(res.status).toBe(200);
    expect(await status()).toBe('sent');
    expect((await feedbackRows())[0].action).toBe('thumbs-up');
  });

  it('rejected without a reason: shows the reason form and records nothing yet', async () => {
    const url = await link('rejected');
    const res = await GET(new Request(url), ctx(runId));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="post"');
    expect(html).toContain('name="reason"');
    expect(await status()).toBe('sent');
    expect(await feedbackRows()).toHaveLength(0);
  });

  it('rejected with ?reason=: records straight away and stores the reason as a preference', async () => {
    const url = `${await link('rejected')}&reason=${encodeURIComponent('too junior')}`;
    const res = await GET(new Request(url), ctx(runId));
    expect(res.status).toBe(200);
    expect(await status()).toBe('rejected');
    const prefs = await testDb.select().from(schema.preferences);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatchObject({ kind: 'note', source: 'feedback', text: 'too junior', runId });
  });
});

describe('POST /api/runs/[id]/action — reason form', () => {
  it('re-verifies the signature and records the form reason', async () => {
    const url = await link('regenerate');
    const body = new URLSearchParams({ reason: 'lead with the AI work' });
    const res = await POST(new Request(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), ctx(runId));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Regeneration requested');
    expect(await status()).toBe('regenerate');
    const prefs = await testDb.select().from(schema.preferences);
    expect(prefs[0].text).toBe('lead with the AI work');
  });

  it('403s a POST with a tampered signature', async () => {
    const url = (await link('regenerate')).replace(/sig=[0-9a-f]{4}/, 'sig=0000');
    const body = new URLSearchParams({ reason: 'x' });
    const res = await POST(new Request(url, { method: 'POST', body }), ctx(runId));
    expect(res.status).toBe(403);
    expect(await status()).toBe('sent');
  });
});
