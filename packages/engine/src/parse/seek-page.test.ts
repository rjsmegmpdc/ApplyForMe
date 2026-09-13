import { describe, expect, it } from 'vitest';
import { buildSeekJobPage } from '../__fixtures__/seek-job-page';
import {
  MAX_JOB_AD_CHARS,
  extractJobAdMeta,
  extractJobAdText,
  extractJsonLdJobPosting,
} from './seek-page';

const EXPECTED_LINES = [
  'About the role',
  'Kiwi Energy Group is looking for a Head of Modern Workplace to own our Microsoft 365, Intune and Windows 365 strategy across 3,000+ staff and 4,500 endpoints.',
  'Partner with Security on Zero Trust, privileged access management and endpoint security aligned to NIST & ISO',
  'Hybrid role — 3 days in our Auckland CBD office.',
];

describe('extractJobAdText', () => {
  it('uses the JSON-LD description when present', () => {
    const text = extractJobAdText(buildSeekJobPage());
    for (const line of EXPECTED_LINES) expect(text).toContain(line);
    expect(text).not.toContain('<');
    expect(text).not.toContain('&amp;');
    expect(text).not.toContain('SCRIPT_CONTENT_MUST_NOT_APPEAR');
    expect(text).not.toContain('Similar jobs');
  });

  it('falls back to the jobAdDetails container, including nested divs', () => {
    const text = extractJobAdText(buildSeekJobPage({ jsonLd: false }));
    for (const line of EXPECTED_LINES) expect(text).toContain(line);
    expect(text).not.toContain('SCRIPT_CONTENT_MUST_NOT_APPEAR');
    expect(text).not.toContain('Similar jobs');
    expect(text).not.toContain('Career advice');
  });

  it('both paths yield the same description text', () => {
    expect(extractJobAdText(buildSeekJobPage({ jsonLd: false }))).toBe(extractJobAdText(buildSeekJobPage()));
  });

  it('falls back to the stripped body when neither structure exists', () => {
    const text = extractJobAdText(buildSeekJobPage({ jsonLd: false, jobAdDetails: false }));
    expect(text).toContain('Head of Modern Workplace');
    expect(text).toContain('Kiwi Energy Group');
    expect(text).not.toContain('SCRIPT_CONTENT_MUST_NOT_APPEAR');
    expect(text).not.toContain('.hidden{display:none}');
  });

  it('collapses whitespace and preserves block structure as newlines', () => {
    const text = extractJobAdText('<div data-automation="jobAdDetails"><p>One   two</p><ul><li>a</li><li>b</li></ul></div>');
    expect(text).toBe('One two\n\na\nb');
  });

  it('caps very long ads', () => {
    const huge = `<div data-automation="jobAdDetails">${'<p>lorem ipsum dolor sit amet</p>'.repeat(2000)}</div>`;
    expect(extractJobAdText(huge).length).toBeLessThanOrEqual(MAX_JOB_AD_CHARS);
  });

  it('returns empty for empty input', () => {
    expect(extractJobAdText('')).toBe('');
    expect(extractJobAdText('   ')).toBe('');
  });
});

describe('extractJobAdMeta', () => {
  it('prefers JSON-LD and formats the salary from baseSalary', () => {
    expect(extractJobAdMeta(buildSeekJobPage())).toEqual({
      title: 'Head of Modern Workplace',
      company: 'Kiwi Energy Group',
      location: 'Auckland CBD, Auckland',
      salary: 'NZD 180,000 – 200,000 per year',
    });
  });

  it('reads data-automation elements when there is no JSON-LD', () => {
    expect(extractJobAdMeta(buildSeekJobPage({ jsonLd: false }))).toEqual({
      title: 'Head of Modern Workplace',
      company: 'Kiwi Energy Group',
      location: 'Auckland CBD, Auckland',
      salary: '$180,000 – $200,000 per year + KiwiSaver',
    });
  });

  it('falls back to the <title> and omits unknown fields', () => {
    const html = '<html><head><title>Data Engineer Job in Wellington - SEEK</title></head><body><p>hi</p></body></html>';
    expect(extractJobAdMeta(html)).toEqual({ title: 'Data Engineer' });
    expect(extractJobAdMeta('')).toEqual({});
  });
});

describe('extractJsonLdJobPosting', () => {
  it('finds a JobPosting inside an @graph and tolerates a broken block first', () => {
    const html = `
      <script type="application/ld+json">{not json</script>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
        {"@type":"WebPage","name":"x"},
        {"@type":["JobPosting"],"title":"Cloud Architect","description":"<p>Design &amp; build.</p>",
         "hiringOrganization":{"@type":"Organization","name":"Contoso"},
         "jobLocation":[{"@type":"Place","address":{"addressLocality":"Wellington","addressRegion":"Wellington"}}],
         "baseSalary":{"@type":"MonetaryAmount","currency":"NZD","value":{"value":150000,"unitText":"YEAR"}}}
      ]}</script>`;
    expect(extractJsonLdJobPosting(html)).toEqual({
      title: 'Cloud Architect',
      description: 'Design & build.',
      company: 'Contoso',
      location: 'Wellington',
      salary: 'NZD 150,000 per year',
    });
  });

  it('returns null when there is no JobPosting', () => {
    expect(extractJsonLdJobPosting('<script type="application/ld+json">{"@type":"Organization"}</script>')).toBeNull();
    expect(extractJsonLdJobPosting('<p>nothing</p>')).toBeNull();
  });
});
