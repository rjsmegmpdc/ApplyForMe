import { eq } from 'drizzle-orm';
import { getDb, getEnv, schema } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { resolveSendFn } from '@/server/email/send';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { DOCX_CONTENT_TYPE } from '@/server/docs/docx';

/**
 * POST /api/settings/test-email — sends a short plain email to the review
 * address through the same transport the pipeline uses (Cloudflare Email
 * Service when configured, the logging stub otherwise — the response says
 * which, so a `dev-1` message id is not mistaken for a real delivery). A
 * one-paragraph .docx is attached so the attachment path (bytes, not
 * base64 text) is verified end-to-end: if it opens in Word, packs will too.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const db = getDb();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, identity.userId) });
  const to = user?.reviewEmail ?? user?.email ?? null;
  if (!to) return Response.json({ error: 'no review email set — add one in Settings first' }, { status: 400 });

  const send = resolveSendFn(env);
  const sentAt = new Date().toISOString();
  const text = `This is a test email from ApplyForMe (${env.APP_BASE_URL}).\n\nSent ${sentAt}. If you can read this, review packs will reach this inbox. If the attached ApplyForMe_test.docx opens in Word, the CV and letter attachments will too.`;
  try {
    const doc = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun(`ApplyForMe attachment test — sent ${sentAt}. If you can read this, attachments work.`)] })] }],
    });
    const base64 = await Packer.toBase64String(doc);
    const { messageId } = await send({
      to,
      subject: 'ApplyForMe test email',
      text,
      html: `<p>${text.replace(/\n\n/g, '</p><p>')}</p>`,
      attachments: [{ filename: 'ApplyForMe_test.docx', contentType: DOCX_CONTENT_TYPE, base64 }],
    });
    const transport = env.EMAIL && env.EMAIL_FROM && !/placeholder|<[^>]+>/i.test(env.EMAIL_FROM) ? 'cloudflare' : 'log';
    return Response.json({ ok: true, to, messageId, transport });
  } catch (e) {
    return Response.json({ error: `send failed: ${(e as Error).message}` }, { status: 502 });
  }
}
