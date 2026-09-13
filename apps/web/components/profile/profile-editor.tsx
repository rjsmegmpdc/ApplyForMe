'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@applyforme/engine';
import { emptyProfile, parseProfileJson, validateProfile } from '@/lib/ui/profile-schema';
import { parseList } from '@/lib/ui/rules-form';
import { Note, Section } from '@/components/ui/section';
import form from '@/components/ui/form.module.css';
import styles from './profile-editor.module.css';

/**
 * Two views over one draft: cheap structured fields (name, contact, summary,
 * competencies) and the raw JSON for everything else. JSON edits are applied
 * explicitly ("Apply JSON") so a half-typed paste never clobbers the fields;
 * Save validates again and PUTs the whole profile.
 */
export function ProfileEditor({ initialProfile }: { initialProfile: UserProfile | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<UserProfile | null>(initialProfile);
  const [jsonText, setJsonText] = useState(initialProfile ? JSON.stringify(initialProfile, null, 2) : '');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [competencies, setCompetencies] = useState(initialProfile ? initialProfile.core_competencies.join('\n') : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<'fields' | 'json'>(initialProfile ? 'fields' : 'json');

  function update(patch: Partial<UserProfile>) {
    setDraft((d) => {
      const next = { ...(d ?? emptyProfile()), ...patch };
      setJsonText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function updatePersonal(patch: Partial<UserProfile['personal']>) {
    const base = draft ?? emptyProfile();
    update({ personal: { ...base.personal, ...patch } });
  }

  function applyJson(): UserProfile | null {
    const parsed = parseProfileJson(jsonText);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      return null;
    }
    setJsonError(null);
    setDraft(parsed.profile);
    setCompetencies(parsed.profile.core_competencies.join('\n'));
    setJsonText(JSON.stringify(parsed.profile, null, 2));
    return parsed.profile;
  }

  async function save() {
    setMsg(null);
    // Whichever view is active is the source of truth for the save.
    const candidate = tab === 'json' ? applyJson() : draft ? { ...draft, core_competencies: parseList(competencies) } : null;
    if (!candidate) {
      if (tab !== 'json') setMsg({ ok: false, text: 'Nothing to save yet — import JSON first.' });
      return;
    }
    const valid = validateProfile(candidate);
    if (!valid.ok) {
      setMsg({ ok: false, text: valid.error });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid.profile) });
      const body = (await res.json().catch(() => null)) as { error?: string; created?: boolean } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? `Save failed (${res.status})` });
        return;
      }
      setDraft(valid.profile);
      setJsonText(JSON.stringify(valid.profile, null, 2));
      setCompetencies(valid.profile.core_competencies.join('\n'));
      setMsg({ ok: true, text: body?.created ? 'Profile created.' : 'Profile saved.' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return (
      <Section label="Import JSON" description="No profile yet. Paste the master profile JSON (v1's master-profile.json works as-is) and save — it becomes the default profile the pipeline tailors from.">
        <textarea className={`${form.textarea} ${form.mono} ${styles.json}`} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='{ "personal": { "name": "…" }, "executive_summary": "…", … }' spellCheck={false} />
        {jsonError && <p className={`${form.status} ${form.statusErr}`}>{jsonError}</p>}
        <div className={form.row}>
          <button type="button" className={`${form.btn} ${form.primary}`} disabled={busy || !jsonText.trim()} onClick={save}>
            Import and save
          </button>
          <button type="button" className={form.btn} disabled={busy} onClick={() => update({})}>
            Start from a blank profile
          </button>
        </div>
        {msg && <p className={`${form.status} ${msg.ok ? form.statusOk : form.statusErr}`}>{msg.text}</p>}
      </Section>
    );
  }

  const p = draft.personal;

  return (
    <>
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'fields'} className={tab === 'fields' ? styles.tabOn : styles.tab} onClick={() => setTab('fields')}>
          Fields
        </button>
        <button type="button" role="tab" aria-selected={tab === 'json'} className={tab === 'json' ? styles.tabOn : styles.tab} onClick={() => setTab('json')}>
          JSON
        </button>
      </div>

      {tab === 'fields' ? (
        <>
          <Section label="Personal">
            <div className={form.grid2}>
              <label className={form.field}>
                <span>Name</span>
                <input className={form.input} value={p.name} onChange={(e) => updatePersonal({ name: e.target.value })} />
              </label>
              <label className={form.field}>
                <span>Email</span>
                <input className={form.input} type="email" value={p.email} onChange={(e) => updatePersonal({ email: e.target.value })} />
              </label>
              <label className={form.field}>
                <span>Phone</span>
                <input className={form.input} value={p.phone} onChange={(e) => updatePersonal({ phone: e.target.value })} />
              </label>
              <label className={form.field}>
                <span>Address</span>
                <input className={form.input} value={p.address} onChange={(e) => updatePersonal({ address: e.target.value })} />
              </label>
              <label className={form.field}>
                <span>LinkedIn</span>
                <input className={form.input} value={p.linkedin} onChange={(e) => updatePersonal({ linkedin: e.target.value })} />
              </label>
              <label className={form.field}>
                <span>Nationality</span>
                <input className={form.input} value={p.nationality} onChange={(e) => updatePersonal({ nationality: e.target.value })} />
              </label>
              <label className={form.field}>
                <span>Years of experience</span>
                <input className={form.input} type="number" min={0} value={p.years_experience} onChange={(e) => updatePersonal({ years_experience: Number(e.target.value) || 0 })} />
              </label>
            </div>
          </Section>

          <Section label="Executive summary">
            <textarea className={form.textarea} rows={5} value={draft.executive_summary} onChange={(e) => update({ executive_summary: e.target.value })} />
          </Section>

          <Section label="Core competencies" description="One per line (commas work too). These are the phrases the analyser and the claim guard trace against.">
            <textarea className={form.textarea} rows={8} value={competencies} onChange={(e) => setCompetencies(e.target.value)} onBlur={() => update({ core_competencies: parseList(competencies) })} />
          </Section>

          <Section label="Career history, certifications, benefits">
            <p>
              {draft.career_history.length} role{draft.career_history.length === 1 ? '' : 's'} · {draft.certifications_and_training.length} certification
              {draft.certifications_and_training.length === 1 ? '' : 's'} · {draft.priority_benefits?.length ?? 0} priority benefit{(draft.priority_benefits?.length ?? 0) === 1 ? '' : 's'}
            </p>
            <Note>Edit these in the JSON view — they are lists of structured objects and a text editor is the honest tool for them.</Note>
          </Section>
        </>
      ) : (
        <Section label="Profile JSON" description="The whole UserProfile. Apply checks the shape; Save writes it.">
          <textarea className={`${form.textarea} ${form.mono} ${styles.json}`} value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
          {jsonError && <p className={`${form.status} ${form.statusErr}`}>{jsonError}</p>}
          <div className={form.row}>
            <button type="button" className={form.btn} disabled={busy} onClick={() => applyJson() && setMsg({ ok: true, text: 'JSON applied to fields (not saved yet).' })}>
              Apply JSON
            </button>
          </div>
        </Section>
      )}

      <div className={form.row}>
        <button type="button" className={`${form.btn} ${form.primary}`} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
        {msg && <span className={`${form.status} ${msg.ok ? form.statusOk : form.statusErr}`}>{msg.text}</span>}
      </div>
    </>
  );
}
