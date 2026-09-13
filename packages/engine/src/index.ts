/**
 * @applyforme/engine — pure TypeScript, zero I/O. Every module here is
 * deterministic: no fetch, no fs, no Date.now()/Math.random() in logic paths.
 * Time and randomness are injected as parameters when needed.
 *
 * Import only via this barrel from apps/web.
 */
export * from './types';
