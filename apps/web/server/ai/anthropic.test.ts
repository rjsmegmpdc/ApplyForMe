import { describe, it, expect } from 'vitest';
import { makeAnthropicGenerateFn, TAILOR_MODEL } from './anthropic';
import { tailoredOutputSchema } from './tailor';
import type { TailoredOutput } from '@applyforme/engine';

/**
 * Exercises the SDK seam against a stubbed HTTP layer: the request shape
 * we send (model, structured output format, cache breakpoint) and how the
 * three response shapes map to GenerateResult.
 */

const OUTPUT: TailoredOutput = {
  summary: 'Leader.',
  highlights: [{ role: 'PM', company: 'Acme', bullets: ['Did things.'] }],
  coverLetter: { paragraphs: ['Hello.'] },
};

function apiResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function message(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: TAILOR_MODEL,
    content: [{ type: 'text', text: JSON.stringify(OUTPUT) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
    ...overrides,
  };
}

function stubbedFetch(reply: Record<string, unknown>): { fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>; requests: Record<string, unknown>[] } {
  const requests: Record<string, unknown>[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return apiResponse(reply);
  };
  return { fetch, requests };
}

const REQUEST = {
  system: [
    { type: 'text' as const, text: 'rules' },
    { type: 'text' as const, text: 'facts', cache_control: { type: 'ephemeral' as const } },
  ],
  messages: [{ role: 'user' as const, content: 'job' }],
  schema: tailoredOutputSchema,
};

describe('makeAnthropicGenerateFn', () => {
  it('sends structured output via output_config.format, adaptive thinking, and the cache breakpoint; parses the reply and reads cache usage', async () => {
    const { fetch, requests } = stubbedFetch(message({}));
    const generate = makeAnthropicGenerateFn('sk-test', { fetch });
    const result = await generate(REQUEST);

    expect(result.parsed).toEqual(OUTPUT);
    expect(result.raw).toBe(JSON.stringify(OUTPUT));
    expect(result.usage).toEqual({ input: 1200, output: 300, cacheRead: 1000 });

    expect(requests).toHaveLength(1);
    const body = requests[0];
    expect(body.model).toBe(TAILOR_MODEL);
    expect(body.thinking).toEqual({ type: 'adaptive' });
    const outputConfig = body.output_config as { effort: string; format: { type: string; schema: Record<string, unknown> } };
    expect(outputConfig.effort).toBe('medium');
    expect(outputConfig.format.type).toBe('json_schema');
    expect(Object.keys(outputConfig.format.schema.properties as object)).toEqual(['summary', 'highlights', 'coverLetter']);
    expect(body).not.toHaveProperty('output_format');
    const system = body.system as { cache_control?: unknown }[];
    expect(system[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('treats a refusal as parsed: null while keeping usage', async () => {
    const { fetch } = stubbedFetch(message({ stop_reason: 'refusal', content: [] }));
    const result = await makeAnthropicGenerateFn('sk-test', { fetch })(REQUEST);
    expect(result.parsed).toBeNull();
    expect(result.usage.input).toBe(1200);
  });

  it('treats malformed / truncated JSON as parsed: null but returns the raw text', async () => {
    const { fetch } = stubbedFetch(message({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"summary": "cut off' }] }));
    const result = await makeAnthropicGenerateFn('sk-test', { fetch })(REQUEST);
    expect(result.parsed).toBeNull();
    expect(result.raw).toBe('{"summary": "cut off');
  });

  it('treats schema-invalid JSON as parsed: null', async () => {
    const { fetch } = stubbedFetch(message({ content: [{ type: 'text', text: JSON.stringify({ summary: 'x' }) }] }));
    const result = await makeAnthropicGenerateFn('sk-test', { fetch })(REQUEST);
    expect(result.parsed).toBeNull();
  });
});
