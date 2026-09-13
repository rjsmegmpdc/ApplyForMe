import { getDb } from '@/server/db';
import { getOrCreateDefaultProfile } from '@/server/runs';
import { pageIdentity } from '@/lib/ui/session';
import { formatNzFull } from '@/lib/ui/format';
import { PageTitle, SessionExpired } from '@/components/ui/section';
import { ProfileEditor } from '@/components/profile/profile-editor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Master profile — the fact sheet every CV and letter is built from. */
export default async function ProfilePage() {
  const identity = await pageIdentity();
  if (!identity) return <SessionExpired />;

  const row = await getOrCreateDefaultProfile(getDb(), identity.userId);

  return (
    <>
      <PageTitle aside={row ? `"${row.name}" · saved ${formatNzFull(row.updatedAt)}` : 'no profile yet'}>Profile</PageTitle>
      <ProfileEditor initialProfile={row?.profileJson ?? null} />
    </>
  );
}
