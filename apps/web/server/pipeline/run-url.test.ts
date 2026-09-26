import { describe, expect, it } from 'vitest';
import { schema } from '@/server/db';
import { isHttpUrl, listingFromUrl, parseRunUrlBody, runJobUrl } from './run-url';
import { VALID_OUTPUT, fakeDeps, scriptedGenerate, setupDb } from './test-support';

describe('run-url', () => {
  it('validates URLs', () => {
    expect(isHttpUrl('https://www.linkedin.com/jobs/view/4460776154/')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('builds a listing from a URL plus pasted text and runs it through the pipeline when the page cannot be fetched', async () => {
    const db = await setupDb();
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: async () => null });
    const text = 'Role: Head of Technology Architecture\nCompany: Auckland Council\nLead enterprise architecture, cloud, security and governance across council digital services with Azure, M365 and Copilot.';
    const listing = listingFromUrl('https://www.linkedin.com/jobs/view/4460776154/', text);
    expect(listing.title).toMatch(/Head of Technology Architecture/);
    const result = await runJobUrl(deps, { userId: 1, url: 'https://www.linkedin.com/jobs/view/4460776154/', text });
    expect(result.source).toBe('linkedin');
    expect(['sent', 'skipped']).toContain(result.status);
    const run = await db.query.runs.findFirst();
    expect(run?.seekJobId).toBe('linkedin:4460776154');
    expect(run?.jobTextSource).toBe('alert-snippet');
    if (result.status === 'sent') expect(sent[0].text).toMatch(/Apply on LinkedIn/);
  });

  it('a second run of the same URL is a duplicate skip', async () => {
    const db = await setupDb();
    const { deps } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: async () => null });
    await runJobUrl(deps, { userId: 1, url: 'https://www.seek.co.nz/job/99887766', text: 'Head of Modern Workplace at Acme. M365, Intune, Copilot, governance.' });
    const again = await runJobUrl(deps, { userId: 1, url: 'https://www.seek.co.nz/job/99887766', text: 'x' });
    expect(again).toMatchObject({ status: 'skipped', reason: 'duplicate' });
    expect((await db.select().from(schema.runs)).length).toBe(1);
  });
});

describe('parseRunUrlBody / explicit fields', () => {
  it('accepts optional title/company/location/salary and rejects bad urls', async () => {
    expect(parseRunUrlBody({ url: 'ftp://x' })).toBeNull();
    expect(parseRunUrlBody({ url: 'https://www.seek.co.nz/job/1', title: ' Head of Product ', company: 'Acme' })).toMatchObject({ title: 'Head of Product', company: 'Acme' });
    const listing = listingFromUrl('https://email.s.seek.co.nz/uni/ss/c/abc', 'Head of Product\nAcme\nAuckland\n\nOwn the roadmap.', { title: 'Head of Product', company: 'Acme', location: 'Auckland CBD', salary: '$200k' });
    expect(listing).toMatchObject({ title: 'Head of Product', company: 'Acme', location: 'Auckland CBD', salary: '$200k' });
    expect(listing.description).toContain('Own the roadmap');
  });

  it('explicit fields flow into the run row when the tracked link cannot be resolved or fetched', async () => {
    const db = await setupDb();
    const { deps } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate, fetchPage: async () => null });
    const url = 'https://email.s.seek.co.nz/uni/ss/c/abc/h001.z';
    const result = await runJobUrl(deps, { userId: 1, url, text: 'Lead the platform and a team of 40 across cloud, data and security.', title: 'Head of Technology', company: 'Acme NZ', location: 'Auckland' });
    const run = await db.query.runs.findFirst();
    expect(run?.jobTitle).toBe('Head of Technology');
    expect(run?.company).toBe('Acme NZ');
    expect(run?.seekJobId).toBe('nolink:head of technology|acme nz');
    expect(['sent', 'skipped']).toContain(result.status);
  });
});
