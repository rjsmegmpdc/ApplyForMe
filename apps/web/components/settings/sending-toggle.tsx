'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatNzFull } from '@/lib/ui/format';
import form from '@/components/ui/form.module.css';
import styles from './sending-toggle.module.css';

/**
 * The master switch for emailing job packs. Paused: new jobs are still read
 * and scored but held — no Claude call, no email, the 30-minute sweep sends
 * nothing. After resuming, held jobs can be released (tailored and emailed
 * within 30 minutes) or discarded.
 */
export function SendingToggle({ initial }: { initial: { paused: boolean; pausedAt: string | null; held: number } }) {
  const router = useRouter();
  const [st, setSt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function post(body: object, success: (d: typeof initial & { settled?: number }) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings/sending', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as typeof initial & { settled?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setSt({ paused: data.paused, pausedAt: data.pausedAt, held: data.held });
      setMsg({ ok: true, text: success(data) });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.box} ${st.paused ? styles.paused : styles.on}`} role="region" aria-label="Sending job packs">
      <div className={styles.row}>
        <span className={styles.dot} aria-hidden="true" />
        <div className={styles.text}>
          <strong>{st.paused ? 'Sending is paused' : 'Sending is on'}</strong>
          <span className={styles.sub}>
            {st.paused
              ? `Since ${st.pausedAt ? formatNzFull(st.pausedAt) : 'now'}. New jobs are scored and held — no Claude calls, no emails.`
              : 'Matching jobs are tailored and emailed to you as they arrive.'}
            {st.held > 0 ? ` ${st.held} job${st.held === 1 ? '' : 's'} held.` : ''}
          </span>
        </div>
        <button
          type="button"
          className={`${form.btn} ${st.paused ? form.ok : ''}`}
          disabled={busy}
          aria-pressed={!st.paused}
          onClick={() => post({ paused: !st.paused }, (d) => (d.paused ? 'Sending paused.' : 'Sending is back on.'))}
        >
          {busy ? 'Saving…' : st.paused ? 'Turn sending on' : 'Pause sending'}
        </button>
      </div>
      {!st.paused && st.held > 0 ? (
        <div className={styles.row}>
          <span className={styles.sub}>
            {st.held} job{st.held === 1 ? ' was' : 's were'} held while paused:
          </span>
          <button type="button" className={`${form.btn} ${form.ok}`} disabled={busy} onClick={() => post({ held: 'release' }, (d) => `${d.settled ?? 0} queued — tailored and emailed within 30 minutes.`)}>
            Send held jobs
          </button>
          <button type="button" className={form.btn} disabled={busy} onClick={() => post({ held: 'discard' }, (d) => `${d.settled ?? 0} discarded (marked skipped).`)}>
            Discard held jobs
          </button>
        </div>
      ) : null}
      {msg ? <p className={`${form.status} ${msg.ok ? form.statusOk : form.statusErr}`}>{msg.text}</p> : null}
    </div>
  );
}
