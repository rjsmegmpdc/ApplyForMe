import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PrivacyRedirect } from '@/components/layout/privacy-redirect';
import './globals.css';

export const metadata: Metadata = {
  title: 'ApplyForMe',
  description: 'Tailored CV and cover letter for every Seek alert, ready to review.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PrivacyRedirect />
        {children}
      </body>
    </html>
  );
}
