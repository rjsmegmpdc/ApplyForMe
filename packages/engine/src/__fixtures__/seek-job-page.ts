/**
 * Test fixture: a synthetic Seek.co.nz job page. Carries both of the
 * structures the page parser understands — a JSON-LD `JobPosting` block and
 * the `data-automation="jobAdDetails"` container with nested divs — plus the
 * `job-detail-title` / `advertiser-name` / `job-detail-location` /
 * `job-detail-salary` markup, scripts, styles and navigation noise.
 *
 * `buildSeekJobPage({ jsonLd: false })` returns the same page with the
 * JSON-LD block removed so the DOM path can be tested in isolation.
 * Synthetic: company, copy and ids are invented.
 */

export const SEEK_JOB_PAGE_DESCRIPTION_HTML = `<p><strong>About the role</strong></p>
<p>Kiwi Energy Group is looking for a Head of Modern Workplace to own our Microsoft 365, Intune and Windows 365 strategy across 3,000+ staff and 4,500 endpoints.</p>
<p><strong>What you'll do</strong></p>
<ul>
  <li>Set the technology roadmap for the modern workplace domain and drive stakeholder alignment</li>
  <li>Lead the production rollout of Copilot and Copilot Studio agents with Responsible AI governance</li>
  <li>Partner with Security on Zero Trust, privileged access management and endpoint security aligned to NIST &amp; ISO</li>
  <li>Manage the domain budget (OPEX/CAPEX), licensing and forecasting</li>
  <li>Champion DevOps practices and automation across the platform team</li>
</ul>
<p><strong>About you</strong></p>
<ul>
  <li>10+ years in technology leadership, ideally within a regulated enterprise</li>
  <li>Deep Azure and Microsoft 365 experience</li>
  <li>Comfortable with data &amp; analytics to drive decisions</li>
</ul>
<p>Hybrid role &mdash; 3 days in our Auckland CBD office.</p>`;

export interface BuildSeekJobPageOptions {
  jsonLd?: boolean;
  jobAdDetails?: boolean;
}

export function buildSeekJobPage(opts: BuildSeekJobPageOptions = {}): string {
  const { jsonLd = true, jobAdDetails = true } = opts;

  const ld = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: 'Head of Modern Workplace',
        description: SEEK_JOB_PAGE_DESCRIPTION_HTML,
        datePosted: '2026-09-10',
        validThrough: '2026-10-10',
        employmentType: 'FULL_TIME',
        hiringOrganization: { '@type': 'Organization', name: 'Kiwi Energy Group' },
        jobLocation: {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: 'Auckland CBD',
            addressRegion: 'Auckland',
            addressCountry: 'NZ',
          },
        },
        baseSalary: {
          '@type': 'MonetaryAmount',
          currency: 'NZD',
          value: { '@type': 'QuantitativeValue', minValue: 180000, maxValue: 200000, unitText: 'YEAR' },
        },
      })}</script>`
    : '';

  const details = jobAdDetails
    ? `<div data-automation="jobAdDetails" class="_1wkzzau0 szurmz0">
        <div class="_1wkzzau0 inner">
          ${SEEK_JOB_PAGE_DESCRIPTION_HTML}
        </div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Head of Modern Workplace Job in Auckland CBD, Auckland - SEEK</title>
  <link rel="stylesheet" href="https://cdn.seek.co.nz/app.css">
  <style>.hidden{display:none} body{margin:0}</style>
  ${ld}
  <script>window.SEEK_APP_CONFIG = {"analytics": true, "leak": "SCRIPT_CONTENT_MUST_NOT_APPEAR"};</script>
</head>
<body>
  <nav data-automation="site-nav"><a href="/">Jobs</a><a href="/companies">Companies</a><a href="/career-advice">Career advice</a></nav>
  <main>
    <div data-automation="job-detail-header">
      <h1 data-automation="job-detail-title" class="_1wkzzau0">Head of Modern Workplace</h1>
      <span data-automation="advertiser-name" class="_1wkzzau0">Kiwi Energy Group</span>
      <div><span data-automation="job-detail-location">Auckland CBD, Auckland</span></div>
      <div><span data-automation="job-detail-work-type">Full time</span></div>
      <div><span data-automation="job-detail-salary">$180,000 &ndash; $200,000 per year + KiwiSaver</span></div>
      <div><span data-automation="job-detail-date">Posted 3d ago</span></div>
    </div>
    ${details}
    <div data-automation="job-detail-apply"><a href="https://www.seek.co.nz/job/84120987/apply">Apply</a></div>
    <aside>
      <h2>Similar jobs</h2>
      <a href="https://www.seek.co.nz/job/84999999">Chef de Partie</a>
    </aside>
  </main>
  <footer>© 2026 SEEK Limited. <a href="/privacy">Privacy</a></footer>
  <script>window.__data = {"leak": "SCRIPT_CONTENT_MUST_NOT_APPEAR"};</script>
</body>
</html>`;
}

export const SEEK_JOB_PAGE_HTML = buildSeekJobPage();
