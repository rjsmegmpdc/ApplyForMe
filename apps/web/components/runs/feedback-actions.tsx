'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RunStatus } from '@/server/db/schema';
import form from '@/components/ui/form.module.css';
import styles from './feedback-actions.module.css';

type Action = 'applied' | 'rejected' | 'regenerate' | 'thumbs-up';

/**
 * Applied · Not for me (reason) · Regenerate (note) · Thumbs up. POSTs to
 * /api/runs/[id]/feedback (session-authenticated) then refreshes the server
 * page so the status badge updates.
 */
export function FeedbackActions({ runId, status }: { runId: number; status: RunStatus }) {
  const router = useRouter();
  const [open, setOpen] = useState<'rejected' | 'regenerate' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(action: Action, withReason?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/runs/${runId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: withReason?.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; status?: string } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? `Failed (${res.status})` });
        return;
      }
      const labels: Record<Action, string> = {
        applied: 'Marked as applied.',
        rejected: 'Marked as not for me.',
        regenerate: 'Regeneration requested.',
        'thumbs-up': 'Thumbs up recorded.',
      };
      setMsg({ ok: true, text: `${labels[action]}${withReason?.trim() ? ' Reason saved as a preference.' : ''}` });
      setOpen(null);
      setReason('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={form.row}>
        <button type="button" className={`${form.btn} ${form.ok}`} disabled={busy} onClick={() => submit('applied')}>
          Applied
        </button>
        <button type="button" className={`${form.btn} ${open === 'rejected' ? styles.on : ''}`} disabled={busy} onClick={() => setOpen(open === 'rejected' ? null : 'rejected')}>
          Not for me…
        </button>
        <button type="button" className={`${form.btn} ${open === 'regenerate' ? styles.on : ''}`} disabled={busy} onClick={() => setOpen(open === 'regenerate' ? null : 'regenerate')}>
          Regenerate with a note…
        </button>
        <button type="button" className={form.btn} disabled={busy} onClick={() => submit('thumbs-up')} title="Signal only — status stays as is">
          👍 Thumbs up
        </button>
        <span className={styles.current}>current: {status}</span>
      </div>

      {open && (
        <form
          className={styles.reasonForm}
          onSubmit={(e) => {
            e.preventDefault();
            submit(open, reason);
          }}
        >
          <label className={form.field}>
            <span>{open === 'rejected' ? 'Why not this one? (optional, one line)' : 'What should change? (one line)'}</span>
            <input className={form.input} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} autoFocus placeholder={open === 'rejected' ? 'e.g. too junior, wrong city' : 'e.g. lead with the Copilot Studio rollout, less on databases'} />
          </label>
          <div className={form.row}>
            <button type="submit" className={`${form.btn} ${form.primary}`} disabled={busy || (open === 'regenerate' && !reason.trim())}>
              {open === 'rejected' ? 'Mark as not for me' : 'Request regeneration'}
            </button>
            <button type="button" className={form.btn} disabled={busy} onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {msg && <p className={`${form.status} ${msg.ok ? form.statusOk : form.statusErr}`}>{msg.text}</p>}
    </div>
  );
}
