import Link from 'next/link';
import { headers } from 'next/headers';
import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { PRIVACY_VERSION, PRIVACY_VERSION_LABEL, privacyStatus } from '@/server/privacy';
import { SessionExpired } from '@/components/ui/section';
import { AcceptForm } from './accept-form';
import styles from '../privacy.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your privacy · ApplyForMe' };

/**
 * The privacy gate's landing (Matt, 2026-11-25). Every page sends a signed-in user here until they accept the
 * current statement (server/identity.ts → `{error: 'privacy'}` → lib/ui/session.ts redirect), and the client
 * fetch wrapper (components/layout/privacy-redirect.tsx) sends open tabs here on 403 {privacy: true}. A first
 * visit after Access is in effect sign-up, so the acknowledgement is captured before anything else. Only this
 * page and /api/privacy/accept resolve identity with allowPendingPrivacy; this page shows nothing else.
 */
export default async function PrivacyAcceptPage() {
  const db = getDb();
  const identity = await resolveUser(await headers(), db, getEnv(), { allowPendingPrivacy: true });
  if ('error' in identity) {
    return (
      <main className={styles.card}>
        <SessionExpired />
      </main>
    );
  }
  const status = await privacyStatus(db, identity.userId);

  return (
    <main className={styles.card}>
      <h1 className={styles.title}>Your privacy</h1>
      {status.ok ? (
        <>
          <p>You have accepted this privacy statement (version {PRIVACY_VERSION_LABEL}).</p>
          <p>
            <Link href="/runs">Continue to ApplyForMe</Link>
          </p>
        </>
      ) : (
        <>
          <p>
            {status.version
              ? 'Our privacy statement has changed. Please read it and accept it again to keep using ApplyForMe.'
              : 'Before you start, please read how ApplyForMe collects, uses and protects your information, including your CV, the job ads it reads and the documents it writes for you.'}
          </p>
          <p>
            <Link href="/privacy" target="_blank" rel="noopener">
              Read the privacy statement
            </Link>{' '}
            (version {PRIVACY_VERSION_LABEL})
          </p>
          <AcceptForm version={PRIVACY_VERSION} />
        </>
      )}
    </main>
  );
}
