import { getDb, getEnv } from '@/server/db';
import { identityErrorResponse, resolveUser } from '@/server/identity';
import { blockerText, deleteAccountData, deletionBlockers } from '@/server/account-delete';

/**
 * Settings › Delete my account (Matt, 2026-11-25). GET → {canDelete, blockers}. POST {confirm: "DELETE"}
 * deletes the signed-in user's account and everything with it (server/account-delete.ts). Cloudflare Access
 * has already authenticated the caller, so the typed DELETE plus the browser confirm is the re-confirmation.
 * Only ever the caller's own account; never the owner account (the email pipeline runs for it) and never a
 * service-token or local-dev request.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return identityErrorResponse(identity);
  const blockers = deletionBlockers(identity.userId, identity.email);
  return Response.json({ canDelete: blockers.length === 0, blockers: blockers.map(blockerText) });
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const db = getDb();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return identityErrorResponse(identity);
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== 'DELETE') return Response.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  const blockers = deletionBlockers(identity.userId, identity.email);
  if (blockers.length) return Response.json({ error: blockers.map(blockerText).join(' '), blockers }, { status: 403 });
  const r = await deleteAccountData(db, identity.userId, env.DOCS ?? null);
  return Response.json({ ok: true, ...r });
}
