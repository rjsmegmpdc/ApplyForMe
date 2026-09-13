import type { ReactNode } from 'react';
import styles from './section.module.css';

/** Page title row with an optional right-hand slot. */
export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className={styles.titleRow}>
      <h1 className={styles.title}>{children}</h1>
      {aside && <div className={styles.aside}>{aside}</div>}
    </div>
  );
}

/** Card-like section with a label. */
export function Section({ label, children, description }: { label: string; children: ReactNode; description?: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.label}>{label}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </section>
  );
}

/** Muted explanatory note. */
export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

export function SessionExpired() {
  return (
    <Section label="Session expired">
      <p>Cloudflare Access did not accept this request. Reload the page to sign in again.</p>
    </Section>
  );
}
