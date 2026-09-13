import { describe, it, expect } from 'vitest';
import { makeCloudflareSendFn, makeLoggingSendFn, resolveSendFn, type OutboundEmail } from './send';

const PACK: OutboundEmail = {
  to: 'applicant@example.com',
  subject: 'Your pack: Modern Workplace Lead at Acme',
  html: '<p>Hi</p>',
  text: 'Hi',
  replyTo: 'jobs@applyforme.test',
  attachments: [
    { filename: 'CV.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: 'QUJD' },
    { filename: 'Cover Letter.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: 'REVG' },
  ],
};

function fakeBinding() {
  const sent: EmailSendMessage[] = [];
  const binding: EmailSendBinding = {
    async send(message) {
      sent.push(message);
      return { messageId: `<cf-${sent.length}@example>` };
    },
  };
  return { binding, sent };
}

describe('makeCloudflareSendFn', () => {
  it('maps the outbound email onto the Email Service binding shape', async () => {
    const { binding, sent } = fakeBinding();
    const send = makeCloudflareSendFn({ EMAIL: binding, EMAIL_FROM: 'jobs@applyforme.test', EMAIL_FROM_NAME: 'ApplyForMe' });

    const result = await send(PACK);

    expect(result).toEqual({ messageId: '<cf-1@example>' });
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toEqual({ email: 'jobs@applyforme.test', name: 'ApplyForMe' });
    expect(sent[0].to).toBe('applicant@example.com');
    expect(sent[0].subject).toBe(PACK.subject);
    expect(sent[0].html).toBe('<p>Hi</p>');
    expect(sent[0].text).toBe('Hi');
    expect(sent[0].replyTo).toBe('jobs@applyforme.test');
    expect(sent[0].attachments).toEqual([
      { filename: 'CV.docx', type: PACK.attachments![0].contentType, content: 'QUJD', disposition: 'attachment' },
      { filename: 'Cover Letter.docx', type: PACK.attachments![1].contentType, content: 'REVG', disposition: 'attachment' },
    ]);
  });

  it('omits the display name when EMAIL_FROM_NAME is unset', async () => {
    const { binding, sent } = fakeBinding();
    const send = makeCloudflareSendFn({ EMAIL: binding, EMAIL_FROM: 'jobs@applyforme.test' });
    await send({ ...PACK, attachments: undefined });
    expect(sent[0].from).toEqual({ email: 'jobs@applyforme.test' });
    expect(sent[0].attachments).toBeUndefined();
  });
});

describe('makeLoggingSendFn', () => {
  it('logs the envelope (never the body) and returns a counter-based dev id', async () => {
    const lines: string[] = [];
    const send = makeLoggingSendFn((l) => lines.push(l));

    expect(await send(PACK)).toEqual({ messageId: 'dev-1' });
    expect(await send(PACK)).toEqual({ messageId: 'dev-2' });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('dev-1');
    expect(lines[0]).toContain('applicant@example.com');
    expect(lines[0]).toContain('Modern Workplace Lead');
    expect(lines[0]).toContain('CV.docx');
    expect(lines[0]).not.toContain('<p>Hi</p>');
    expect(lines[0]).not.toContain('QUJD');
  });

  it('each factory call starts its own counter', async () => {
    const a = makeLoggingSendFn(() => {});
    const b = makeLoggingSendFn(() => {});
    await a(PACK);
    expect(await b(PACK)).toEqual({ messageId: 'dev-1' });
  });
});

describe('resolveSendFn', () => {
  it('uses Cloudflare when the binding and a real EMAIL_FROM are present', async () => {
    const { binding, sent } = fakeBinding();
    const send = resolveSendFn({ EMAIL: binding, EMAIL_FROM: 'jobs@applyforme.test' });
    const result = await send(PACK);
    expect(result.messageId).toBe('<cf-1@example>');
    expect(sent).toHaveLength(1);
  });

  it('falls back to logging when the binding is missing', async () => {
    const send = resolveSendFn({ EMAIL_FROM: 'jobs@applyforme.test' }, () => {});
    const result = await send({ ...PACK, attachments: undefined });
    expect(result.messageId).toBe('dev-1');
  });

  it('falls back to logging when EMAIL_FROM is a placeholder', async () => {
    const { binding, sent } = fakeBinding();
    for (const from of [undefined, '', 'PLACEHOLDER', 'jobs@PLACEHOLDER.example', '<set-me>@example.com']) {
      const send = resolveSendFn({ EMAIL: binding, EMAIL_FROM: from }, () => {});
      const result = await send({ ...PACK, attachments: undefined });
      expect(result.messageId).toMatch(/^dev-/);
    }
    expect(sent).toHaveLength(0);
  });
});
