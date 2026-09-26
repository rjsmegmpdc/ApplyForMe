import { describe, expect, it, vi } from 'vitest';
import { extractJobAdMeta, extractJobAdText } from '@applyforme/engine';
import {
  apifyConfigFromEnv,
  buildActorInput,
  DEFAULT_APIFY_ACTOR,
  DEFAULT_APIFY_INPUT,
  fetchPageViaApify,
  jobItemFromDataset,
  jobItemToHtml,
  normaliseActor,
  pageFromDataset,
  runSyncUrl,
  type ApifyConfig,
} from './apify';
import { fetchJobPage, looksLikeJobContent } from '@/server/pipeline/inbound-handler';
import { SEEK_JOB_PAGE_HTML as SEEK_JOB_PAGE } from '../../../../packages/engine/src/__fixtures__/seek-job-page';

const LI_URL = 'https://www.linkedin.com/jobs/view/4460776154/';
const TRACKED = 'https://email.s.seek.co.nz/uni/ss/c/u001.abc/4u8/xyz/h47/h001.def';
const CONFIG: ApifyConfig = { token: 'apify_tok', actor: 'apify~cheerio-scraper', inputTemplate: DEFAULT_APIFY_INPUT, timeoutSeconds: 120 };
const DESCRIPTION = 'About the role\nLead the technology function across platforms, delivery and architecture. ' +
  'You will own the roadmap, the vendor relationships and a team of 40 engineers.\n\nWhat you bring\n- 10+ years leading technology teams\n- Experience with cloud and data platforms';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('apifyConfigFromEnv', () => {
  it('is null without a token (fallback inert)', () => {
    expect(apifyConfigFromEnv({})).toBeNull();
    expect(apifyConfigFromEnv({ APIFY_TOKEN: '  ', APIFY_ACTOR: 'x~y' })).toBeNull();
  });
  it('defaults to cheerio-scraper with the page-function input, accepts store-URL actor form', () => {
    const c = apifyConfigFromEnv({ APIFY_TOKEN: 't' })!;
    expect(c.actor).toBe(DEFAULT_APIFY_ACTOR);
    expect(c.inputTemplate).toBe(DEFAULT_APIFY_INPUT);
    const input = buildActorInput(c.inputTemplate, TRACKED) as { startUrls: { url: string }[]; pageFunction: string; proxyConfiguration: { useApifyProxy: boolean } };
    expect(input.startUrls).toEqual([{ url: TRACKED }]);
    expect(input.pageFunction).toContain('loadedUrl');
    expect(input.proxyConfiguration.useApifyProxy).toBe(true);
    expect(apifyConfigFromEnv({ APIFY_TOKEN: 't', APIFY_ACTOR: 'https://apify.com/some/actor/' })!.actor).toBe('some~actor');
    expect(normaliseActor('some/actor')).toBe('some~actor');
  });
});

describe('buildActorInput', () => {
  it('substitutes {{url}} and {{id}} (LinkedIn or Seek id) and JSON-escapes them', () => {
    expect(buildActorInput('{"urls":["{{url}}"],"ids":["{{ id }}"]}', LI_URL)).toEqual({ urls: [LI_URL], ids: ['4460776154'] });
    expect(buildActorInput('{"id":"{{id}}"}', 'https://www.seek.co.nz/job/84131244')).toEqual({ id: '84131244' });
    expect(buildActorInput('{"u":"{{url}}"}', 'https://x.test/?q="a"')).toEqual({ u: 'https://x.test/?q="a"' });
  });
  it('falls back to the default input when the template is not JSON', () => {
    expect((buildActorInput('{not json', LI_URL) as { startUrls: unknown }).startUrls).toEqual([{ url: LI_URL }]);
  });
  it('builds the run-sync URL with the timeout', () => {
    expect(runSyncUrl(CONFIG)).toBe('https://api.apify.com/v2/acts/apify~cheerio-scraper/run-sync-get-dataset-items?timeout=120&clean=true');
  });
});

describe('pageFromDataset', () => {
  it('a raw-HTML item (generic scraper) is used as-is, with its loaded URL', () => {
    const page = pageFromDataset([{ url: TRACKED, loadedUrl: 'https://www.seek.co.nz/job/84131244?tracking=x', html: SEEK_JOB_PAGE }], looksLikeJobContent)!;
    expect(page.html).toBe(SEEK_JOB_PAGE);
    expect(page.finalUrl).toBe('https://www.seek.co.nz/job/84131244?tracking=x');
    expect(extractJobAdMeta(page.html).title).toBeTruthy();
  });
  it('an HTML item that is a block/authwall page is rejected', () => {
    expect(pageFromDataset([{ html: '<html><body>Access denied — checkpoint/challenge</body></html>' }], looksLikeJobContent)).toBeNull();
  });
  it('a job-detail item is mapped heuristically into a JSON-LD page', () => {
    const page = pageFromDataset([{ title: 'Head of Technology', companyName: 'Acme NZ', location: 'Auckland', descriptionText: DESCRIPTION, link: LI_URL }], looksLikeJobContent)!;
    expect(page.finalUrl).toBe(LI_URL);
    expect(extractJobAdMeta(page.html)).toMatchObject({ title: 'Head of Technology', company: 'Acme NZ', location: 'Auckland' });
    expect(extractJobAdText(page.html)).toBe(DESCRIPTION);
  });
});

