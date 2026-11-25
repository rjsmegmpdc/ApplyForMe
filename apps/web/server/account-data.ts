import { z } from 'zod';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { validateProfile } from '@/lib/ui/profile-schema';
import { PRIVACY_VERSION, PRIVACY_VERSION_LABEL } from '@/server/privacy';

/**
 * Settings › See and correct my data (Matt, 2026-11-25; Privacy Act 2020 IPP6 access, IPP7 correction).
 *
 * buildMyData lists EVERYTHING held about one user, table by table (server/db/schema.ts is the inventory;
 * server/account-data.test.ts fails if a table with a user_id column is missing here), each item with why we
 * hold it. Items that can be corrected in place carry `edit` (Change) and/or `remove` (Remove); the rest say
 * how to change them (`how`). Never returns a key or token value.
 */

export type EditKind = 'text' | 'email' | 'textarea';

export interface DataItem {
  /** Stable key for the UI. */
  key: string;
  label: string;
  value: string;
  why: string;
  /** In-place change: the field to send back as {field, value} (plus profileId for profile fields). */
  edit?: { field: string; kind: EditKind; profileId?: number; current: string };
  /** In-place removal: send back {remove: {kind, id}}. `confirm` is the question asked first. */
  remove?: { kind: RemoveKind; id?: number; confirm: string };
  /** How to change it when it can't be changed here. */
  how?: string;
}

export interface DataGroup {
  title: string;
  why: string;
  items: DataItem[];
}

export interface MyData {
  userId: number;
  groups: DataGroup[];
}

export type RemoveKind = 'reviewEmail' | 'preference' | 'run' | 'llmKey';

const PERSONAL_FIELDS = ['name', 'email', 'phone', 'address', 'linkedin', 'nationality'] as const;
type PersonalField = (typeof PERSONAL_FIELDS)[number];
const PERSONAL_LABEL: Record<PersonalField, string> = {
  name: 'Name on your CV',
  email: 'Email on your CV',
  phone: 'Phone on your CV',
  address: 'Address on your CV',
  linkedin: 'LinkedIn on your CV',
  nationality: 'Nationality / work rights',
};

