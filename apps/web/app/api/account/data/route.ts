import { getDb, getEnv } from '@/server/db';
import { identityErrorResponse, resolveUser } from '@/server/identity';
import { applyCorrection, buildMyData, correctionSchema } from '@/server/account-data';
import { privacyContact } from '@/server/privacy';

/**
 * GET /api/account/data — everything held about the signed-in user, each item with why (never a key value).
 * POST {field, value[, profileId]} corrects a field; POST {remove: {kind, id?}} removes one item in place
 * (Matt, 2026-11-25; Privacy Act 2020 IPP6/IPP7). Gated by the privacy acknowledgement like every API.
 */
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const db = getDb();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return identityErrorResponse(identity);
  return Response.json(await buildMyData(db, identity.userId, privacyContact(env)), { headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const db = getDb();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return identityErrorResponse(identity);
  const parsed = correctionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'That value is not valid, or not something that can be changed here.' }, { status: 400 });
  const r = await applyCorrection(db, identity.userId, parsed.data, env.DOCS ?? null);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ok: true, ...(await buildMyData(db, identity.userId, privacyContact(env))) }, { headers: NO_STORE });
}