describe('jobItemFromDataset', () => {
  it('maps heuristic keys and picks the longest description field', () => {
    const job = jobItemFromDataset([
      {
        title: 'Head of Technology',
        companyName: 'Acme NZ',
        location: 'Auckland, New Zealand',
        salaryInfo: ['$220k – $250k'],
        descriptionText: DESCRIPTION,
        descriptionHtml: `<p>${DESCRIPTION.replace(/\n/g, '<br>')}</p><p>Extra paragraph to make this longer.</p>`,
        link: LI_URL,
      },
    ])!;
    expect(job.title).toBe('Head of Technology');
    expect(job.company).toBe('Acme NZ');
    expect(job.location).toBe('Auckland, New Zealand');
    expect(job.salary).toBe('$220k – $250k');
    expect(job.description).toContain('Extra paragraph');
    expect(job.url).toBe(LI_URL);
  });
  it('reads nested company objects and skips items without a real description', () => {
    expect(jobItemFromDataset([{ title: 'x', description: 'short' }])).toBeNull();
    expect(jobItemFromDataset({ not: 'array' })).toBeNull();
    const job = jobItemFromDataset([{ error: 'not found' }, { jobTitle: 'CTO', company: { name: 'Beta' }, jobDescription: DESCRIPTION }])!;
    expect(job.title).toBe('CTO');
    expect(job.company).toBe('Beta');
  });
});

describe('jobItemToHtml → engine parser', () => {
  it('plain-text description round-trips through extractJobAdText with paragraphs intact', () => {
    const html = jobItemToHtml({ title: 'Head of Technology', company: 'Acme NZ', location: 'Auckland', salary: '$220k', description: DESCRIPTION, url: LI_URL });
    expect(extractJobAdText(html)).toBe(DESCRIPTION);
    expect(extractJobAdMeta(html)).toEqual({ title: 'Head of Technology', company: 'Acme NZ', location: 'Auckland', salary: '$220k' });
  });
  it('HTML descriptions are passed through, and </script> inside cannot break the block', () => {
    const html = jobItemToHtml({ title: 'T', description: '<p>Alpha role</p><script>x</script><ul><li>one</li><li>two</li></ul>' });
    const text = extractJobAdText(html);
    expect(text).toContain('Alpha role');
    expect(text).toContain('one');
    expect(text).not.toContain('x');
    expect(extractJobAdMeta(html).title).toBe('T');
  });
});

describe('fetchPageViaApify', () => {
  it('POSTs the actor input with a bearer token and returns the page', async () => {
    const calls: { input: string; init?: RequestInit }[] = [];
    const fetchImpl = async (input: string, init?: RequestInit) => {
      calls.push({ input, init });
      return jsonResponse([{ url: TRACKED, loadedUrl: 'https://www.seek.co.nz/job/84131244', html: SEEK_JOB_PAGE }]);
    };
    const page = await fetchPageViaApify(TRACKED, CONFIG, looksLikeJobContent, fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe(runSyncUrl(CONFIG));
    expect(calls[0].init?.method).toBe('POST');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer apify_tok');
    expect((JSON.parse(calls[0].init?.body as string) as { startUrls: unknown }).startUrls).toEqual([{ url: TRACKED }]);
    expect(page).toEqual({ html: SEEK_JOB_PAGE, finalUrl: 'https://www.seek.co.nz/job/84131244' });
  });
  it('null on HTTP error, non-JSON, empty dataset, or a thrown fetch', async () => {
    expect(await fetchPageViaApify(LI_URL, CONFIG, looksLikeJobContent, async () => jsonResponse({ error: 'bad token' }, 401))).toBeNull();
    expect(await fetchPageViaApify(LI_URL, CONFIG, looksLikeJobContent, async () => jsonResponse('<html>'))).toBeNull();
    expect(await fetchPageViaApify(LI_URL, CONFIG, looksLikeJobContent, async () => jsonResponse([]))).toBeNull();
    expect(await fetchPageViaApify(LI_URL, CONFIG, looksLikeJobContent, async () => { throw new Error('boom'); })).toBeNull();
  });
});

describe('fetchJobPage fallback order', () => {
  it('direct reads blocked → Apify; tracked Seek link resolves to the canonical page; no config → null', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const u = String(input);
      seen.push(u);
      if (u.startsWith('https://api.apify.com/')) {
        const target = (JSON.parse(init?.body as string) as { startUrls: { url: string }[] }).startUrls[0].url;
        if (target.includes('linkedin.com/jobs/view/')) return jsonResponse([{ title: 'Via Apify', descriptionText: DESCRIPTION }]);
        return jsonResponse([{ url: target, loadedUrl: 'https://www.seek.co.nz/job/84131244', html: SEEK_JOB_PAGE }]);
      }
      return new Response('blocked', { status: u.includes('seek') ? 403 : 429 });
    });
    try {
      const li = await fetchJobPage(LI_URL, CONFIG);
      expect(extractJobAdMeta(li!.html).title).toBe('Via Apify');
      expect(seen.filter((u) => u.includes('linkedin.com'))).toHaveLength(2);
      expect(seen.filter((u) => u.startsWith('https://api.apify.com/'))).toHaveLength(1);

      seen.length = 0;
      const seek = await fetchJobPage(TRACKED, CONFIG);
      expect(seek).toEqual({ html: SEEK_JOB_PAGE, finalUrl: 'https://www.seek.co.nz/job/84131244' });
      expect(seen).toEqual([TRACKED, runSyncUrl(CONFIG)]);

      seen.length = 0;
      expect(await fetchJobPage(LI_URL, null)).toBeNull();
      expect(seen.some((u) => u.startsWith('https://api.apify.com/'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
