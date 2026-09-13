'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './top-nav.module.css';

const ITEMS = [
  { href: '/runs', label: 'Runs' },
  { href: '/profile', label: 'Profile' },
  { href: '/rules', label: 'Rules' },
  { href: '/preferences', label: 'Preferences' },
  { href: '/settings', label: 'Settings' },
] as const;

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Sections">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className={active ? styles.active : styles.link} aria-current={active ? 'page' : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
