import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';

/**
 * Privacy statement acknowledgement (Matt, 2026-11-25; NZ Privacy Act 2020 — same setup as CAIO Academy and
 * AICoach v0.18).
 *
 * PRIVACY_VERSION is the statement's date. Bump it whenever app/privacy/page.tsx changes in a way that matters:
 * every user is then asked to read and accept it again before anything else loads, because
 * server/identity.ts's resolveUser returns `{error: 'privacy'}` for any user whose stored privacy_version
 * differs.
 */
export const PRIVACY_VERSION = '2026-11-25';

/** The statement's version as people read it. */
export const PRIVACY_VERSION_LABEL = '25 November 2026';

export type PrivacyHow = 'first-use' | 're-accept';

export interface PrivacyStatus {
  ok: boolean;
  version: string | null;
  acceptedAt: Date | null;
  how: string | null;
}

/** True when this user row has accepted the current statement. */
export function privacyOk(row: { privacyVersion: string | null } | null | undefined): boolean {
  return row?.privacyVersion === PRIVACY_VERSION;
}

/** The user's acknowledgement status (one read; used by the identity gate). */
export async function privacyStatus(db: Db, userId: number): Promise<PrivacyStatus> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { privacyVersion: true, privacyAcceptedAt: true, privacyHow: true },
  });
  return { ok: privacyOk(row), version: row?.privacyVersion ?? null, acceptedAt: row?.privacyAcceptedAt ?? null, how: row?.privacyHow ?? null };
}

/**
 * Store the acknowledgement of the CURRENT version against the user. `how` records whether this was the user's
 * first acceptance or a re-acceptance after a version bump. `now` is injectable for tests.
 */
export async function recordPrivacyAck(db: Db, userId: number, now: Date = new Date()): Promise<{ version: string; how: PrivacyHow }> {
  const prior = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { privacyVersion: true } });
  if (!prior) throw new Error('no such user');
  const how: PrivacyHow = prior.privacyVersion ? 're-accept' : 'first-use';
  await db.update(schema.users).set({ privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: now, privacyHow: how }).where(eq(schema.users.id, userId));
  return { version: PRIVACY_VERSION, how };
}

/** Fallback privacy contact (the owner's address, as in CAIO Academy and AICoach). */
export const DEFAULT_PRIVACY_CONTACT = 'onlinemyassistant@gmail.com';

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** The privacy officer's address: the PRIVACY_CONTACT Worker var when it is a valid email, else the default. */
export function privacyContact(env: Partial<Pick<CloudflareEnv, 'PRIVACY_CONTACT'>>): string {
  const v = env.PRIVACY_CONTACT?.trim();
  return v && EMAIL_RE.test(v) ? v : DEFAULT_PRIVACY_CONTACT;
}
