import { describe, it, expect } from 'vitest';
import { signActionLink, verifyActionLink, isRunAction } from './action-links';

const SECRET = 'test-action-link-secret';
const BASE = 'https://applyforme.test';
const NOW = 1_800_000_000;
const EXP = NOW + 7 * 24 * 3600;

function paramsOf(url: string) {
  const u = new URL(url);
  return { pathname: u.pathname, a: u.searchParams.get('a')!, exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') };
}

describe('signActionLink', () => {
  it('builds the route path with action, exp and a hex sig', async () => {
    const url = await signActionLink({ baseUrl: BASE, runId: 42, action: 'applied', secret: SECRET, expiresAt: EXP });
    const p = paramsOf(url);
    expect(p.pathname).toBe('/api/runs/42/action');
    expect(p.a).toBe('applied');
    expect(p.exp).toBe(String(EXP));
    expect(p.sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tolerates a trailing slash on baseUrl and is deterministic for the same inputs', async () => {
    const a = await signActionLink({ baseUrl: `${BASE}/`, runId: 1, action: 'rejected', secret: SECRET, expiresAt: EXP });
    const b = await signActionLink({ baseUrl: BASE, runId: 1, action: 'rejected', secret: SECRET, expiresAt: EXP });
    expect(a).toBe(b);
    expect(a.startsWith(`${BASE}/api/runs/1/action?`)).toBe(true);
  });
});

describe('verifyActionLink', () => {
  it('round-trips every action', async () => {
    for (const action of ['applied', 'rejected', 'regenerate', 'thumbs-up'] as const) {
      const url = await signActionLink({ baseUrl: BASE, runId: 7, action, secret: SECRET, expiresAt: EXP });
      const p = paramsOf(url);
      const result = await verifyActionLink({ runId: 7, action: p.a, exp: p.exp, sig: p.sig, secret: SECRET, now: NOW });
      expect(result).toEqual({ ok: true, action });
    }
  });

  it('rejects a tampered signature', async () => {
    const p = paramsOf(await signActionLink({ baseUrl: BASE, runId: 7, action: 'applied', secret: SECRET, expiresAt: EXP }));
    const flipped = (p.sig![0] === '0' ? '1' : '0') + p.sig!.slice(1);
    const result = await verifyActionLink({ runId: 7, action: p.a, exp: p.exp, sig: flipped, secret: SECRET, now: NOW });
    expect(result).toEqual({ ok: false, reason: 'bad signature' });
  });

  it('rejects a link re-pointed at another run or action', async () => {
    const p = paramsOf(await signActionLink({ baseUrl: BASE, runId: 7, action: 'applied', secret: SECRET, expiresAt: EXP }));
    expect(await verifyActionLink({ runId: 8, action: p.a, exp: p.exp, sig: p.sig, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'bad signature' });
    expect(await verifyActionLink({ runId: 7, action: 'rejected', exp: p.exp, sig: p.sig, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'bad signature' });
  });

  it('rejects a link signed with a different secret', async () => {
    const p = paramsOf(await signActionLink({ baseUrl: BASE, runId: 7, action: 'applied', secret: 'other', expiresAt: EXP }));
    expect(await verifyActionLink({ runId: 7, action: p.a, exp: p.exp, sig: p.sig, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'bad signature' });
  });

  it('rejects an expired link (valid signature, exp in the past)', async () => {
    const p = paramsOf(await signActionLink({ baseUrl: BASE, runId: 7, action: 'applied', secret: SECRET, expiresAt: NOW - 1 }));
    expect(await verifyActionLink({ runId: 7, action: p.a, exp: p.exp, sig: p.sig, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'expired' });
    // Extending exp without re-signing is a signature failure, not a fresh link.
    expect(await verifyActionLink({ runId: 7, action: p.a, exp: String(EXP), sig: p.sig, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'bad signature' });
  });

  it('rejects an unknown action and missing/malformed params', async () => {
    const p = paramsOf(await signActionLink({ baseUrl: BASE, runId: 7, action: 'applied', secret: SECRET, expiresAt: EXP }));
    expect(await verifyActionLink({ runId: 7, action: 'delete-everything', exp: p.exp, sig: p.sig, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'unknown action' });
    expect(await verifyActionLink({ runId: 7, action: p.a, exp: null, sig: p.sig, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'missing or malformed exp' });
    expect(await verifyActionLink({ runId: 7, action: p.a, exp: 'soon', sig: p.sig, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'missing or malformed exp' });
    expect(await verifyActionLink({ runId: 7, action: p.a, exp: p.exp, sig: null, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'missing or malformed sig' });
    expect(await verifyActionLink({ runId: 7, action: p.a, exp: p.exp, sig: 'zz', secret: SECRET, now: NOW })).toEqual({ ok: false, reason: 'missing or malformed sig' });
  });
});

describe('isRunAction', () => {
  it('narrows only the four known actions', () => {
    expect(isRunAction('thumbs-up')).toBe(true);
    expect(isRunAction('applied ')).toBe(false);
    expect(isRunAction('')).toBe(false);
  });
});
