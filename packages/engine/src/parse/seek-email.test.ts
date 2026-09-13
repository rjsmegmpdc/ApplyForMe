import { describe, expect, it } from 'vitest';
import {
  SEEK_ALERT_HTML,
  SEEK_ALERT_JOB_IDS,
  SEEK_ALERT_TEXT,
  SEEK_BOILERPLATE_ONLY_HTML,
} from '../__fixtures__/seek-alert';
import { canonicalSeekUrl, extractSeekJobId, parseSeekAlert } from './seek-email';

const CANONICAL = SEEK_ALERT_JOB_IDS.map((id) => `https://www.seek.co.nz/job/${id}`);

describe('extractSeekJobId / canonicalSeekUrl', () => {
  it('reads the id through tracking params, fragments and sub-paths', () => {
    expect(extractSeekJobId('https://www.seek.co.nz/job/84120987?type=standard&ref=jobmail#sol=abc')).toBe('84120987');
    expect(extractSeekJobId('http://seek.co.nz/job/12345678/apply')).toBe('12345678');
    expect(extractSeekJobId('https://www.seek.co.nz/job/12345678?a=1&amp;b=2')).toBe('12345678');
    expect(canonicalSeekUrl('https://www.seek.co.nz/job/84120987?type=standard&ref=jobmail'))
      .toBe('https://www.seek.co.nz/job/84120987');
  });

  it('returns null for non-job Seek links and junk', () => {
    expect(extractSeekJobId('https://www.seek.co.nz/jobmail/manage?x=1')).toBeNull();
    expect(extractSeekJobId('https://www.seek.co.nz/job-search/head-of-it')).toBeNull();
    expect(extractSeekJobId('https://www.seek.com.au/job/12345678')).toBeNull();
    expect(extractSeekJobId('')).toBeNull();
    expect(canonicalSeekUrl('nonsense')).toBeNull();
  });
});

describe('parseSeekAlert (HTML)', () => {
  const jobs = parseSeekAlert(SEEK_ALERT_HTML);

  it('finds the three jobs with canonical, de-duplicated URLs', () => {
    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => j.url)).toEqual(CANONICAL);
    for (const j of jobs) expect(j.url).not.toMatch(/[?&#]/);
  });

  it('takes the title from the anchor text and the card lines for the rest', () => {
    expect(jobs[0]).toEqual({
      title: 'Head of Modern Workplace',
      company: 'Kiwi Energy Group',
      location: 'Auckland CBD, Auckland',
      salary: '$180,000 – $200,000 per year + KiwiSaver',
      description: [
        'Own the Microsoft 365, Intune and Windows 365 roadmap for 3,000+ staff',
        'Lead a team of 8 across endpoint, identity and collaboration',
        'Hybrid — 3 days in our Auckland office',
      ].join('\n'),
      url: CANONICAL[0],
    });
    expect(jobs[1].title).toBe('Head of Digital Workplace & AI Enablement');
    expect(jobs[1].company).toBe('Harbour Health Alliance');
    expect(jobs[1].location).toBe('North Shore, Auckland');
    expect(jobs[1].salary).toBe('Competitive salary + health insurance');
    expect(jobs[2].title).toBe('Technology Manager – End User Computing');
    expect(jobs[2].location).toBe('Remote');
    expect(jobs[2].salary).toBe('$150k - $170k pa');
  });

  it('keeps boilerplate, scripts and action links out of the fields', () => {
    const blob = JSON.stringify(jobs).toLowerCase();
    expect(blob).not.toContain('view job');
    expect(blob).not.toContain('posted');
    expect(blob).not.toContain('unsubscribe');
    expect(blob).not.toContain('privacy');
    expect(blob).not.toContain('should never appear');
    expect(blob).not.toContain('seek limited');
  });

  it('is deterministic', () => {
    expect(parseSeekAlert(SEEK_ALERT_HTML)).toEqual(jobs);
  });
});

describe('parseSeekAlert (plain text)', () => {
  it('parses the text/plain alternative to the same listings', () => {
    const text = parseSeekAlert(SEEK_ALERT_TEXT);
    expect(text).toHaveLength(3);
    expect(text).toEqual(parseSeekAlert(SEEK_ALERT_HTML));
  });

  it('handles the URL-before-block layout too', () => {
    const input = `Your JobMail alert

https://www.seek.co.nz/job/11111111?ref=jobmail
Platform Engineering Manager
Acme Cloud Ltd
Wellington Central, Wellington
$160,000 - $180,000 per annum
Lead our platform squad.

https://www.seek.co.nz/job/22222222?ref=jobmail
Head of IT
Beta Co
Hamilton Central, Waikato
Run a team of 12 across infrastructure and support.

Unsubscribe: https://www.seek.co.nz/jobmail/unsubscribe
`;
    const jobs = parseSeekAlert(input);
    expect(jobs.map((j) => j.url)).toEqual(['https://www.seek.co.nz/job/11111111', 'https://www.seek.co.nz/job/22222222']);
    expect(jobs[0]).toMatchObject({
      title: 'Platform Engineering Manager',
      company: 'Acme Cloud Ltd',
      location: 'Wellington Central, Wellington',
      salary: '$160,000 - $180,000 per annum',
      description: 'Lead our platform squad.',
    });
    expect(jobs[1]).toMatchObject({ title: 'Head of IT', company: 'Beta Co', location: 'Hamilton Central, Waikato', salary: '' });
  });

  it('merges repeated links for the same job', () => {
    const input = `Senior Product Owner
Kiwibank
Wellington
Own the payments backlog.
https://www.seek.co.nz/job/33333333?a=1
https://www.seek.co.nz/job/33333333?a=2
`;
    const jobs = parseSeekAlert(input);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].url).toBe('https://www.seek.co.nz/job/33333333');
    expect(jobs[0].title).toBe('Senior Product Owner');
  });
});

describe('parseSeekAlert (edge cases)', () => {
  it('returns [] for empty, whitespace and boilerplate-only input', () => {
    expect(parseSeekAlert('')).toEqual([]);
    expect(parseSeekAlert('   \n  ')).toEqual([]);
    expect(parseSeekAlert(SEEK_BOILERPLATE_ONLY_HTML)).toEqual([]);
    expect(parseSeekAlert('You are receiving this because you signed up for job alerts. Unsubscribe here.')).toEqual([]);
  });

  it('falls back to the v1 block pattern when there are no job links', () => {
    const input = `New jobs for you

Head of Technology Operations
Contoso New Zealand
Auckland, New Zealand
Lead the operations team across cloud and end-user computing.
`;
    const jobs = parseSeekAlert(input);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Head of Technology Operations',
      company: 'Contoso New Zealand',
      location: 'Auckland, New Zealand',
      url: '',
    });
    expect(jobs[0].description).toContain('Lead the operations team');
  });
});
