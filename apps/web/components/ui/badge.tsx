import type { ReactNode } from 'react';
import type { Tone } from '@/lib/ui/format';
import styles from './badge.module.css';

/** Small colour-coded label. Tone maps to the globals.css tokens (--ok/--warn/--accent/--muted/--danger). */
export function Badge({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} title={title}>
      {children}
    </span>
  );
}
