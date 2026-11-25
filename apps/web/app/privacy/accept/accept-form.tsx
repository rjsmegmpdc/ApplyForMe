'use client';

import { useState } from 'react';
import styles from '../privacy.module.css';

/** The "I have read and accept" tick. The server records it only for the version it is currently on. */
export function AcceptForm({ version }: { version: string }) {
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/privacy/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true, version }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Couldn’t save that. Try again.');
        setBusy(false);
        return;
      }
      window.location.href = '/runs';
    } catch {
      setError('Couldn’t save that. Try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <label className={styles.ack}>
        <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} required />
        <span>I have read and accept the privacy statement, including that my CV and the job ads are processed overseas by Cloudflare and Anthropic.</span>
      </label>
      <button type="submit" className={styles.button} disabled={!ticked || busy}>
        {busy ? 'Saving…' : 'Continue'}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
