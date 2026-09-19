import { describe, it, expect } from 'vitest';
import { readRawMessage, parseInboundEmail, isSeekAlert, extractForwardConfirmationCode, extractForwardConfirmationLink, type InboundEmail } from './inbound';

/** Hand-built MIME fixtures — CRLF line endings as the wire format uses. */
function mime(lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

const SEEK_ALERT = mime([
  'From: SEEK <noreply@seek.co.nz>',
  'To: jobs@applyforme.test',
  'Subject: 3 new jobs: Modern Workplace Lead',
  'Date: Mon, 07 Sep 2026 20:15:00 +1200',
  'Message-ID: <alert-123@seek.co.nz>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="BOUNDARY"',
  '',
  '--BOUNDARY',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Modern Workplace Lead - Acme - Wellington',
  'https://www.seek.co.nz/job/81234567?type=standard',
  '',
  '--BOUNDARY',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><a href="https://www.seek.co.nz/job/81234567?type=standard">Modern Workplace Lead</a></body></html>',
  '--BOUNDARY--',
]);

/** A Gmail auto-forward of the same alert: From is rewritten to the Gmail account, no Message-ID at all. */
const GMAIL_FORWARDED_NO_ID = mime([
  'From: Sam <sam@gmail.com>',
  'To: jobs@applyforme.test',
  'Subject: Fwd: 3 new jobs: Modern Workplace Lead',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><p>Forwarded from SEEK</p><a href="https://www.seek.co.nz/job/81234567">Modern Workplace Lead</a></body></html>',
]);

const FORWARD_CONFIRMATION = mime([
  'From: forwarding-noreply@google.com',
  'To: jobs@applyforme.test',
  'Subject: (#553914227) Gmail Forwarding Confirmation - Receive Mail from sam@gmail.com',
  'Message-ID: <fwd-confirm@google.com>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'sam@gmail.com has requested to automatically forward mail to your email address jobs@applyforme.test.',
  'Confirmation code: 553914227',
  '',
  'To allow sam@gmail.com to automatically forward mail to your address, please click the link below to confirm the request:',
  'https://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc',
]);

const UNRELATED = mime([
  'From: newsletter@example.com',
  'To: jobs@applyforme.test',
  'Subject: Weekly digest',
  'Message-ID: <digest@example.com>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Nothing to see here.',
]);

describe('readRawMessage', () => {
  it('drains the stream into the raw MIME string', async () => {
    const bytes = new TextEncoder().encode(SEEK_ALERT);
    const raw = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 40));
        controller.enqueue(bytes.slice(40));
        controller.close();
      },
    });
    expect(await readRawMessage({ raw })).toBe(SEEK_ALERT);
  });
});

describe('parseInboundEmail', () => {
  it('parses a multipart/alternative alert into text + html with the Message-ID as the id', async () => {
    const email = await parseInboundEmail(SEEK_ALERT);
    expect(email.messageId).toBe('alert-123@seek.co.nz');
    expect(email.from).toBe('noreply@seek.co.nz');
    expect(email.to).toBe('jobs@applyforme.test');
    expect(email.subject).toBe('3 new jobs: Modern Workplace Lead');
    expect(email.text).toContain('https://www.seek.co.nz/job/81234567');
    expect(email.html).toContain('<a href="https://www.seek.co.nz/job/81234567?type=standard">');
    expect(email.date).toBeTruthy();
  });

  it('falls back to a sha-256 of the raw message when Message-ID is missing (stable across redelivery)', async () => {
    const a = await parseInboundEmail(GMAIL_FORWARDED_NO_ID);
    const b = await parseInboundEmail(GMAIL_FORWARDED_NO_ID);
    expect(a.messageId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.messageId).toBe(b.messageId);
    expect(a.text).toBeNull();
    expect(a.html).toContain('seek.co.nz/job/81234567');
    expect(a.date).toBeNull();

    const other = await parseInboundEmail(UNRELATED.replace('Message-ID: <digest@example.com>\r\n', ''));
    expect(other.messageId).not.toBe(a.messageId);
  });
});

describe('isSeekAlert', () => {
  it('accepts a direct Seek sender', async () => {
    expect(isSeekAlert(await parseInboundEmail(SEEK_ALERT))).toBe(true);
  });

  it('accepts a Gmail forward whose From was rewritten, by the seek.co.nz/job link in the body', async () => {
    expect(isSeekAlert(await parseInboundEmail(GMAIL_FORWARDED_NO_ID))).toBe(true);
  });

  it('rejects unrelated mail, and mail that mentions seek without a job link', async () => {
    expect(isSeekAlert(await parseInboundEmail(UNRELATED))).toBe(false);
    const mention: InboundEmail = {
      messageId: 'x',
      from: 'friend@example.com',
      to: 'jobs@applyforme.test',
      subject: 'Have you tried seek?',
      text: 'Go to https://www.seek.co.nz/ and search.',
      html: null,
      date: null,
    };
    expect(isSeekAlert(mention)).toBe(false);
  });
});

describe('extractForwardConfirmationCode', () => {
  it('returns the code from a Gmail forwarding-confirmation mail', async () => {
    expect(extractForwardConfirmationCode(await parseInboundEmail(FORWARD_CONFIRMATION))).toBe('553914227');
  });

  it('falls back to the subject code when the body lacks the label', () => {
    const email: InboundEmail = {
      messageId: 'x',
      from: 'forwarding-noreply@google.com',
      to: 'jobs@applyforme.test',
      subject: '(#98765432) Gmail Forwarding Confirmation - Receive Mail from sam@gmail.com',
      text: 'Click the link to confirm.',
      html: null,
      date: null,
    };
    expect(extractForwardConfirmationCode(email)).toBe('98765432');
  });

  it('returns null for anything that is not a forwarding confirmation', async () => {
    expect(extractForwardConfirmationCode(await parseInboundEmail(SEEK_ALERT))).toBeNull();
    expect(extractForwardConfirmationCode(await parseInboundEmail(UNRELATED))).toBeNull();
  });
});

describe('extractForwardConfirmationLink', () => {
  it('returns the mail-settings verification link from a Gmail confirmation', async () => {
    const email = await parseInboundEmail(FORWARD_CONFIRMATION);
    expect(extractForwardConfirmationLink(email)).toBe('https://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc');
  });

  it('returns null for mail that is not a forwarding confirmation', async () => {
    const email = await parseInboundEmail(UNRELATED);
    expect(extractForwardConfirmationLink(email)).toBeNull();
  });
});
