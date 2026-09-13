/**
 * Core profile and job types — the engine's vocabulary. Pure data shapes;
 * no I/O. Ported from v1 src/lib/types.ts with the research-only shapes
 * (company/hiring-manager/briefing) dropped: v2's pipeline output is a
 * tailored CV + letter + review email, not a recruiter briefing.
 */

export interface UserProfile {
  id: string;
  personal: {
    name: string;
    email: string;
    phone: string;
    address: string;
    linkedin: string;
    nationality: string;
    years_experience: number;
  };
  executive_summary: string;
  core_competencies: string[];
  career_history: CareerRole[];
  certifications_and_training: CertificationEntry[];
  priority_benefits?: PriorityBenefitItem[];
}

export interface CareerRole {
  title: string;
  company: string;
  location: string;
  start_date: string;
  end_date: string;
  highlights: string[];
  keywords: string[];
}

export interface CertificationEntry {
  name: string;
  year: number;
}

export interface PriorityBenefitItem {
  keyword: string;
  priority: number;
}

export interface BenefitMatch {
  keyword: string;
  priority: number;
  found: boolean;
  context: string;
}

export interface SalaryResearch {
  jobTitle: string;
  nzRange: { low: number; median: number; high: number };
  auRange: { low: number; median: number; high: number };
  commonBenefits: string[];
  marketNotes: string;
  sources: string[];
}

/** A job listing as extracted from a Seek alert email (before the full ad is fetched). */
export interface JobListing {
  title: string;
  company: string;
  location: string;
  salary: string;
  /** Snippet from the alert email; replaced by the full ad text once fetched. */
  description: string;
  /** Canonical Seek job URL — the "Apply" link in the review email. */
  url: string;
}
