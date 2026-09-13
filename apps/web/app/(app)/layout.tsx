import type { ReactNode } from 'react';
import { TopNav } from '@/components/layout/top-nav';
import styles from './layout.module.css';

/**
 * Shell for the tuning console: app name + top nav + a small env hint.
 * Single column, capped at 960px; the nav wraps on phones.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const envHint = process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV ?? 'dev';
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.name}>ApplyForMe</span>
          <span className={styles.hint} title="Build environment">
            {envHint}
          </span>
        </div>
        <TopNav />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
