import { describe, expect, it } from 'vitest';
import { SEEK_RECOMMENDATION_HTML, SEEK_RECOMMENDATION_TEXT } from '../__fixtures__/seek-recommendation';
import { isSeekLink, parseSeekAlert } from './seek-email';
import { detectJobSource, listingKey, parseJobAlert } from './job-source';

describe('Seek recommendation email (whole-card tracked links, no job ids)', () => {
  it('parses all 12 cards from the HTML with title, company, location, salary and bullets', () => {
    const jobs = parseSeekAlert(SEEK_RECOMMENDATION_HTML);
    expect(jobs).toHaveLength(12);
    expect(jobs[0]).toMatchObject({
      title: 'Head of Technology Engineering',
      company: 'Auckland Council',
      location: 'Auckland CBD, Auckland',
      salary: 'Salary + 3.5% Kiwisaver + benefits',
    });
    expect(jobs[0].description).toMatch(/Lead enterprise engineering across cloud, infrastructure and DevOps/);
    expect(jobs[0].url).toMatch(/^https:\/\/email\.s\.seek\.co\.nz\//);
    expect(jobs[1]).toMatchObject({ title: 'Senior Data Project Manager', company: 'Tribe (New Zealand) Limited', location: 'Auckland CBD, Auckland (Hybrid)' });
    expect(jobs[5]).toMatchObject({ title: 'Chief Product and Technology Officer', company: 'Find IT Recruitment', salary: 'Competitive market' });
    expect(jobs.map((j) => j.title)).toContain('Product Manager - Consumer');
    // The badge and "Recently posted" lines never leak into fields.
    expect(jobs.some((j) => /strong applicant|recently posted/i.test(`${j.company} ${j.location} ${j.salary} ${j.description}`))).toBe(false);
    // "View more jobs" is not a card.
    expect(jobs.some((j) => /view more/i.test(j.title))).toBe(false);
  });

  it('parses the plain-text twin', () => {
    const jobs = parseSeekAlert(SEEK_RECOMMENDATION_TEXT);
    expect(jobs.length).toBeGreaterThanOrEqual(11);
    expect(jobs[0]).toMatchObject({ title: 'Head of Technology Engineering', company: 'Auckland Council', location: 'Auckland CBD, Auckland' });
  });

  it('tracked links are Seek links without a job id; keys are null until the redirect is resolved', () => {
    const jobs = parseSeekAlert(SEEK_RECOMMENDATION_HTML);
    expect(isSeekLink(jobs[0].url)).toBe(true);
    expect(listingKey(jobs[0])).toBeNull();
    expect(listingKey({ url: 'https://www.seek.co.nz/job/87654321?type=standard' })).toBe('87654321');
  });

  it('is detected as a Seek alert from the sender and from the body of a forward', () => {
    expect(detectJobSource({ from: 'noreply@s.seek.co.nz', subject: 'Head of Technology Engineering [Strong applicant] + 11 new jobs', body: SEEK_RECOMMENDATION_HTML })).toBe('seek');
    expect(detectJobSource({ from: 'matt@gmail.com', subject: 'Fwd: + 11 new jobs', body: SEEK_RECOMMENDATION_HTML })).toBe('seek');
    expect(parseJobAlert('seek', SEEK_RECOMMENDATION_HTML)).toHaveLength(12);
  });
});
