/**
 * Outbound email seam. The pipeline sends the review pack (CV + cover
 * letter attached, one-click action links in the body) through a `SendFn`
 * so the transport is swappable: Cloudflare Email Service (`env.EMAIL.send`)
 * in the deployed Worker, a logging stub locally and in tests.
 *
 * Nothing here reads the clock or generates ids on its own — the logging
 * fallback's `dev-<n>` message ids come from an injected counter so tests
 * are deterministic.
 */

export interface OutboundAttachment {
  filename: string;
  /** MIME type, e.g. application/vnd.openxmlformats-officedocument.wordprocessingml.document */
  contentType: string;
  /** Base64-encoded file bytes. */
  base64: string;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: OutboundAttachment[];
}

export type SendFn = (email: OutboundEmail) => Promise<{ messageId: string }>;

/**
 * Cloudflare Email Service transport. `from` comes from the EMAIL_FROM /
 * EMAIL_FROM_NAME vars (wrangler.jsonc) — the address must be on a domain
 * verified in the Email Service dashboard or the send is rejected.
 */
export function makeCloudflareSendFn(env: Pick<CloudflareEnv, 'EMAIL' | 'EMAIL_FROM' | 'EMAIL_FROM_NAME'>): SendFn {
  return async (email) => {
    const result = await env.EMAIL.send({
      from: env.EMAIL_FROM_NAME ? { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME } : { email: env.EMAIL_FROM },
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: email.replyTo,
      attachments: email.attachments?.map((a) => ({
        filename: a.filename,
        type: a.contentType,
        content: a.base64,
        disposition: 'attachment' as const,
      })),
    });
    return { messageId: result.messageId };
  };
}

/**
 * Dev/test transport — logs the envelope (recipient, subject, attachment
 * names; never the body or attachment bytes) and hands back `dev-<n>`. The
 * counter lives in the closure, so each factory call starts again at 1.
 */
export function makeLoggingSendFn(log: (line: string) => void = (line) => console.log(line)): SendFn {
  let counter = 0;
  return async (email) => {
    counter += 1;
    const messageId = `dev-${counter}`;
    const attachments = email.attachments?.map((a) => a.filename).join(', ') ?? '';
    log(`[email:dev] ${messageId} to=${email.to} subject=${JSON.stringify(email.subject)} attachments=[${attachments}]`);
    return { messageId };
  };
}

/** Values the scaffold ships in wrangler.jsonc until the real sender is configured — treated as "not set". */
function isPlaceholder(value: string | undefined): boolean {
  return !value || /placeholder/i.test(value) || /<[^>]+>/.test(value);
}

/**
 * Pick the transport from the environment: Cloudflare when the EMAIL
 * binding exists and EMAIL_FROM is a real address, otherwise the logging
 * fallback (local `next dev`, preview without the binding, tests).
 */
export function resolveSendFn(env: Partial<CloudflareEnv>, log?: (line: string) => void): SendFn {
  if (env.EMAIL && !isPlaceholder(env.EMAIL_FROM)) {
    return makeCloudflareSendFn({ EMAIL: env.EMAIL, EMAIL_FROM: env.EMAIL_FROM!, EMAIL_FROM_NAME: env.EMAIL_FROM_NAME });
  }
  return makeLoggingSendFn(log);
}
