import { getDb } from '@/server/db';
import { getTriggerRules } from '@/server/runs';
import { pageIdentity } from '@/lib/ui/session';
import { rulesFromJson, rulesToForm } from '@/lib/ui/rules-form';
import { formatNzFull } from '@/lib/ui/format';
import { PageTitle, SessionExpired } from '@/components/ui/section';
import { RulesForm } from '@/components/rules/rules-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Trigger rules — the gate that decides which alert jobs get a tailored pack. */
export default async function RulesPage() {
  const identity = await pageIdentity();
  if (!identity) return <SessionExpired />;

  const row = await getTriggerRules(getDb(), identity.userId);
  const initial = rulesToForm(rulesFromJson(row?.rulesJson));

  return (
    <>
      <PageTitle aside={row ? `saved ${formatNzFull(row.updatedAt)}` : 'using defaults — not saved yet'}>Rules</PageTitle>
      <RulesForm initial={initial} />
    </>
  );
}
