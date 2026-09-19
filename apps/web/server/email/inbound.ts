import PostalMime, { type Address } from 'postal-mime';

/**
 * Inbound email parsing for the Worker's `email` handler. Cloudflare Email
 * Routing hands us the raw RFC 5322 message as a stream; postal-mime turns
 * it into headers + text/html bodies (it runs unchanged in workerd and Node,
 * so the same code is exercised by tests).
 *
 * Two classifiers live here because they're about the *envelope*, not the
 * job content: `isSeekAlert` decides whether the pipeline should look at a
 * message at all, and `extractForwardConfirmationCode` catches the one-off
 * Gmail "Forwarding Confirmation" mail that arrives when the user first
 * sets up auto-forwarding to jobs@<domain> — the code has to be surfaced
 * (UI/logs) so they can paste it back into Gmail.
 */

export interface InboundEmail {
  /** RFC 5322 Message-ID as sent (angle brackets stripped), or `sha256:<hex>` of the raw message when the header is absent. */
  messageId: string;
  from: string;
  to: string;
  subject: string;
  html: string | null;
  text: string | null;
  /** The message's Date header verbatim (postal-mime normalises to ISO when it can parse it), null when missing. */
  date: string | null;
}

/** Drain the Email Routing message stream into a string — the raw MIME source. */
export async function readRawMessage(message: { raw: ReadableStream<Uint8Array> }): Promise<string> {
  return new Response(message.raw).text();
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** First mailbox address in an address header (groups flattened), or '' when there is none. */
function firstAddress(addresses: Address[] | Address | undefined): string {
  const list = addresses == null ? [] : Array.isArray(addresses) ? addresses : [addresses];
  for (const entry of list) {
    if (entry.address) return entry.address;
    if (entry.group) {
      const inner = firstAddress(entry.group);
      if (inner) return inner;
    }
  }
  return '';
}

/**
 * Parse a raw MIME message. The Message-ID is the dedupe key for
 * `processed_emails`; when a sender omits it (rare, but Gmail's own system
 * mails and some forwarders do) we fall back to a content hash so the same
 * bytes redelivered still dedupe, while two different header-less messages
 * never collide.
 */
export async function parseInboundEmail(raw: string): Promise<InboundEmail> {
  const parsed = await PostalMime.parse(raw);
  const headerId = parsed.messageId?.trim().replace(/^<|>$/g, '');
  const messageId = headerId && headerId.length > 0 ? headerId : `sha256:${await sha256Hex(raw)}`;
  return {
    messageId,
    from: firstAddress(parsed.from),
    to: firstAddress(parsed.to),
    subject: parsed.subject ?? '',
    html: parsed.html ?? null,
    text: parsed.text ?? null,
    date: parsed.date ?? null,
  };
}

const SEEK_JOB_LINK = /https?:\/\/(?:[a-z0-9-]+\.)*seek\.co\.nz\/job\//i;

/**
 * Is this a Seek job-alert email? A direct Seek sender is the easy case;
 * Gmail auto-forwarding rewrites From to the Gmail account, so the second
 * path recognises a forwarded alert by its content: a mention of Seek plus
 * at least one seek.co.nz/job link in the body.
 */
export function isSeekAlert(email: InboundEmail): boolean {
  if (/seek\.co\.nz/i.test(email.from)) return true;
  const body = `${email.text ?? ''}\n${email.html ?? ''}`;
  const mentionsSeek = /seek/i.test(email.subject) || /seek/i.test(body);
  return mentionsSeek && SEEK_JOB_LINK.test(body);
}

/**
 * Gmail's "Forwarding Confirmation" mail — subject like
 * `(#123456789) Gmail Forwarding Confirmation - Receive Mail from x@gmail.com`
 * with `Confirmation code: 123456789` in the body. Returns the code so it
 * can be surfaced, or null for any other message.
 */
export function extractForwardConfirmationCode(email: InboundEmail): string | null {
  if (!/forwarding confirmation/i.test(email.subject)) return null;
  const body = `${email.text ?? ''}\n${email.html ?? ''}`;
  const fromBody = body.match(/confirmation code[^0-9]{0,20}(\d{4,})/i);
  if (fromBody) return fromBody[1];
  const fromSubject = email.subject.match(/\(#(\d{4,})\)/);
  if (fromSubject) return fromSubject[1];
  const anyCode = body.match(/\b(\d{6,})\b/);
  return anyCode ? anyCode[1] : null;
}

/**
 * Gmail's confirmation email also carries a one-click verification link. Some
 * Gmail layouts hide the code entry box, so the link is the more reliable way
 * to complete verification. Google has used more than one link shape over
 * time, so this returns every google.com URL in the message (href values and
 * bare URLs, entities decoded, tracking wrappers left intact), most specific
 * first: anything containing "vf-" or "verif" is sorted to the front.
 * Empty array when the message is not a forwarding confirmation.
 */
export function extractForwardConfirmationLinks(email: InboundEmail): string[] {
  if (!/forwarding confirmation/i.test(email.subject)) return [];
  const body = `${email.text ?? ''}\n${email.html ?? ''}`.replace(/&amp;/g, '&').replace(/=\r?\n/g, '');
  const urls = new Set<string>();
  for (const m of body.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    if (/\.google\.com\//i.test(url) && !/\/support\.|policies\.google|accounts\.google\.com\/TOS/i.test(url)) urls.add(url);
  }
  const score = (u: string) => (/vf-|verif|confirm/i.test(u) ? 0 : 1);
  return [...urls].sort((a, b) => score(a) - score(b));
}

/** First (most likely) verification link, for callers that want one string. */
export function extractForwardConfirmationLink(email: InboundEmail): string | null {
  return extractForwardConfirmationLinks(email)[0] ?? null;
}
