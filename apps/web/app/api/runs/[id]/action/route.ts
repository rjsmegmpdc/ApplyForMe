import { getDb, getEnv } from '@/server/db';
import { getRun, recordFeedback } from '@/server/runs';
import { verifyActionLink, type RunAction } from '@/lib/action-links';

/**
 * GET/POST /api/runs/[id]/action?a=&exp=&sig= — the ONE-CLICK LINKS in the
 * review email. The signed query string IS the credential: no Access JWT
 * is consulted here (the click comes from a mail client, often a phone with
 * no Access session). `verifyActionLink` checks shape → HMAC → expiry, and
 * only then does the run's status flip.
 *
 *   applied / thumbs-up : record on GET, show a confirmation page.
 *   rejected / regenerate: GET shows a one-line reason form (or records
 *                          straight away when ?reason= is present); the form
 *                          POSTs `reason` back to the same signed URL, which
 *                          re-verifies before recording.
 *
 * ACCESS NOTE (for the lead's Zero Trust config): Cloudflare Access sits in
 * front of the whole hostname, so this path must be carved out with a
 * "Bypass" policy on `/api/runs/<id>/action` — otherwise Access intercepts the
 * click with its login page before this handler ever runs. The signature +
 * expiry is what makes the bypass safe.
 */
export const runtime = 'nodejs';

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ApplyForMe</title>
<style>:root{color-scheme:light dark}body{margin:0;padding:32px 20px;font:16px/1.5 system-ui,sans-serif;background:#f6f7f8;color:#16181b}@media(prefers-color-scheme:dark){body{background:#0f1114;color:#e6e8eb}}
main{max-width:480px;margin:0 auto}h1{font-size:1.25rem;margin:0 0 12px}p{margin:0 0 12px}a{color:#1b5fbf}@media(prefers-color-scheme:dark){a{color:#6ea3f0}}
input{width:100%;padding:10px;font:inherit;border:1px solid #d9dde2;border-radius:6px;background:transparent;color:inherit;margin:8px 0 12px}
button{padding:10px 16px;font:inherit;border-radius:6px;border:1px solid #1b5fbf;background:#1b5fbf;color:#fff;cursor:pointer}</style></head>
<body><main><h1>${esc(title)}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: HTML_HEADERS });
}

const ACTION_LABEL: Record<RunAction, string> = {
  applied: 'Marked as applied',
  rejected: 'Marked as not for me',
  regenerate: 'Regeneration requested',
  'thumbs-up': 'Thanks — noted as a good pack',
};

const NEEDS_REASON: ReadonlySet<RunAction> = new Set(['rejected', 'regenerate']);

interface Verified {
  runId: number;
  action: RunAction;
  url: URL;
  backHref: string;
}

/** Shared verification for GET and POST. Returns a Response on failure so the callers can `return` it directly. */
async function verify(request: Request, idParam: string): Promise<Verified | Response> {
  const env = getEnv();
  if (!env.ACTION_LINK_SECRET) return page('Not configured', '<p>ACTION_LINK_SECRET is not set on this deployment.</p>', 503);

  const runId = Number(idParam);
  if (!Number.isInteger(runId) || runId <= 0) return page('Bad link', '<p>This link is malformed.</p>', 400);

  const url = new URL(request.url);
  const result = await verifyActionLink({
    runId,
    action: url.searchParams.get('a') ?? '',
    exp: url.searchParams.get('exp'),
    sig: url.searchParams.get('sig'),
    secret: env.ACTION_LINK_SECRET,
    now: Math.floor(Date.now() / 1000),
  });
  const backHref = `${env.APP_BASE_URL?.replace(/\/+$/, '') || ''}/runs`;
  if (!result.ok) {
    const msg = result.reason === 'expired' ? 'This link has expired. Open the run in the console to act on it.' : 'This link is not valid.';
    return page('Link refused', `<p>${esc(msg)}</p><p><a href="${esc(backHref)}">Back to runs</a></p>`, 403);
  }
  return { runId, action: result.action, url, backHref };
}

async function record(v: Verified, reason: string | null): Promise<Response> {
  const db = getDb();
  const run = await getRun(db, v.runId);
  if (!run) return page('Not found', `<p>Run ${v.runId} no longer exists.</p>`, 404);
  await recordFeedback(db, v.runId, v.action, reason);
  const runHref = `${v.backHref}/${v.runId}`;
  return page(
    ACTION_LABEL[v.action],
    `<p>${esc(run.jobTitle)}${run.company ? ` · ${esc(run.company)}` : ''}</p>` +
      (reason ? `<p>Noted: “${esc(reason)}”</p>` : '') +
      `<p><a href="${esc(runHref)}">Open this run</a> · <a href="${esc(v.backHref)}">Back to runs</a></p>`
  );
}

function reasonForm(v: Verified): Response {
  const prompt = v.action === 'rejected' ? 'Why not this one? One line is plenty — it becomes a preference for future packs.' : 'What should change? One line — it is stored as a note and the pack is regenerated.';
  const formAction = `${v.url.pathname}${v.url.search}`;
  return page(
    v.action === 'rejected' ? 'Not for me' : 'Regenerate with a note',
    `<form method="post" action="${esc(formAction)}"><p>${esc(prompt)}</p><input name="reason" maxlength="1000" autofocus placeholder="e.g. too junior, wrong city, tone too salesy"><button type="submit">${v.action === 'rejected' ? 'Mark as not for me' : 'Request regeneration'}</button></form>`
  );
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const v = await verify(request, id);
  if (v instanceof Response) return v;

  const reason = v.url.searchParams.get('reason')?.trim() || null;
  if (NEEDS_REASON.has(v.action) && !reason) return reasonForm(v);
  return record(v, reason);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const v = await verify(request, id);
  if (v instanceof Response) return v;

  let reason: string | null = null;
  try {
    const form = await request.formData();
    const raw = form.get('reason');
    reason = typeof raw === 'string' ? raw.trim().slice(0, 1000) || null : null;
  } catch {
    reason = null;
  }
  return record(v, reason);
}
