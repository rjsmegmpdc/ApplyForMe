/**
 * Claude client seam for the tailoring step. Wraps the official
 * `@anthropic-ai/sdk` (fetch-based, so it runs unchanged in workerd and
 * Node) behind a single `GenerateFn` shape that the pipeline depends on and
 * tests replace with a fake — nothing outside this file knows the SDK
 * exists.
 *
 * One request shape only: a system prompt as text blocks (the last one —
 * the profile fact sheet — carries a `cache_control` breakpoint, set by the
 * prompt builder, so the identical profile hits the prompt cache across
 * jobs), the conversation so far, and the Zod schema the reply must satisfy
 * (structured outputs via `output_config.format`). Adaptive thinking at
 * medium effort: the job is a careful rewrite, not a proof.
 *
 * Parsing deliberately goes through `messages.create` plus the format's
 * own `.parse` rather than `messages.parse`: the latter throws away the
 * whole response when the JSON is malformed or truncated, and the caller
 * needs `raw` + `usage` even then (a refusal or a bad reply is `parsed:
 * null`, never an exception — the pipeline falls back deterministically).
 *
 * The API key is passed in by the resolver (server/ai/resolve-generate.ts)
 * and never leaves this module.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod/v4';
import type { TailoredOutput } from '@applyforme/engine';

export const TAILOR_MODEL = 'claude-opus-5';
const MAX_TOKENS = 8000;

export interface TailorRequest {
  /** System prompt blocks, stable content first; the last block should carry the cache breakpoint. */
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  /** Zod (v4 API — `zod/v4`, shipped inside zod 3.25+) schema for the structured reply. */
  schema: z.ZodType<TailoredOutput>;
}

export interface GenerateUsage {
  input: number;
  output: number;
  /** Prompt-cache hits, in tokens — zero across repeated jobs means the fact sheet is not caching. */
  cacheRead: number;
}

export interface GenerateResult {
  /** Schema-valid output, or null on refusal / malformed JSON / truncation. */
  parsed: TailoredOutput | null;
  /** Concatenated text blocks, exactly as returned (fed back as the assistant turn in a repair pass). */
  raw: string;
  usage: GenerateUsage;
}

/** Function shape the pipeline depends on — tests inject a fake of this. */
export type GenerateFn = (req: TailorRequest) => Promise<GenerateResult>;

export function makeAnthropicGenerateFn(apiKey: string): GenerateFn {
  const client = new Anthropic({ apiKey });
  return async (req) => {
    const format = zodOutputFormat(req.schema);
    const response = await client.messages.create({
      model: TAILOR_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format },
      system: req.system,
      messages: req.messages,
    });

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let parsed: TailoredOutput | null = null;
    if (response.stop_reason !== 'refusal' && raw.length > 0) {
      try {
        parsed = format.parse(raw);
      } catch {
        parsed = null; // malformed or truncated JSON — the caller falls back
      }
    }

    return {
      parsed,
      raw,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  };
}
