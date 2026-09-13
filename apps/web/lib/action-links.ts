/**
 * Signed one-click action links for the review email. Each button in the
 * pack email ("Applied", "Not for me", "Regenerate", "Looks good") is a GET
 * to `/api/runs/<id>/action?a=<action>&exp=<unix seconds>&sig=<hex>` where
 * `sig` is HMAC-SHA256(ACTION_LINK_SECRET, `${runId}.${action}.${exp}`).
 * Those routes sit OUTSIDE Cloudflare Access (the user clicks from a mail
 * client, possibly on a phone with no Access session), so the signature is
 * the only thing standing between the link and a status flip — hence the
 * expiry and constant-time compare.
 *
 * WebCrypto only (workerd + Node 22). `now`/`expiresAt` are injected, never
 * read from the clock here, so the module stays deterministic and testable.
 */

export type RunAction = 'applied' | 'rejected' | 'regenerate' | 'thumbs-up';

const RUN_ACTIONS: readonly RunAction[] = ['applied', 'rejected', 'regenerate', 'thumbs-up'];

export function isRunAction(value: string): value is RunAction {
  return (RUN_ACTIONS as readonly string[]).includes(value);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(sig);
}

/** Constant-time string equality — the loop always runs the full length so timing never reveals where a forged sig diverged. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function signingInput(runId: number, action: string, expiresAt: number | string): string {
  return `${runId}.${action}.${expiresAt}`;
}

export async function signActionLink(opts: {
  baseUrl: string;
  runId: number;
  action: RunAction;
  secret: string;
  /** Unix seconds after which the link is refused. */
  expiresAt: number;
}): Promise<string> {
  const sig = await hmacHex(opts.secret, signingInput(opts.runId, opts.action, opts.expiresAt));
  const base = opts.baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({ a: opts.action, exp: String(opts.expiresAt), sig });
  return `${base}/api/runs/${opts.runId}/action?${params.toString()}`;
}

export type VerifyActionLinkResult = { ok: true; action: RunAction } | { ok: false; reason: string };

/**
 * Verify the query parameters of an action link. The order of checks is
 * deliberate: cheap shape checks first, then the HMAC, then expiry — so an
 * expired-but-valid link is reported as 'expired' (the UI can offer a fresh
 * one) while a forged link never learns anything beyond 'bad signature'.
 */
export async function verifyActionLink(opts: {
  runId: number;
  action: string;
  exp: string | null;
  sig: string | null;
  secret: string;
  /** Unix seconds "now" — injected by the caller. */
  now: number;
}): Promise<VerifyActionLinkResult> {
  if (!isRunAction(opts.action)) return { ok: false, reason: 'unknown action' };
  if (!opts.exp || !/^\d+$/.test(opts.exp)) return { ok: false, reason: 'missing or malformed exp' };
  if (!opts.sig || !/^[0-9a-f]+$/i.test(opts.sig)) return { ok: false, reason: 'missing or malformed sig' };

  const expected = await hmacHex(opts.secret, signingInput(opts.runId, opts.action, opts.exp));
  if (!timingSafeEqual(expected, opts.sig.toLowerCase())) return { ok: false, reason: 'bad signature' };

  if (Number(opts.exp) < opts.now) return { ok: false, reason: 'expired' };
  return { ok: true, action: opts.action };
}
