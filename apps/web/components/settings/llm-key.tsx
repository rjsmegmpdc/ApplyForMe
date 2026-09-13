'use client';

import { useState, type FormEvent } from 'react';
import type { LlmCredentialSource } from '@/server/adapters/llm-credentials';
import { Badge } from '@/components/ui/badge';
import form from '@/components/ui/form.module.css';

const API_KEY_RE = /^sk-ant-.{10,}$/;

const LABEL: Record<LlmCredentialSource, string> = {
  personal: 'personal key',
  'server-default': 'server default',
  'not-configured': 'not configured',
};

/** Write-only key form (ported pattern from AICoach): the value never comes back from the server; it only ever leaves this form on Save. */
export function LlmKey({ initialSource, canStore }: { initialSource: LlmCredentialSource; canStore: boolean }) {
  const [source, setSource] = useState(initialSource);
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const key = apiKey.trim();
    if (!API_KEY_RE.test(key)) {
      setMsg({ ok: false, text: 'Expected an Anthropic key starting with sk-ant-.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/settings/llm', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }) });
      const body = (await res.json().catch(() => null)) as { error?: string; source?: LlmCredentialSource } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? `Save failed (${res.status})` });
        return;
      }
      setSource('personal');
      setApiKey('');
      setOpen(false);
      setMsg({ ok: true, text: 'Personal key saved.' });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings/llm', { method: 'DELETE' });
      const body = (await res.json().catch(() => null)) as { error?: string; source?: LlmCredentialSource } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? `Clear failed (${res.status})` });
        return;
      }
      setSource(body?.source ?? 'not-configured');
      setMsg({ ok: true, text: 'Personal key removed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={form.row}>
        <Badge tone={source === 'personal' ? 'ok' : source === 'server-default' ? 'accent' : 'warn'}>{LABEL[source]}</Badge>
        {source === 'personal' ? (
          <>
            <button type="button" className={form.btn} disabled={busy} onClick={() => setOpen((o) => !o)}>
              Replace…
            </button>
            <button type="button" className={`${form.btn} ${form.danger}`} disabled={busy} onClick={clear}>
              Clear
            </button>
          </>
        ) : (
          <button type="button" className={form.btn} disabled={busy || !canStore} onClick={() => setOpen((o) => !o)}>
            Use my own key…
          </button>
        )}
      </div>
      {!canStore && <p className={form.help}>TOKENS_ENC_KEY is not set on this deployment, so a personal key cannot be stored.</p>}
      {open && (
        <form onSubmit={save} noValidate style={{ marginTop: 10 }}>
          <label className={form.field}>
            <span>API key</span>
            <input className={form.input} style={{ maxWidth: 420 }} type="password" autoComplete="new-password" placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <div className={form.row}>
            <button type="submit" className={`${form.btn} ${form.primary}`} disabled={busy}>
              Save key
            </button>
            <button type="button" className={form.btn} disabled={busy} onClick={() => { setOpen(false); setApiKey(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {msg && <p className={`${form.status} ${msg.ok ? form.statusOk : form.statusErr}`}>{msg.text}</p>}
    </div>
  );
}
