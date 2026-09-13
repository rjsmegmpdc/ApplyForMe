/**
 * Shared fixtures for the pipeline tests (run-job, inbound-handler,
 * scheduled-handler): an in-memory db with the seeded user and the engine's
 * fixture profile, a fake CloudflareEnv, a capturing SendFn, and a
 * `PipelineDeps` builder whose model/page/clock are all injectable. Not a
 * test file itself — vitest only collects `*.test.ts`.
 */
import { FIXTURE_PROFILE } from '../../../../packages/engine/src/__fixtures__/profile';
import type { TailoredOutput } from '@applyforme/engine';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { createTestDb, seedUser } from '@/server/test/db';
import type { OutboundEmail, SendFn } from '@/server/email/send';
import type { GenerateFn } from '@/server/ai/anthropic';
import type { CreateRunInput } from '@/server/runs';
import type { Run } from '@/server/db/schema';
import type { PipelineDeps } from './run-job';

export const USER = schema.DEFAULT_USER_ID;

/** 2026-09-13 10:00 NZST (UTC+12) — a fixed "now" for every pipeline test. */
export const FIXED_NOW_MS = Date.UTC(2026, 8, 12, 22, 0, 0);

export function fakeEnv(overrides: Partial<CloudflareEnv> = {}): CloudflareEnv {
  return {
    DB: undefined as never,
    ASSETS: undefined as never,
    NEXT_INC_CACHE_R2_BUCKET: undefined as never,
    DOCS: undefined as never,
    WORKER_SELF_REFERENCE: undefined as never,
    EMAIL: undefined as never,
    APP_BASE_URL: 'https://app.test',
    EMAIL_FROM: 'jobs@test',
    ACTION_LINK_SECRET: 'secret',
    TOKENS_ENC_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    ...overrides,
  } as CloudflareEnv;
}

export async function setupDb(opts: { profile?: boolean } = {}): Promise<Db> {
  const { db } = createTestDb();
  await seedUser(db);
  if (opts.profile !== false) {
    await db.insert(schema.profiles).values({ userId: USER, name: 'Fixture', profileJson: FIXTURE_PROFILE, isDefault: true });
  }
  return db;
}

/** createRun cannot set timestamps (CreateRunInput omits them); tests that need a run "created at" a given instant insert directly. */
export async function insertRunAt(db: Db, input: CreateRunInput, at: Date): Promise<Run> {
  const [row] = await db.insert(schema.runs).values({ ...input, createdAt: at, updatedAt: at }).returning();
  return row;
}

export function capturingSend(): { send: SendFn; sent: OutboundEmail[] } {
  const sent: OutboundEmail[] = [];
  let n = 0;
  const send: SendFn = async (email) => {
    sent.push(email);
    n += 1;
    return { messageId: `test-${n}` };
  };
  return { send, sent };
}

/** A well-behaved model reply against the fixture profile: verbatim highlight, no numbers, no cert claims. */
export const VALID_OUTPUT: TailoredOutput = {
  summary:
    'AI and digital transformation leader with a governance-first approach to enterprise AI assistants, knowledge operating models and agent platforms. Strong security and risk background across Zero Trust and privileged access.',
  highlights: [
    {
      role: 'Product Manager – Modern Workplace',
      company: 'One NZ (formerly Vodafone NZ)',
      bullets: [
        'Led design and production rollout of a Teams-based AI support assistant built on Copilot Studio, anchored to curated internal knowledge sources with guardrails.',
        'Authored device management standards defining tiered access pathways (secure browser, MAM, MDM, PAW) for Zero Trust.',
      ],
    },
    {
      role: 'Customer eXperience Owner (CXO) – Cloud Enablement',
      company: 'ASB Bank',
      bullets: ['Governed Surface and Mac fleets (Intune + JAMF) and internal developer cloud SDKs.'],
    },
  ],
  coverLetter: {
    paragraphs: [
      'I am writing to apply for the Head of Modern Workplace role at Kiwi Energy Group.',
      'At One NZ I led the production rollout of a Copilot Studio assistant and authored the device standards that underpin our Zero Trust model.',
      'I would welcome the chance to discuss how I can help Kiwi Energy Group.',
    ],
  },
};

/** The same reply with one invented bullet — fails the claim guard (fabricated highlight, unknown year, untraceable number). */
export const FABRICATED_OUTPUT: TailoredOutput = {
  ...VALID_OUTPUT,
  highlights: [
    {
      ...VALID_OUTPUT.highlights[0],
      bullets: [...VALID_OUTPUT.highlights[0].bullets, 'Won the 1987 national chess championship against 500 players.'],
    },
    VALID_OUTPUT.highlights[1],
  ],
};

/** A GenerateFn that returns the given outputs in order (last one repeats) and records every request. */
export function scriptedGenerate(outputs: (TailoredOutput | null)[]): { generate: GenerateFn; calls: Parameters<GenerateFn>[0][] } {
  const calls: Parameters<GenerateFn>[0][] = [];
  const generate: GenerateFn = async (req) => {
    calls.push(req);
    const output = outputs[Math.min(calls.length - 1, outputs.length - 1)] ?? null;
    return { parsed: output, raw: output ? JSON.stringify(output) : '', usage: { input: 10, output: 5, cacheRead: 0 } };
  };
  return { generate, calls };
}

export interface FakeDepsOptions {
  db: Db;
  env?: CloudflareEnv;
  generate?: GenerateFn | null;
  fetchPage?: PipelineDeps['fetchPage'];
  now?: number;
}

export function fakeDeps(opts: FakeDepsOptions): { deps: PipelineDeps; sent: OutboundEmail[]; generateForCalls: number[] } {
  const { send, sent } = capturingSend();
  const generateForCalls: number[] = [];
  const deps: PipelineDeps = {
    db: opts.db,
    env: opts.env ?? fakeEnv(),
    send,
    fetchPage: opts.fetchPage ?? (async () => null),
    generateFor: async (userId) => {
      generateForCalls.push(userId);
      const generate = opts.generate === undefined ? null : opts.generate;
      return { generate, provider: generate ? 'fake' : 'none' };
    },
    now: () => opts.now ?? FIXED_NOW_MS,
  };
  return { deps, sent, generateForCalls };
}
