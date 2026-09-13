'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import form from '@/components/ui/form.module.css';

export function ReviewEmail({ initialReviewEmail, identityEmail }: { initialReviewEmail: string | null; identityEmail: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initialReviewEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewEmail: value.trim() || null }) });
      const body = (await res.json().catch(() => null)) as { error?: string; reviewEmail?: string | null } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? `Save failed (${res.status})` });
        return;
      }
      setValue(body?.reviewEmail ?? '');
      setMsg({ ok: true, text: body?.reviewEmail ? `Packs go to ${body.reviewEmail}.` : identityEmail ? `Packs go to ${identityEmail} (identity email).` : 'Cleared — set one before the pipeline can email you.' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={form.row}>
        <input className={form.input} style={{ maxWidth: 360 }} type="email" placeholder={identityEmail ?? 'you@example.com'} value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="button" className={`${form.btn} ${form.primary}`} disabled={busy} onClick={save}>
          Save
        </button>
      </div>
      {msg && <p className={`${form.status} ${msg.ok ? form.statusOk : form.statusErr}`}>{msg.text}</p>}
    </div>
  );
}