const PREF_WHY: Record<string, string> = {
  tone: 'Steers the tone of your tailored CV and letter.',
  avoid: 'Tells the tailoring what to leave out.',
  emphasise: 'Tells the tailoring what to bring forward.',
  note: 'A note that steers tailoring (typed by you, or the reason you gave on a review-email button).',
  exemplar: 'A whole CV or letter you liked, so tailoring copies your voice. It is sent to Anthropic with each tailoring request.',
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function clip(s: string, n = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export async function buildMyData(db: Db, userId: number, contact: string): Promise<MyData> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return { userId, groups: [] };

  const [profiles, rules, prefs, runs, cred] = await Promise.all([
    db.query.profiles.findMany({ where: eq(schema.profiles.userId, userId), orderBy: [desc(schema.profiles.isDefault), schema.profiles.id] }),
    db.query.triggerRules.findFirst({ where: eq(schema.triggerRules.userId, userId) }),
    db.query.preferences.findMany({ where: eq(schema.preferences.userId, userId), orderBy: [desc(schema.preferences.createdAt), desc(schema.preferences.id)] }),
    db.query.runs.findMany({
      where: eq(schema.runs.userId, userId),
      orderBy: [desc(schema.runs.createdAt), desc(schema.runs.id)],
      columns: { id: true, jobTitle: true, company: true, location: true, status: true, matchPercentage: true, cvKey: true, letterKey: true, submittedAt: true, createdAt: true, tailoredJson: true, jobTextSource: true },
    }),
    db.query.llmCredentials.findFirst({ where: eq(schema.llmCredentials.userId, userId), columns: { provider: true, updatedAt: true } }),
  ]);
  const runIds = runs.map((r) => r.id);
  const feedbackRows = runIds.length
    ? await db.select({ runId: schema.feedback.runId, action: schema.feedback.action, reason: schema.feedback.reason, createdAt: schema.feedback.createdAt }).from(schema.feedback).where(inArray(schema.feedback.runId, runIds))
    : [];
  const feedbackByRun = new Map<number, typeof feedbackRows>();
  for (const f of feedbackRows) feedbackByRun.set(f.runId, [...(feedbackByRun.get(f.runId) ?? []), f]);

  const groups: DataGroup[] = [];

  groups.push({
    title: 'Your account',
    why: 'To know it is you and to send you your job packs.',
    items: [
      {
        key: 'email',
        label: 'Sign-in email',
        value: user.email ?? '— (local dev or service sign-in)',
        why: 'Cloudflare Access signs you in with this address; it is how the app knows which data is yours. Packs go here unless you set a review email.',
        how: `This is your sign-in identity, so it can't be changed here. To use a different address, email ${contact}.`,
      },
      {
        key: 'name',
        label: 'Account name',
        value: user.name,
        why: 'A label for your account (at first, the part of your email before the @).',
        edit: { field: 'name', kind: 'text', current: user.name },
      },
      {
        key: 'reviewEmail',
        label: 'Review email',
        value: user.reviewEmail ?? '— (not set: packs go to your sign-in email)',
        why: 'Where your tailored job packs are emailed.',
        edit: { field: 'reviewEmail', kind: 'email', current: user.reviewEmail ?? '' },
        ...(user.reviewEmail ? { remove: { kind: 'reviewEmail' as const, confirm: 'Remove the review email? Packs will go to your sign-in email.' } } : {}),
      },
      {
        key: 'sending',
        label: 'Sending',
        value: user.sendsPausedAt ? `Paused since ${fmtDate(user.sendsPausedAt)}` : 'On',
        why: 'Whether new matching jobs are tailored and emailed to you, or held.',
        how: 'Change it with the Sending switch at the top of Settings.',
      },
      { key: 'created', label: 'Account created', value: fmtDate(user.createdAt), why: 'Part of the account record.', how: 'Recorded automatically; it goes when you delete your account.' },
    ],
  });

  groups.push({
    title: 'Privacy acknowledgement',
    why: 'To show you were told how your information is handled before the app collected it.',
    items: [
      {
        key: 'privacy',
        label: 'Privacy statement accepted',
        value: user.privacyVersion
          ? `${user.privacyVersion === PRIVACY_VERSION ? PRIVACY_VERSION_LABEL : user.privacyVersion} · ${fmtDate(user.privacyAcceptedAt)} · ${user.privacyHow === 're-accept' ? 'accepted again after an update' : 'accepted on first use'}`
          : 'Not yet',
        why: 'The Privacy Act expects us to tell you how your information is used; this records that you read and accepted the statement.',
        how: 'Recorded when you accept; you are asked again whenever the statement changes.',
      },
    ],
  });

  for (const p of profiles) {
    const prof = p.profileJson;
    const items: DataItem[] = PERSONAL_FIELDS.map((f) => ({
      key: `profile-${p.id}-${f}`,
      label: PERSONAL_LABEL[f],
      value: prof.personal[f] || '—',
      why: f === 'name' ? 'Printed on your CV and letter, and sent to Anthropic so the tailoring can refer to you.' : 'Printed on the CV and cover letter the app writes for you. Not sent to the AI.',
      edit: { field: `personal.${f}`, kind: 'text' as const, profileId: p.id, current: prof.personal[f] ?? '' },
    }));
    const how = 'Change it on the Profile page.';
    items.push(
      { key: `profile-${p.id}-years`, label: 'Years of experience', value: String(prof.personal.years_experience), why: 'Used in your tailored summary and sent to Anthropic.', how },
      { key: `profile-${p.id}-summary`, label: 'Executive summary', value: clip(prof.executive_summary || '—'), why: 'The starting point for each tailored summary; sent to Anthropic.', how },
      { key: `profile-${p.id}-skills`, label: 'Core competencies', value: prof.core_competencies.length ? clip(prof.core_competencies.join(', ')) : '—', why: 'Matched against each job ad; sent to Anthropic.', how },
      {
        key: `profile-${p.id}-career`,
        label: `Career history (${prof.career_history.length} role${prof.career_history.length === 1 ? '' : 's'})`,
        value: prof.career_history.length ? clip(prof.career_history.map((r) => `${r.title}, ${r.company} (${r.start_date}–${r.end_date})`).join('; '), 400) : '—',
        why: 'Your employers, titles, dates, locations and achievements: matched against each job and sent to Anthropic to tailor your CV. The claim guard checks every tailored line against it.',
        how,
      },
      {
        key: `profile-${p.id}-certs`,
        label: 'Certifications and training',
        value: prof.certifications_and_training.length ? clip(prof.certifications_and_training.map((c) => `${c.name} (${c.year})`).join(', ')) : '—',
        why: 'Matched against each job and sent to Anthropic.',
        how,
      },
      {
        key: `profile-${p.id}-benefits`,
        label: 'Priority benefits',
        value: prof.priority_benefits?.length ? clip(prof.priority_benefits.map((b) => b.keyword).join(', ')) : '—',
        why: 'Looked for in each job ad so the score reflects what matters to you. Not sent to the AI.',
        how,
      },
      {
        key: `profile-${p.id}-salary`,
        label: 'Salary target',
        value: prof.salary_target ? `NZD ${prof.salary_target.min.toLocaleString('en-NZ')}–${prof.salary_target.max.toLocaleString('en-NZ')}` : '—',
        why: 'Scored against each job’s salary band in the match %. Not sent to the AI.',
        how,
      }
    );
    groups.push({
      title: `Profile: ${p.name}${p.isDefault ? ' (default)' : ''}`,
      why: 'Your master CV: the facts every tailored CV and cover letter is built from. CVs hold a lot of personal information.',
      items,
    });
  }

  groups.push({
    title: 'Job rules',
    why: 'To decide which job alerts are worth tailoring a pack for.',
    items: [
      {
        key: 'rules',
        label: 'Trigger rules',
        value: rules ? `Keywords, companies, locations, salary floor and minimum match · updated ${fmtDate(rules.updatedAt)}` : '— (none saved)',
        why: 'Your keywords, preferred and excluded companies, locations, salary floor and minimum match decide whether a job gets a pack.',
        how: 'Change them on the Rules page.',
      },
    ],
  });

  groups.push({
    title: `Tailoring preferences (${prefs.length})`,
    why: 'Notes and examples that steer how your CV and letter are written. They are sent to Anthropic with each tailoring request.',
    items: prefs.length
      ? prefs.map((pr) => ({
          key: `pref-${pr.id}`,
          label: `${pr.kind}${pr.source === 'feedback' ? ' · from a review-email button' : ''} · ${fmtDate(pr.createdAt)}`,
          value: clip(pr.text, pr.kind === 'exemplar' ? 200 : 300),
          why: PREF_WHY[pr.kind] ?? 'Steers tailoring.',
          remove: { kind: 'preference' as const, id: pr.id, confirm: 'Remove this preference?' },
          how: 'To reword it, remove it and add it again on the Preferences page.',
        }))
      : [{ key: 'pref-none', label: 'None', value: '—', why: 'Nothing saved.' }],
  });

  groups.push({
    title: `Jobs looked at (${runs.length})`,
    why: 'Each job ad the app assessed for you: the ad as fetched (which can name a hiring manager or recruiter), the match analysis, the tailored text, the CV and letter files, your button clicks and reasons, and whether you applied.',
    items: runs.length
      ? runs.map((r) => {
          const fb = feedbackByRun.get(r.id) ?? [];
          const docs = [r.cvKey, r.letterKey].filter(Boolean).length;
          const parts = [
            r.company ?? 'company not stated',
            r.location,
            r.status,
            r.matchPercentage != null ? `${r.matchPercentage}% match` : null,
            r.jobTextSource === 'full-ad' ? 'full ad stored' : 'alert snippet stored',
            r.tailoredJson ? 'tailored text stored' : null,
            docs ? `${docs} document${docs === 1 ? '' : 's'} stored` : null,
            fb.length ? `${fb.length} response${fb.length === 1 ? '' : 's'}${fb.some((f) => f.reason) ? ' with reasons' : ''}` : null,
            r.submittedAt ? `submitted ${fmtDate(r.submittedAt)}` : null,
          ].filter(Boolean);
          return {
            key: `run-${r.id}`,
            label: `${r.jobTitle} · ${fmtDate(r.createdAt)}`,
            value: parts.join(' · '),
            why: 'So you can review the pack, download the documents again and track what you applied for; your responses steer later packs.',
            remove: { kind: 'run' as const, id: r.id, confirm: `Remove “${r.jobTitle}” with its ad, analysis, tailored text, CV and letter files and your responses? If the same job comes in again it is treated as new.` },
          };
        })
      : [{ key: 'run-none', label: 'None', value: '—', why: 'Nothing saved.' }],
  });

  groups.push({
    title: 'Keys',
    why: 'To pay for tailoring with your own AI account if you choose.',
    items: [
      {
        key: 'llmKey',
        label: 'Personal Anthropic key',
        value: cred ? `Stored, encrypted (${cred.provider}) · saved ${fmtDate(cred.updatedAt)} · never shown` : '— (none: the server’s key is used)',
        why: 'Used only to call Anthropic for your tailoring.',
        ...(cred ? { remove: { kind: 'llmKey' as const, confirm: 'Remove your personal Anthropic key? The server’s key is used instead.' } } : { how: 'Add one under Settings › Anthropic key.' }),
      },
    ],
  });

  if (userId === DEFAULT_USER_ID) {
    const [{ n }] = await db.select({ n: count() }).from(schema.processedEmails);
    groups.push({
      title: 'Job-alert emails',
      why: 'The email pipeline runs for this (the owner’s) account.',
      items: [
        {
          key: 'inbound',
          label: `Alert emails received (${n})`,
          value: 'Sender type, subject, date and number of jobs for each Seek or LinkedIn alert forwarded to the jobs address; a raw copy of each email is kept in storage.',
          why: 'So an alert is never processed twice, and a mis-read alert can be replayed when the reader is fixed.',
          how: `Not changeable here. Ask ${contact} to remove them.`,
        },
      ],
    });
  }

  return { userId, groups };
}

/* ------------------------------------------------------------------------ */
/* Corrections                                                               */
/* ------------------------------------------------------------------------ */

const personalField = z.enum(PERSONAL_FIELDS);

export const correctionSchema = z.union([
  z.object({ field: z.literal('name'), value: z.string().trim().min(1).max(100) }),
  z.object({ field: z.literal('reviewEmail'), value: z.union([z.string().trim().email().max(200), z.literal('')]) }),
  z.object({
    field: z.string().regex(/^personal\.[a-z]+$/),
    profileId: z.number().int().positive(),
    value: z.string().max(500),
  }),
  z.object({ remove: z.object({ kind: z.enum(['reviewEmail', 'preference', 'run', 'llmKey']), id: z.number().int().positive().optional() }) }),
]);

export type Correction = z.infer<typeof correctionSchema>;

export interface DocStore {
  delete(keys: string | string[]): Promise<void>;
}

/** Delete one run and everything that hangs off it (feedback rows, its R2 documents; feedback notes keep their text but lose the link). */
export async function deleteRunCascade(db: Db, userId: number, runId: number, docs: DocStore | null): Promise<boolean> {
  const run = await db.query.runs.findFirst({ where: and(eq(schema.runs.id, runId), eq(schema.runs.userId, userId)), columns: { id: true, cvKey: true, letterKey: true } });
  if (!run) return false;
  const keys = [run.cvKey, run.letterKey].filter((k): k is string => Boolean(k));
  if (docs && keys.length) await docs.delete(keys);
  await db.delete(schema.feedback).where(eq(schema.feedback.runId, runId));
  await db.update(schema.preferences).set({ runId: null }).where(and(eq(schema.preferences.runId, runId), eq(schema.preferences.userId, userId)));
  await db.delete(schema.runs).where(and(eq(schema.runs.id, runId), eq(schema.runs.userId, userId)));
  return true;
}

export async function applyCorrection(db: Db, userId: number, c: Correction, docs: DocStore | null): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if ('remove' in c) {
    const { kind, id } = c.remove;
    if (kind === 'reviewEmail') {
      await db.update(schema.users).set({ reviewEmail: null }).where(eq(schema.users.id, userId));
      return { ok: true };
    }
    if (kind === 'llmKey') {
      await db.delete(schema.llmCredentials).where(eq(schema.llmCredentials.userId, userId));
      return { ok: true };
    }
    if (!id) return { ok: false, status: 400, error: 'Which one?' };
    if (kind === 'preference') {
      const gone = await db.delete(schema.preferences).where(and(eq(schema.preferences.id, id), eq(schema.preferences.userId, userId))).returning({ id: schema.preferences.id });
      return gone.length ? { ok: true } : { ok: false, status: 404, error: 'Not found.' };
    }
    return (await deleteRunCascade(db, userId, id, docs)) ? { ok: true } : { ok: false, status: 404, error: 'Not found.' };
  }

  if (c.field === 'name') {
    await db.update(schema.users).set({ name: c.value }).where(eq(schema.users.id, userId));
    return { ok: true };
  }
  if (c.field === 'reviewEmail') {
    await db.update(schema.users).set({ reviewEmail: c.value ? c.value.toLowerCase() : null }).where(eq(schema.users.id, userId));
    return { ok: true };
  }

  // Profile personal field.
  if (!('profileId' in c)) return { ok: false, status: 400, error: 'Not something that can be changed here.' };
  const key = personalField.safeParse(c.field.slice('personal.'.length));
  if (!key.success) return { ok: false, status: 400, error: 'Not something that can be changed here.' };
  const row = await db.query.profiles.findFirst({ where: and(eq(schema.profiles.id, c.profileId), eq(schema.profiles.userId, userId)) });
  if (!row) return { ok: false, status: 404, error: 'Not found.' };
  const next = { ...row.profileJson, personal: { ...row.profileJson.personal, [key.data]: c.value.trim() } };
  const valid = validateProfile(next);
  if (!valid.ok) return { ok: false, status: 400, error: valid.error };
  await db.update(schema.profiles).set({ profileJson: valid.profile, updatedAt: new Date() }).where(eq(schema.profiles.id, row.id));
  return { ok: true };
}
