/**
 * Static NZ/AU salary band lookup by job title. Ported from v1
 * src/lib/research/salary-data.ts; the table and notes are unchanged. This
 * is a curated snapshot, not live market data — the `sources` list names
 * the guides the bands were taken from.
 *
 * Pure: `lookupSalary(title)` is a table lookup with no I/O.
 */
import type { SalaryResearch } from '../types';

export interface SalaryEntry {
  keywords: string[];
  nzRange: { low: number; median: number; high: number };
  auRange: { low: number; median: number; high: number };
  marketNotes: string;
}

export const NZ_BENEFITS = [
  'KiwiSaver employer contribution (typically 3-4%)',
  'Health insurance (Southern Cross or nib)',
  'Professional development budget ($2,000-$5,000/year)',
  'Flexible/hybrid working arrangements',
  'Annual leave (4 weeks minimum + 10 days sick leave)',
  'Employee share schemes (for listed companies)',
  'Wellness allowance ($500-$1,500/year)',
  'Life and income protection insurance',
];

export const AU_BENEFITS = [
  'Superannuation (11.5%)',
  'Health insurance (often subsidised)',
  'Professional development budget ($3,000-$7,000/year)',
  'Flexible/hybrid working arrangements',
  "Annual leave (4 weeks + personal/carer's leave)",
  'Salary packaging / novated leasing',
  'Extended parental leave (12-26 weeks)',
  'Employee share schemes',
  'Wellness allowance ($500-$2,000/year)',
];

const SALARY_MAP: SalaryEntry[] = [
  {
    keywords: ['cto', 'chief technology officer', 'cio', 'chief information officer'],
    nzRange: { low: 280000, median: 340000, high: 400000 },
    auRange: { low: 320000, median: 385000, high: 450000 },
    marketNotes:
      'CTO/CIO roles in NZ are concentrated in Auckland and Wellington. AU market offers a significant premium, especially in Sydney financial services. Total comp often includes equity or performance bonuses of 15-30%.',
  },
  {
    keywords: ['director of ai', 'director of engineering', 'director engineering', 'engineering director', 'ai director'],
    nzRange: { low: 220000, median: 260000, high: 300000 },
    auRange: { low: 250000, median: 300000, high: 350000 },
    marketNotes:
      'AI leadership roles command a premium in both markets. NZ demand is growing rapidly with government and enterprise AI adoption. AU market is more mature with higher base salaries, particularly in Sydney and Melbourne.',
  },
  {
    keywords: ['head of technology', 'head of it', 'head of engineering', 'head of digital'],
    nzRange: { low: 200000, median: 240000, high: 280000 },
    auRange: { low: 230000, median: 275000, high: 320000 },
    marketNotes:
      'Head of Technology roles are common across mid-to-large enterprises. NZ roles often cover broader scope due to smaller teams. AU roles may be more specialised with larger budgets and teams.',
  },
  {
    keywords: ['engineering manager', 'development manager', 'software engineering manager'],
    nzRange: { low: 170000, median: 200000, high: 230000 },
    auRange: { low: 190000, median: 230000, high: 270000 },
    marketNotes:
      'Engineering Manager demand remains strong in both markets. NZ salaries have risen 10-15% since 2023 due to talent competition. AU offers broader opportunities in fintech and enterprise SaaS.',
  },
  {
    keywords: ['senior engineer', 'principal engineer', 'staff engineer', 'senior software engineer', 'principal software engineer'],
    nzRange: { low: 160000, median: 190000, high: 220000 },
    auRange: { low: 180000, median: 220000, high: 260000 },
    marketNotes:
      'Principal/Staff engineer roles are increasingly common as companies establish IC leadership tracks. NZ market is competitive for top talent. AU offers remote-friendly roles from Sydney-based companies at AU rates.',
  },
  {
    keywords: ['product manager', 'product owner', 'senior product manager', 'senior product owner', 'head of product'],
    nzRange: { low: 140000, median: 165000, high: 190000 },
    auRange: { low: 160000, median: 190000, high: 220000 },
    marketNotes:
      'Senior product roles in NZ are concentrated in Wellington (government) and Auckland (enterprise/fintech). AU market has stronger demand in Sydney and Melbourne, with fintech and healthtech paying premiums.',
  },
  {
    keywords: ['security architect', 'security director', 'head of security', 'ciso', 'chief information security officer'],
    nzRange: { low: 180000, median: 215000, high: 250000 },
    auRange: { low: 200000, median: 245000, high: 290000 },
    marketNotes:
      'Security leadership is in extremely high demand across both markets. NZ government and critical infrastructure roles often include security clearance requirements. AU financial services and telco sectors pay top-of-market rates.',
  },
  {
    keywords: ['cloud lead', 'platform lead', 'cloud architect', 'platform architect', 'cloud engineering lead'],
    nzRange: { low: 160000, median: 190000, high: 220000 },
    auRange: { low: 180000, median: 220000, high: 260000 },
    marketNotes:
      'Cloud/Platform roles remain in strong demand with Azure and AWS skills commanding premiums. Multi-cloud experience is increasingly valued. NZ market favours Azure due to government and enterprise adoption.',
  },
  {
    keywords: ['devops lead', 'devops manager', 'sre manager', 'platform engineering manager'],
    nzRange: { low: 150000, median: 175000, high: 200000 },
    auRange: { low: 170000, median: 205000, high: 240000 },
    marketNotes:
      'DevOps and SRE leadership roles are growing as organisations mature their platform engineering practices. NZ market is smaller but competitive. AU has strong demand in banking and e-commerce sectors.',
  },
  {
    keywords: ['data director', 'analytics director', 'head of data', 'head of analytics', 'data engineering manager'],
    nzRange: { low: 190000, median: 225000, high: 260000 },
    auRange: { low: 220000, median: 260000, high: 300000 },
    marketNotes:
      'Data leadership is a high-growth area in both markets. NZ organisations are building out data teams rapidly, particularly in government and telco. AU offers premium rates in financial services and retail analytics.',
  },
];

