'use client';

import { useEffect } from 'react';
import { privacyRedirectTarget } from '@/lib/privacy-redirect';

/**
 * Mounted once from the root layout. Wraps window.fetch so any API answer of 403 {privacy: true}
 * (an open tab or installed app that predates the current privacy statement) sends the user to
 * /privacy/accept instead of leaving blank screens. Renders nothing.
 */
export function PrivacyRedirect() {
  useEffect(() => {
    const real = window.fetch;
    const wrapped: typeof window.fetch = async (...args) => {
      const res = await real(...args);
      if (res.status === 403 && (res.headers.get('content-type') ?? '').includes('application/json')) {
        const body: unknown = await res.clone().json().catch(() => null);
        const to = privacyRedirectTarget(res.status, body, window.location.pathname);
        if (to) window.location.assign(to);
      }
      return res;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = real;
    };
  }, []);
  return null;
}
