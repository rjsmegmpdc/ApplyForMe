'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatNz, ORIGIN_TONE, STATUS_TONE } from '@/lib/ui/format';
import {
  dayLabel,
  dayOptions,
  filterByDay,
  nextSort,
  sortRows,
  statsByDay,
  type DayStats,
  type RunRow,
  type RunSortKey,
  type SortDir,
} from '@/lib/ui/runs-table';
import styles from '@/app/(app)/runs/runs.module.css';

/**
 * Runs page body: per-day stats (click a day to filter) and the runs table.
 * Every column header sorts (click again to reverse), a day filter narrows
 * both the table and the highlighted stats row, and the Submitted checkbox
 * saves immediately (optimistic, reverted on error).
 */

type StatsSortKey = keyof DayStats;

const RUN_COLUMNS: { key: RunSortKey; label: string; num?: boolean }[] = [
  { key: 'createdAt', label: 'Created' },
  { key: 'jobTitle', label: 'Job' },
  { key: 'company', label: 'Company' },
  { key: 'location', label: 'Location' },
  { key: 'match', label: 'Match', num: true },
  { key: 'status', label: 'Status' },
  { key: 'origin', label: 'Origin' },
  { key: 'submitted', label: 'Submitted' },
];
const RUN_TEXT_KEYS: RunSortKey[] = ['jobTitle', 'company', 'location', 'status', 'origin'];

const STATS_COLUMNS: { key: StatsSortKey; label: string; title?: string }[] = [
  { key: 'day', label: 'Run day' },
  { key: 'runs', label: 'Runs' },
  { key: 'emailed', label: 'Emailed', title: 'Packs emailed (sent, applied, rejected or regenerating)' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'failed', label: 'Failed' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'avgMatch', label: 'Avg match' },
  { key: 'topMatch', label: 'Top match' },
  { key: 'live', label: 'Live', title: 'Emailed packs tailored by Claude first time' },
  { key: 'repaired', label: 'Repaired', title: 'Claude output that needed one fact-check repair' },
  { key: 'fallback', label: 'Fallback', title: 'Deterministic documents (no model, or the model failed the fact check)' },
];