export const GENERIC_SALARY_ENTRY: SalaryEntry = {
  keywords: [],
  nzRange: { low: 150000, median: 200000, high: 260000 },
  auRange: { low: 170000, median: 230000, high: 300000 },
  marketNotes:
    'Technology leadership roles in NZ and AU vary significantly by sector, company size, and location. Auckland/Wellington in NZ and Sydney/Melbourne in AU typically command the highest salaries. Ranges shown represent a broad technology leadership band.',
};

export const SALARY_SOURCES = [
  'Hays NZ/AU Salary Guide 2025/2026',
  'Robert Half Technology & IT Salary Guide 2025',
  'Seek NZ/AU Salary Insights',
  'Absolute IT NZ Market Report 2025',
  'Hudson AU Technology Salary Tables 2025',
];

/**
 * Find the curated band for a title, or null when nothing matches. A blank
 * title never matches (v1's `keyword.includes('')` made '' match the CTO
 * row; that is the one behaviour fix in this port).
 */
export function findSalaryEntry(jobTitle: string): SalaryEntry | null {
  const titleLower = jobTitle.trim().toLowerCase();
  if (!titleLower) return null;

  return (
    SALARY_MAP.find((entry) =>
      entry.keywords.some((keyword) => titleLower.includes(keyword) || keyword.includes(titleLower))
    ) ?? null
  );
}

/** True when the title resolves to a specific band rather than the generic one. */
export function hasSalaryData(jobTitle: string): boolean {
  return findSalaryEntry(jobTitle) !== null;
}

export function lookupSalary(jobTitle: string): SalaryResearch {
  const entry = findSalaryEntry(jobTitle) ?? GENERIC_SALARY_ENTRY;

  return {
    jobTitle,
    nzRange: entry.nzRange,
    auRange: entry.auRange,
    commonBenefits: [...NZ_BENEFITS, ...AU_BENEFITS],
    marketNotes: entry.marketNotes,
    sources: [...SALARY_SOURCES],
  };
}
