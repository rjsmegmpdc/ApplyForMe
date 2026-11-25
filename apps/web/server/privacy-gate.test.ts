import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { createTestDb } from '@/server/test/db';
import { identityErrorResponse, resolveUser } from './identity';
import { PRIVACY_VERSION, privacyStatus, recordPrivacyAck } from './privacy';

/**
 * The privacy gate (Matt, 2026-11-25): no page or API serves anything to a user who has not accepted the
 * current statement. Behaviour is tested on resolveUser in dev mode (the same code path as an Access
 * identity after verification; identity.test.ts covers the JWT half), and a static audit checks every route
 * and page goes through it, with the documented exceptions only.
 */

const DEV_ENV = { ACCESS_TEAM_DOMAIN: undefined, ACCESS_APP_AUD: undefined };
const noHeaders = new Headers();

let db: Db;
beforeEach(() => {
  db = createTestDb().db;
});

describe('resolveUser — privacy gate', () => {
  it('blocks a user who has never accepted', async () => {
    expect(await resolveUser(noHeaders, db, DEV_ENV)).toEqual({ error: 'privacy' });
  });

  it('lets the accept page and its API through with allowPendingPrivacy', async () => {
    expect(await resolveUser(noHeaders, db, DEV_ENV, { allowPendingPrivacy: true })).toEqual({ userId: DEFAULT_USER_ID, email: null });
  });

  it('passes once the current version is accepted, and records version, time and how', async () => {
    const at = new Date('2026-11-25T08:00:00Z');
    expect(await recordPrivacyAck(db, DEFAULT_USER_ID, at)).toEqual({ version: PRIVACY_VERSION, how: 'first-use' });
    expect(await resolveUser(noHeaders, db, DEV_ENV)).toEqual({ userId: DEFAULT_USER_ID, email: null });
    const s = await privacyStatus(db, DEFAULT_USER_ID);
    expect(s).toEqual({ ok: true, version: PRIVACY_VERSION, acceptedAt: at, how: 'first-use' });
  });

  it('re-asks after a version bump and records it as a re-accept', async () => {
    await db.update(schema.users).set({ privacyVersion: '2000-01-01', privacyAcceptedAt: new Date(0), privacyHow: 'first-use' }).where(eq(schema.users.id, DEFAULT_USER_ID));
    expect(await resolveUser(noHeaders, db, DEV_ENV)).toEqual({ error: 'privacy' });
    expect((await recordPrivacyAck(db, DEFAULT_USER_ID)).how).toBe('re-accept');
    expect('userId' in (await resolveUser(noHeaders, db, DEV_ENV))).toBe(true);
  });

  it('answers APIs with 403 {privacy: true} and Access failures with 401', async () => {
    const r = identityErrorResponse({ error: 'privacy' });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ privacy: true, accept: '/privacy/accept' });
    expect(identityErrorResponse({ error: 'unauthorized' }).status).toBe(401);
  });
});

/* ------------------------------------------------------------------------ */
/* Static audit: every route and page is gated                               */
/* ------------------------------------------------------------------------ */

const APP = path.resolve(__dirname, '../app');

function walk(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, name));
    else if (e.name === name) out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(APP, p).split(path.sep).join('/');

/**
 * Routes that do not use the Access identity at all, and why (see server/identity.ts):
 * the signed one-click review-email links, and the ADMIN_TOKEN bearer operator routes.
 */
const UNGATED_ROUTES = new Set(['api/runs/[id]/action/route.ts', 'api/admin/probe/route.ts', 'api/admin/rescore/route.ts', 'api/admin/resend/route.ts', 'api/admin/run-url/route.ts']);
const PENDING_ALLOWED = new Set(['api/privacy/accept/route.ts', 'privacy/accept/page.tsx']);

describe('privacy gate — static audit', () => {
  const routes = walk(path.join(APP, 'api'), 'route.ts');

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(15);
  });

  for (const file of routes) {
    const name = rel(file);
    const src = fs.readFileSync(file, 'utf8');
    if (UNGATED_ROUTES.has(name)) {
      it(`${name} is a documented exception and never resolves a user`, () => {
        expect(src).not.toMatch(/resolveUser|resolveAccessIdentity/);
        expect(src).toMatch(name.includes('/admin/') ? /isAdminRequest/ : /verifyActionLink/);
      });
      continue;
    }
    it(`${name} resolves the user through the gate on every handler`, () => {
      const handlers = src.match(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
      expect(handlers.length).toBeGreaterThan(0);
      expect((src.match(/await resolveUser\(/g) ?? []).length).toBe(handlers.length);
      expect((src.match(/return identityErrorResponse\(identity\)/g) ?? []).length).toBe(handlers.length);
      expect(src).not.toMatch(/resolveAccessIdentity/);
      if (!PENDING_ALLOWED.has(name)) expect(src).not.toMatch(/allowPendingPrivacy/);
    });
  }

  for (const file of walk(path.join(APP, '(app)'), 'page.tsx')) {
    const name = rel(file);
    it(`${name} uses pageIdentity (redirects to the accept page)`, () => {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toMatch(/await pageIdentity\(\)/);
      expect(src).not.toMatch(/allowPendingPrivacy|resolveAccessIdentity/);
    });
  }

  it('the public statement page resolves no identity and reads no user data', () => {
    const src = fs.readFileSync(path.join(APP, 'privacy/page.tsx'), 'utf8');
    expect(src).not.toMatch(/resolveUser|pageIdentity|getDb|headers\(/);
  });

  it('only the accept page and its API use allowPendingPrivacy', () => {
    const users = [...walk(APP, 'route.ts'), ...walk(APP, 'page.tsx')].filter((f) => fs.readFileSync(f, 'utf8').includes('allowPendingPrivacy')).map(rel).sort();
    expect(users).toEqual([...PENDING_ALLOWED].sort());
  });

  it('pageIdentity redirects a privacy error to /privacy/accept', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/ui/session.ts'), 'utf8');
    expect(src).toMatch(/identity\.error === 'privacy'\) redirect\('\/privacy\/accept'\)/);
  });
});
