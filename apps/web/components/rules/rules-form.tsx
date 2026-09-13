'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formToRules, rulesToForm, type RulesForm as RulesFormValues } from '@/lib/ui/rules-form';
import { Note, Section } from '@/components/ui/section';
import form from '@/components/ui/form.module.css';

const LIST_FIELDS: { key: keyof RulesFormValues; label: string; help: string }[] = [
  { key: 'keywordsAny', label: 'Keywords — any', help: 'Process when at least one appears in the title or ad. Leave empty to not require a keyword.' },
  { key: 'keywordsAll', label: 'Keywords — all', help: 'Every one of these must appear.' },
  { key: 'preferredCompanies', label: 'Preferred companies', help: 'Always process (keywords and match % are not enforced). Exclusions still win.' },
  { key: 'excludedCompanies', label: 'Excluded companies', help: 'Always skip.' },
  { key: 'excludedTerms', label: 'Excluded terms', help: 'Skip when any appears in the title or ad — e.g. graduate, intern, contract.' },
  { key: 'locations', label: 'Locations', help: 'Allowed locations (substring match; "Remote" also matches work-from-home ads). Empty = anywhere.' },
];

/** Comma/newline lists + two numbers → PUT /api/rules as a TriggerRules object. */
export function RulesForm({ initial }: { initial: RulesFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<RulesFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof RulesFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const rules = formToRules(values);
      const res = await fetch('/api/rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rules) });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? `Save failed (${res.status})` });
        return;
      }
      setValues(rulesToForm(rules));
      setMsg({ ok: true, text: 'Rules saved.' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section label="Filters" description="Lists are comma- or newline-separated. Evaluation order: excluded company → excluded term → location → salary → preferred company → keywords → match %.">
        {LIST_FIELDS.map((f) => (
          <label key={f.key} className={form.field}>
            <span>{f.label}</span>
            <textarea className={form.textarea} rows={2} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            <span className={form.help}>{f.help}</span>
          </label>
        ))}
      </Section>

      <Section label="Thresholds">
        <div className={form.grid2}>
          <label className={form.field}>
            <span>Minimum salary (NZD / year)</span>
            <input className={form.input} inputMode="numeric" placeholder="blank = no minimum" value={values.minSalary} onChange={(e) => set('minSalary', e.target.value)} />
            <span className={form.help}>Only enforced when a salary can be parsed from the ad — "Competitive" never skips. "150k" is fine.</span>
          </label>
          <label className={form.field}>
            <span>Minimum match %</span>
            <input className={form.input} type="number" min={0} max={100} value={values.minMatchPercentage} onChange={(e) => set('minMatchPercentage', e.target.value)} />
            <span className={form.help}>Deterministic keyword match from the analyser, 0–100. Below this, no LLM tokens are spent.</span>
          </label>
        </div>
      </Section>

      <div className={form.row}>
        <button type="button" className={`${form.btn} ${form.primary}`} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save rules'}
        </button>
        {msg && <span className={`${form.status} ${msg.ok ? form.statusOk : form.statusErr}`}>{msg.text}</span>}
      </div>
      <Note>A skipped run still shows in the inbox with the reason, so you can see what the rules are doing.</Note>
    </>
  );
}
