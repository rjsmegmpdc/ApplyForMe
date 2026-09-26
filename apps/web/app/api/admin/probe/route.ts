import { z } from 'zod';
import { extractJobAdMeta, extractJobAdText } from '@applyforme/engine';
import { getEnv } from '@/server/db';
import { apifyConfigFromEnv, fetchPageViaApify, type FetchedPage } from '@/server/fetch/apify';
import { fetchJobPage, looksLikeJobContent, resolveRedirectUrl } from '@/server/pipeline/inbound-handler';
import { isAdminRequest } from '@/server/admin-auth';
import { isHttpUrl } from '@/server/pipeline/run-url';

/**
 * POST /api/admin/probe — diagnostic: what does the Worker see for a URL?
 * No pipeline run, no LLM, no email. Bearer ADMIN_TOKEN like /api/admin/run-url.
 *   { url, mode: 'resolve' }  → follow redirects, report the final URL
 *   { url, mode: 'fetch' }    → GET like fetchJobPage would; report status/bytes/title
 *   { url, mode: 'apify' }    → force the Apify path
 */
export const runtime = 'nodejs';

const bodySchema = z.object({
  url: z.string().trim().min(8).max(2000),
  mode: z.enum(['resolve', 'fetch', 'apify']).default('fetch'),
});

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const auth = isAdminRequest(request, env);
  if (auth !== 'ok') return Response.json({ error: auth }, { status: auth === 'unauthorized' ? 401 : 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isHttpUrl(parsed.data.url)) return Response.json({ error: 'url (http/https) required' }, { status: 400 });
  const { url, mode } = parsed.data;
  const started = Date.now();

  if (mode === 'resolve') {
    const finalUrl = await resolveRedirectUrl(url);
    return Response.json({ mode, url, finalUrl, ms: Date.now() - started });
  }

  let page: FetchedPage | null;
  if (mode === 'apify') {
    const config = apifyConfigFromEnv(env);
    if (!config) return Response.json({ error: 'APIFY_TOKEN not configured' }, { status: 503 });
    page = await fetchPageViaApify(url, config, looksLikeJobContent);
  } else {
    page = await fetchJobPage(url, apifyConfigFromEnv(env));
  }
  if (!page) return Response.json({ mode, url, ok: false, ms: Date.now() - started });
  const { html, finalUrl } = page;
  const text = extractJobAdText(html);
  return Response.json({
    mode,
    url,
    finalUrl,
    ok: true,
    bytes: html.length,
    looksLikeJob: looksLikeJobContent(html),
    meta: extractJobAdMeta(html),
    textChars: text.length,
    textPreview: text.slice(0, 600),
    ms: Date.now() - started,
  });
}
