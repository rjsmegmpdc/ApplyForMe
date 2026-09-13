'use client';

import { useState } from 'react';
import form from '@/components/ui/form.module.css';

export function TestEmail({ transport }: { transport: 'cloudflare' | 'log' }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings/test-email', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as { error?: string; to?: string; messageId?: string; transport?: string } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? `Send failed (${res.status})` });
        return;
      }
      setMsg({
        ok: true,
        text: body?.transport === 'log' ? `Logged only (no EMAIL binding here) — would go to ${body?.to}. id ${body?.messageId}` : `Sent to ${body?.to} · message id ${body?.messageId}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={form.row}>
        <button type="button" className={form.btn} disabled={busy} onClick={send}>
          {busy ? 'Sending…' : 'Send test email'}
        </button>
        <span className={form.help}>{transport === 'cloudflare' ? 'via Cloudflare Email Service' : 'no EMAIL binding — the send is logged, not delivered'}</span>
      </div>
      {msg && <p className={`${form.status} ${msg.ok ? form.statusOk : form.statusErr}`}>{msg.text}</p>}
    </div>
  );
}
