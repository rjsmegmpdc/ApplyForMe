import { describe, expect, it } from 'vitest';
import { LINKEDIN_ALERT_HTML, LINKEDIN_ALERT_TEXT } from '../__fixtures__/linkedin-alert';
import { canonicalLinkedInUrl, extractLinkedInJobId, parseLinkedInAlert, parseLinkedInSubject } from './linkedin-email';
import { detectJobSource, listingKey, parseJobAlert, sourceLabel } from './job-source';
import { SEEK_ALERT_HTML } from '../__fixtures__/seek-alert';

describe('LinkedIn job links', () => {
  it('extracts ids from tracked and slugged URLs and canonicalises', () => {
    expect(extractLinkedInJobId('https://www.linkedin.com/comm/jobs/view/4123456789/?trackingId=x')).toBe('4123456789');
    expect(extractLinkedInJobId('https://nz.linkedin.com/jobs/view/head-of-tech-at-acme-4123456789')).toBe('4123456789');
    expect(canonicalLinkedInUrl('https://www.linkedin.com/comm/jobs/view/4123456789/?a=b')).toBe('https://www.linkedin.com/jobs/view/4123456789/');
    expect(extractLinkedInJobId('https://www.linkedin.com/comm/jobs/search/?trk=x')).toBeNull();
  });
});

describe('parseLinkedInAlert', () => {
  it('parses two jobs from the HTML fixture with company, location and canonical URLs', () => {
    const jobs = parseLinkedInAlert(LINKEDIN_ALERT_HTML, 'Fwd: Head of Technology Architecture at Auckland Council');
    expect(jobs.map((j) => j.url)).toEqual(['https://www.linkedin.com/jobs/view/4123456789/', 'https://www.linkedin.com/jobs/view/4987654321/']);
    expect(jobs[0]).toMatchObject({ title: 'Head of Technology Architecture', company: 'Auckland Council', location: 'Auckland, New Zealand' });
    expect(jobs[0].description).toMatch(/enterprise and solution architecture/);
    expect(jobs[1]).toMatchObject({ title: 'Head of Modern Workplace', company: 'Spark New Zealand', location: 'Wellington, New Zealand' });
  });

  it('parses the plain-text variant', () => {
    const jobs = parseLinkedInAlert(LINKEDIN_ALERT_TEXT);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ title: 'Head of Technology Architecture', company: 'Auckland Council', location: 'Auckland, New Zealand' });
    expect(jobs[1]).toMatchObject({ title: 'Head of Modern Workplace', company: 'Spark New Zealand' });
  });

  it('uses the subject as a hint for a single job with no card text', () => {
    const html = '<p><a href="https://www.linkedin.com/comm/jobs/view/4111111111/?x=1">View job</a></p>';
    const jobs = parseLinkedInAlert(html, 'Fwd: Head of Platforms at Fonterra');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].url).toBe('https://www.linkedin.com/jobs/view/4111111111/');
  });

  it('returns nothing for empty or link-free input', () => {
    expect(parseLinkedInAlert('')).toEqual([]);
    expect(parseLinkedInAlert('<p>See all jobs</p>')).toEqual([]);
  });

  it('is deterministic', () => {
    expect(parseLinkedInAlert(LINKEDIN_ALERT_HTML)).toEqual(parseLinkedInAlert(LINKEDIN_ALERT_HTML));
  });
});

describe('parseLinkedInSubject', () => {
  it('strips forward prefixes and splits title/company', () => {
    expect(parseLinkedInSubject('Fwd: Head of Technology Architecture at Auckland Council')).toEqual({ title: 'Head of Technology Architecture', company: 'Auckland Council' });
    expect(parseLinkedInSubject('Your job alert: 3 new jobs')).toBeNull();
  });
});

describe('job source detection and keys', () => {
  it('detects seek and linkedin alerts and rejects others', () => {
    expect(detectJobSource({ from: 'noreply@seek.co.nz', subject: 'JobMail', body: '' })).toBe('seek');
    expect(detectJobSource({ from: 'me@gmail.com', subject: 'Fwd: x', body: SEEK_ALERT_HTML })).toBe('seek');
    expect(detectJobSource({ from: 'me@gmail.com', subject: 'Fwd: x', body: LINKEDIN_ALERT_HTML })).toBe('linkedin');
    expect(detectJobSource({ from: 'news@example.com', subject: 'Weekly', body: '<p>hi</p>' })).toBeNull();
  });

  it('routes parsing by source and keys listings stably', () => {
    const li = parseJobAlert('linkedin', LINKEDIN_ALERT_HTML, 'Fwd: Head of Technology Architecture at Auckland Council');
    expect(listingKey(li[0])).toBe('linkedin:4123456789');
    expect(listingKey({ url: 'https://www.seek.co.nz/job/12345678' })).toBe('12345678');
    expect(listingKey({ url: '' })).toBeNull();
    expect(sourceLabel('linkedin')).toBe('LinkedIn');
  });
});
