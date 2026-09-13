import { and, desc, eq, like } from 'drizzle-orm';
import { getDb, getEnv, schema } from '@/server/db';
import { llmCredentialSource } from '@/server/adapters/llm-credentials';
import { pageIdentity } from '@/lib/ui/session';
import { formatNzFull } from '@/lib/ui/format';
import { Badge } from '@/components/ui/badge';
import { Note, PageTitle, Section, SessionExpired } from '@/components/ui/section';
import { ReviewEmail } from '@/components/settings/review-email';
import { LlmKey } from '@/components/settings/llm-key';
import { TestEmail } from '@/components/settings/test-email';
import styles from './settings.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARDING_PREFIX = 'Gmail forwarding confirmation code: ';

export default async function SettingsPage() {
  const identity = await pageIdentity();
  if (!identity) return <SessionExpired />;

  const db = getDb();
  const env = getEnv();
  const [user, llmSource, forwarding] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, identity.userId) }),
    llmCredentialSource(db, env.ANTHROPIC_API_KEY, identity.userId),
    db.query.preferences.findFirst({
      where: and(
        eq(schema.preferences.userId, identity.userId),
        eq(schema.preferences.kind, 'note'),
        eq(schema.preferences.source, 'feedback'),
        like(schema.preferences.text, `${FORWARDING_PREFIX}%`)
      ),
      orderBy: [desc(schema.preferences.createdAt), desc(schema.preferences.id)],
    }),
  ]);

  const code = forwarding ? forwarding.text.slice(FORWARDING_PREFIX.length).trim() : null;
  const emailFrom = env.EMAIL_FROM ?? '';
  const senderConfigured = Boolean(env.EMAIL) && !!emailFrom && !/placeholder|<[^>]+>/i.test(emailFrom);

  return (
    <>
      <PageTitle aside={identity.email ?? 'dev mode · user 1'}>Settings</PageTitle>

      <Section label="Forwarding confirmation" description="Gmail sends a confirmation code when you add the forwarding address (SETUP.md step 7). The Worker recognises that email and the newest code appears here.">
        {code ? (
          <>
            <p className={styles.code}>{code}</p>
            <Note>Received {forwarding && formatNzFull(forwarding.createdAt)}. Enter it in Gmail → Settings → Forwarding.</Note>
          </>
        ) : (
          <p className={styles.muted}>No confirmation email received yet. Add the forwarding address in Gmail and reload this page.</p>
        )}
      </Section>

      <Section label="Review email" description="Where the tailored pack is sent. Blank = your Access identity email.">
        <ReviewEmail initialReviewEmail={user?.reviewEmail ?? null} identityEmail={user?.email ?? null} />
      </Section>

      <Section label="Anthropic key" description="A personal key is encrypted at rest and wins over the server default. Only the source is ever shown, never the key.">
        <LlmKey initialSource={llmSource} canStore={Boolean(env.TOKENS_ENC_KEY)} />
      </Section>

      <Section label="Test email" description="Sends a short message to the review address through the same transport the pipeline uses.">
        <TestEmail transport={senderConfigured ? 'cloudflare' : 'log'} />
      </Section>

      <Section label="Deployment">
        <dl className={styles.facts}>
          <div>
            <dt>APP_BASE_URL</dt>
            <dd>
              <code>{env.APP_BASE_URL || '—'}</code>
            </dd>
          </div>
          <div>
            <dt>EMAIL_FROM</dt>
            <dd>
              <code>{emailFrom || '—'}</code> {senderConfigured ? <Badge tone="ok">sending</Badge> : <Badge tone="warn">log only</Badge>}
            </dd>
          </div>
          <div>
            <dt>Cloudflare Access</dt>
            <dd>{env.ACCESS_TEAM_DOMAIN ? <Badge tone="ok">configured</Badge> : <Badge tone="warn">not configured · dev mode</Badge>}</dd>
          </div>
          <div>
            <dt>Action links</dt>
            <dd>{env.ACTION_LINK_SECRET ? <Badge tone="ok">signing enabled</Badge> : <Badge tone="warn">ACTION_LINK_SECRET unset</Badge>}</dd>
          </div>
          <div>
            <dt>Key encryption</dt>
            <dd>{env.TOKENS_ENC_KEY ? <Badge tone="ok">TOKENS_ENC_KEY set</Badge> : <Badge tone="warn">TOKENS_ENC_KEY unset</Badge>}</dd>
          </div>
        </dl>
      </Section>
    </>
  );
}
