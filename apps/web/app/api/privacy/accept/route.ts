import { getDb, getEnv } from '@/server/db';
import { identityErrorResponse, resolveUser } from '@/server/identity';
import { PRIVACY_VERSION, privacyStatus, recordPrivacyAck } from '@/server/privacy';

/**
 * GET → {version, accepted, acceptedVersion, acceptedAt, how} · POST {accept: true, version} records the
 * acknowledgement of the CURRENT statement against the signed-in user (Matt, 2026-11-25). The tick is checked
 * here, server-side: a POST without `accept: true`, or for a version the server is no longer on, records
 * nothing. One of only two places that resolve identity with allowPendingPrivacy (the other is the accept page).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv(), { allowPendingPrivacy: true });
  if ('error' in identity) return identityErrorResponse(identity);
  const s = await privacyStatus(db, identity.userId);
  return Response.json({ version: PRIVACY_VERSION, accepted: s.ok, acceptedVersion: s.version, acceptedAt: s.acceptedAt?.toISOString() ?? null, how: s.how });
}

export async function POST(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv(), { allowPendingPrivacy: true });
  if ('error' in identity) return identityErrorResponse(identity);
  const body = (await request.json().catch(() => null)) as { accept?: unknown; version?: unknown } | null;
  if (body?.accept !== true) return Response.json({ error: 'Tick “I have read and accept” to continue.' }, { status: 400 });
  if (body.version !== PRIVACY_VERSION) {
    return Response.json({ error: 'The privacy statement has changed. Reload the page and read the new version.', version: PRIVACY_VERSION }, { status: 409 });
  }
  const r = await recordPrivacyAck(db, identity.userId);
  return Response.json({ ok: true, ...r });
}
