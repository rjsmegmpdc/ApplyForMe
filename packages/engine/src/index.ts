/**
 * @applyforme/engine — pure TypeScript, zero I/O. Every module here is
 * deterministic: no fetch, no fs, no Date.now()/Math.random() in logic paths.
 * Time and randomness are injected as parameters when needed.
 *
 * Import only via this barrel from apps/web.
 */
export * from './types';
export * from './rules/trigger';
export * from './validate/claim-guard';
export * from './analyze/benefits';
export * from './analyze/job-analyzer';
export * from './parse/html-text';
export * from './parse/seek-email';
export * from './parse/seek-page';
export * from './salary/salary-data';
export * from './parse/linkedin-email';
export * from './parse/job-source';
