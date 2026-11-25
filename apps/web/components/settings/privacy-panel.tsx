'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DataItem, MyData } from '@/server/account-data';
import form from '@/components/ui/form.module.css';
import styles from './privacy-panel.module.css';

/**
 * Settings › Privacy (Matt, 2026-11-25): the statement link, "See and correct my data" (everything held, why,
 * Change/Remove in place where possible) and "Delete my account" (typed DELETE + confirm; owner refused).
 */
export function PrivacyPanel({ acceptedLabel, canDelete, blockers }: { acceptedLabel: string; canDelete: boolean; blockers: string[] }) {
  const dataRef = useRef<HTMLDialogElement>(null);
  const delRef = useRef<HTMLDialogElement>(null);
  // Each opening mounts a fresh view, so the dialog always shows what is held now.
  const [opened, setOpened] = useState(0);
  return (
    <>
      <p className={styles.line}>
        <Link href="/privacy" target="_blank" rel="noopener">
          Privacy statement
        </Link>{' '}
        · {acceptedLabel}
      </p>
      <div className={form.row}>
        <button type="button" className={form.btn} onClick={() => { setOpened((n) => n + 1); dataRef.current?.showModal(); }}>
          See and correct my data
        </button>
        <button type="button" className={`${form.btn} ${form.danger}`} onClick={() => delRef.current?.showModal()}>
          Delete my account
        </button>
      </div>
      <dialog ref={dataRef} className={styles.dialog} aria-labelledby="mydata-title">
        {opened > 0 && <MyDataView key={opened} onClose={() => dataRef.current?.close()} />}
      </dialog>
      <dialog ref={delRef} className={styles.dialog} aria-labelledby="delete-title">
        <DeleteAccount canDelete={canDelete} blockers={blockers} onClose={() => delRef.current?.close()} />
      </dialog>
    </>
  );
}

function MyDataView({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<MyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/account/data', { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as (MyData & { error?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.error ?? `Failed (${res.status})`);
        if (live) setData(body);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load your data.');
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function send(payload: object): Promise<string | null> {
    const res = await fetch('/api/account/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = (await res.json().catch(() => null)) as (MyData & { error?: string }) | null;
    if (!res.ok || !body) return body?.error ?? `Failed (${res.status})`;
    setData(body);
    return null;
  }

  return (
    <div className={styles.inner}>
      <div className={styles.head}>
        <h2 id="mydata-title" className={styles.title}>
          See and correct my data
        </h2>
        <button type="button" className={form.btn} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.sub}>
        Everything ApplyForMe holds about you, and why. <span className={styles.legend}>Highlighted</span> rows can be changed or removed here; the others say how.
      </p>
      {error && <p className={`${form.status} ${form.statusErr}`}>{error}</p>}
      {!data && !error && <p className={styles.sub}>Loading…</p>}
      {data?.groups.map((g) => (
        <section key={g.title} className={styles.group}>
          <h3 className={styles.groupTitle}>{g.title}</h3>
          <p className={styles.groupWhy}>{g.why}</p>
          <ul className={styles.items}>
            {g.items.map((it) => (
              <Item key={it.key} item={it} send={send} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Item({ item, send }: { item: DataItem; send: (p: object) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.edit?.current ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const changeable = Boolean(item.edit || item.remove);

  async function run(payload: object) {
    setBusy(true);
    setErr(null);
    const e = await send(payload);
    setBusy(false);
    if (e) setErr(e);
    else setEditing(false);
  }

  return (
    <li className={`${styles.item} ${changeable ? styles.changeable : ''}`}>
      <div className={styles.itemHead}>
        <span className={styles.label}>{item.label}</span>
        {changeable && !editing && (
          <span className={styles.actions}>
            {item.edit && (
              <button type="button" className={form.link} onClick={() => { setValue(item.edit!.current); setEditing(true); }}>
                Change
              </button>
            )}
            {item.remove && (
              <button
                type="button"
                className={form.link}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(item.remove!.confirm)) void run({ remove: { kind: item.remove!.kind, ...(item.remove!.id ? { id: item.remove!.id } : {}) } });
                }}
              >
                Remove
              </button>
            )}
          </span>
        )}
      </div>
      {editing && item.edit ? (
        <form
          className={styles.edit}
          onSubmit={(e) => {
            e.preventDefault();
            void run({ field: item.edit!.field, value, ...(item.edit!.profileId ? { profileId: item.edit!.profileId } : {}) });
          }}
        >
          <input className={form.input} type={item.edit.kind === 'email' ? 'email' : 'text'} value={value} onChange={(e) => setValue(e.target.value)} aria-label={item.label} autoFocus />
          <button type="submit" className={`${form.btn} ${form.primary}`} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={form.btn} onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </button>
        </form>
      ) : (
        <div className={styles.value}>{item.value}</div>
      )}
      <div className={styles.why}>
        <b>Why we hold it:</b> {item.why}
      </div>
      {item.how && <div className={styles.how}>{item.how}</div>}
      {err && <div className={`${form.status} ${form.statusErr}`}>{err}</div>}
    </li>
  );
}

function DeleteAccount({ canDelete, blockers, onClose }: { canDelete: boolean; blockers: string[]; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function del() {
    if (typed !== 'DELETE') return;
    if (!window.confirm('Delete your ApplyForMe account and everything in it now? This cannot be undone.')) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={styles.inner}>
        <h2 id="delete-title" className={styles.title}>
          Account deleted
        </h2>
        <p>Your account and everything in it have been deleted. You can close this tab. If you open ApplyForMe again, you will start as a new user.</p>
      </div>
    );
  }

  return (
    <div className={styles.inner}>
      <div className={styles.head}>
        <h2 id="delete-title" className={styles.title}>
          Delete my account
        </h2>
        <button type="button" className={form.btn} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.warning}>
        This deletes your account and <b>everything</b> in it: your profile and CV, rules, preferences and example documents, every job the app looked at with its tailored CV and
        cover letter files, your responses and your Anthropic key. Nothing is kept. If you come back later, it is like being a new user.
      </p>
      {canDelete ? (
        <>
          <label className={form.field}>
            <span>Type DELETE to confirm</span>
            <input className={form.input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Type DELETE to confirm" />
          </label>
          <button type="button" className={`${form.btn} ${form.danger}`} disabled={typed !== 'DELETE' || busy} onClick={() => void del()}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </>
      ) : (
        blockers.map((b) => (
          <p key={b} className={styles.sub}>
            {b}
          </p>
        ))
      )}
      {err && <p className={`${form.status} ${form.statusErr}`}>{err}</p>}
    </div>
  );
}
