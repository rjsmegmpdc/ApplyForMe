'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Preference } from '@/server/db/schema';
import { formatNz, type Tone } from '@/lib/ui/format';
import { Badge } from '@/components/ui/badge';
import { Note, Section } from '@/components/ui/section';
import form from '@/components/ui/form.module.css';
import styles from './preferences-panel.module.css';

export interface PreferenceDto {
  id: number;
  kind: Preference['kind'];
  text: string;
  source: Preference['source'];
  runId: number | null;
  createdAt: string;
}

const KIND_TONE: Record<Preference['kind'], Tone> = { tone: 'accent', avoid: 'warn', emphasise: 'ok', note: 'muted' };
const KIND_HELP: Record<Preference['kind'], string> = {
  tone: 'How the writing should sound — "direct, no fluff", "warm but concise".',
  avoid: 'Words or angles to keep out — "buzzwords", "no mention of database admin".',
  emphasise: 'What to lead with — "Copilot Studio rollout", "cost governance".',
  note: 'Anything else the tailoring prompt should know.',
};

export function PreferencesPanel({ initial }: { initial: PreferenceDto[] }) {
  const [rows, setRows] = useState(initial);
  const [kind, setKind] = useState<Preference['kind']>('tone');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text: text.trim() }) });
      const body = (await res.json().catch(() => null)) as { error?: string; preference?: Preference } | null;
      if (!res.ok || !body?.preference) {
        setMsg(body?.error ?? `Add failed (${res.status})`);
        return;
      }
      const p = body.preference;
      setRows((r) => [{ id: p.id, kind: p.kind, text: p.text, source: p.source, runId: p.runId, createdAt: new Date(p.createdAt).toISOString() }, ...r]);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/preferences', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) {
        setMsg(`Delete failed (${res.status})`);
        return;
      }
      setRows((r) => r.filter((p) => p.id !== id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section label="Add" description="Every preference is injected into the tailoring prompt, so keep each one short and concrete.">
        <div className={styles.addRow}>
          <select className={form.select} value={kind} onChange={(e) => setKind(e.target.value as Preference['kind'])} aria-label="Kind">
            <option value="tone">tone</option>
            <option value="avoid">avoid</option>
            <option value="emphasise">emphasise</option>
            <option value="note">note</option>
          </select>
          <input
            className={form.input}
            value={text}
            maxLength={1000}
            placeholder={KIND_HELP[kind]}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className={`${form.btn} ${form.primary}`} disabled={busy || !text.trim()} onClick={add}>
            Add
          </button>
        </div>
        {msg && <p className={`${form.status} ${form.statusErr}`}>{msg}</p>}
      </Section>

      <Section label="All preferences">
        {rows.length === 0 ? (
          <p className={styles.muted}>None yet. Reasons you give from a review email ("Not for me" / "Regenerate") land here automatically as notes.</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((p) => (
              <li key={p.id} className={styles.item}>
                <Badge tone={KIND_TONE[p.kind]}>{p.kind}</Badge>
                <span className={styles.text}>{p.text}</span>
                <span className={styles.meta}>
                  {p.source === 'feedback' ? (p.runId ? <Link href={`/runs/${p.runId}`}>from run {p.runId}</Link> : 'from feedback') : 'manual'} · {formatNz(p.createdAt)}
                </span>
                <button type="button" className={`${form.btn} ${styles.del}`} disabled={busy} onClick={() => remove(p.id)} aria-label={`Delete preference ${p.id}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <Note>Order does not matter to the prompt; newest is shown first here.</Note>
      </Section>
    </>
  );
}
