'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import form from '@/components/ui/form.module.css';

/**
 * "Analyse a job link" — paste a Seek or LinkedIn job URL (or any job page)
 * and run it through the pipeline immediately, without waiting for an alert
 * email. Optional pasted ad text covers pages the Worker cannot fetch.
 */
export function RunUrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/runs/url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), text: text.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { runId?: number; status?: string; reason?: string; error?: string };
      if (!res.ok) {
        setMsg(data.error ?? `Failed (${res.status})`);
      } else {
        setMsg(`Run ${data.runId}: ${data.status}${data.reason ? ` — ${data.reason}` : ''}`);
        setUrl('');
        setText('');
        router.refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={form.field}>
      <label className={form.label} htmlFor="run-url">
        Job link
      </label>
      <input id="run-url" className={form.input} type="url" placeholder="https://www.linkedin.com/jobs/view/… or https://www.seek.co.nz/job/…" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
      <label className={form.label} htmlFor="run-text">
        Ad text (optional — paste it if the page cannot be fetched)
      </label>
      <textarea id="run-text" className={form.textarea} rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
      <div className={form.row}>
        <button type="button" className={`${form.btn} ${form.ok}`} disabled={busy || url.trim().length < 8} onClick={submit}>
          {busy ? 'Running… (30–90 s)' : 'Analyse and email me the pack'}
        </button>
        {msg ? <span className={form.help}>{msg}</span> : null}
      </div>
    </div>
  );
}