function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  num,
  title,
}: {
  label: string;
  column: K;
  sort: { key: K; dir: SortDir };
  onSort: (k: K) => void;
  num?: boolean;
  title?: string;
}) {
  const active = sort.key === column;
  return (
    <th className={num ? styles.num : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={title}>
      <button type="button" className={`${styles.sortBtn} ${active ? styles.sortActive : ''}`} onClick={() => onSort(column)}>
        {label}
        <span className={styles.sortArrow} aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

function pct(n: number | null) {
  return n == null ? <span className={styles.muted}>—</span> : `${n}%`;
}

function count(n: number) {
  return n === 0 ? <span className={styles.muted}>0</span> : n;
}

export function RunsDashboard({ initialRows }: { initialRows: RunRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [day, setDay] = useState<string | null>(null);
  const [runSort, setRunSort] = useState<{ key: RunSortKey; dir: SortDir }>({ key: 'createdAt', dir: 'desc' });
  const [statsSort, setStatsSort] = useState<{ key: StatsSortKey; dir: SortDir }>({ key: 'day', dir: 'desc' });
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => dayOptions(rows), [rows]);
  const stats = useMemo(() => statsByDay(rows), [rows]);
  const sortedStats = useMemo(() => sortRows(stats.days, statsSort.key, statsSort.dir), [stats, statsSort]);
  const visible = useMemo(() => sortRows(filterByDay(rows, day), runSort.key, runSort.dir), [rows, day, runSort]);

  async function toggleSubmitted(id: number, submitted: boolean) {
    setError(null);
    setSaving((s) => new Set(s).add(id));
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, submitted, status: !submitted && r.status === 'applied' ? 'sent' : r.status } : r)));
    try {
      const res = await fetch(`/api/runs/${id}/submitted`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submitted }),
      });
      const data = (await res.json().catch(() => ({}))) as { submitted?: boolean; status?: RunRow['status']; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, submitted: Boolean(data.submitted), status: data.status ?? r.status } : r)));
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, submitted: !submitted } : r)));
      setError(`Run ${id}: ${e instanceof Error ? e.message : 'save failed'}`);
    } finally {
      setSaving((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <>
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Stats by run day</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {STATS_COLUMNS.map((c) => (
                  <SortHeader
                    key={c.key}
                    label={c.label}
                    column={c.key}
                    sort={statsSort}
                    onSort={(k) => setStatsSort((s) => nextSort(s, k))}
                    num={c.key !== 'day'}
                    title={c.title}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((s) => (
                <tr key={s.day} className={day === s.day ? styles.selectedRow : undefined}>
                  <td className={styles.nowrap}>
                    <button type="button" className={styles.linkBtn} onClick={() => setDay(day === s.day ? null : s.day)} title="Filter the runs table to this day">
                      {dayLabel(s.day)}
                    </button>
                  </td>
                  <td className={styles.num}>{s.runs}</td>
                  <td className={styles.num}>{count(s.emailed)}</td>
                  <td className={styles.num}>{count(s.skipped)}</td>
                  <td className={styles.num}>{count(s.failed)}</td>
                  <td className={styles.num}>{count(s.submitted)}</td>
                  <td className={styles.num}>{pct(s.avgMatch)}</td>
                  <td className={styles.num}>{pct(s.topMatch)}</td>
                  <td className={styles.num}>{count(s.live)}</td>
                  <td className={styles.num}>{count(s.repaired)}</td>
                  <td className={styles.num}>{count(s.fallback)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={styles.totalRow}>
                <td>All days</td>
                <td className={styles.num}>{stats.total.runs}</td>
                <td className={styles.num}>{stats.total.emailed}</td>
                <td className={styles.num}>{stats.total.skipped}</td>
                <td className={styles.num}>{stats.total.failed}</td>
                <td className={styles.num}>{stats.total.submitted}</td>
                <td className={styles.num}>{pct(stats.total.avgMatch)}</td>
                <td className={styles.num}>{pct(stats.total.topMatch)}</td>
                <td className={styles.num}>{stats.total.live}</td>
                <td className={styles.num}>{stats.total.repaired}</td>
                <td className={styles.num}>{stats.total.fallback}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.toolbar}>
          <h2 className={styles.blockTitle}>Runs</h2>
          <label className={styles.filter}>
            Run day
            <select value={day ?? ''} onChange={(e) => setDay(e.target.value || null)}>
              <option value="">All days ({rows.length})</option>
              {options.map((o) => (
                <option key={o.day} value={o.day}>
                  {o.label} ({o.count})
                </option>
              ))}
            </select>
          </label>
          {day ? (
            <button type="button" className={styles.linkBtn} onClick={() => setDay(null)}>
              Clear filter
            </button>
          ) : null}
          <span className={styles.muted}>
            {visible.length} of {rows.length} shown
          </span>
          {error ? <span className={styles.error}>{error}</span> : null}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {RUN_COLUMNS.map((c) => (
                  <SortHeader key={c.key} label={c.label} column={c.key} sort={runSort} onSort={(k) => setRunSort((s) => nextSort(s, k, RUN_TEXT_KEYS))} num={c.num} />
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((run) => (
                <tr key={run.id} className={run.submitted ? styles.submittedRow : undefined}>
                  <td className={styles.nowrap}>{formatNz(run.createdAt)}</td>
                  <td>
                    <a href={run.jobUrl} target="_blank" rel="noopener noreferrer">
                      {run.jobTitle}
                    </a>
                  </td>
                  <td>{run.company ?? <span className={styles.muted}>—</span>}</td>
                  <td>{run.location ?? <span className={styles.muted}>—</span>}</td>
                  <td className={styles.num}>{pct(run.match)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
                  </td>
                  <td>{run.origin ? <Badge tone={ORIGIN_TONE[run.origin] ?? 'muted'}>{run.origin}</Badge> : <span className={styles.muted}>—</span>}</td>
                  <td className={styles.center}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={run.submitted}
                      disabled={saving.has(run.id)}
                      onChange={(e) => toggleSubmitted(run.id, e.target.checked)}
                      aria-label={`Submitted: ${run.jobTitle}`}
                    />
                  </td>
                  <td className={styles.nowrap}>
                    <Link href={`/runs/${run.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
