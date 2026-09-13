import { getDb } from '@/server/db';
import { listPreferences } from '@/server/runs';
import { pageIdentity } from '@/lib/ui/session';
import { PageTitle, SessionExpired } from '@/components/ui/section';
import { PreferencesPanel, type PreferenceDto } from '@/components/preferences/preferences-panel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Steering notes for the tailoring prompt — typed here or captured from review-email feedback. */
export default async function PreferencesPage() {
  const identity = await pageIdentity();
  if (!identity) return <SessionExpired />;

  const rows = await listPreferences(getDb(), identity.userId);
  const initial: PreferenceDto[] = rows
    .map((r) => ({ id: r.id, kind: r.kind, text: r.text, source: r.source, runId: r.runId, createdAt: r.createdAt.toISOString() }))
    .reverse();

  return (
    <>
      <PageTitle aside={`${initial.length} note${initial.length === 1 ? '' : 's'}`}>Preferences</PageTitle>
      <PreferencesPanel initial={initial} />
    </>
  );
}
