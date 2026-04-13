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

export interface CompanyResearch {
  companyName: string;
  industry: string;
  employeeCount: string;
  headquarters: string;
  officeLocations: string[];
  roleLocation: string;
  overview: string;
  cultureSummary: string;
  remoteWorkPolicy: string;
  wfhResistance: "low" | "moderate" | "high" | "unknown";
  recentNews: string[];
  glassdoorRating: string;
}

export interface SalaryResearch {
  jobTitle: string;
  nzRange: { low: number; median: number; high: number };
  auRange: { low: number; median: number; high: number };
  commonBenefits: string[];
  marketNotes: string;
  sources: string[];
}

export interface HiringManagerResearch {
  name: string;
  linkedinSummary: string;
  articles: { title: string; url: string; snippet: string }[];
  conferences: string[];
  knownDrivers: string[];
  recommendedApproach: string;
}

export interface InterviewQuestion {
  questionKey: string;
  question: string;
  category: "basics" | "compensation" | "role_specific" | "culture" | "process";
  answer?: string;
}

export interface RecruiterBriefing {
  company: CompanyResearch;
  salary: SalaryResearch;
  talkingPoints: string[];
  matchSummary: string;
  gapAreas: string[];
  hiringManager?: HiringManagerResearch;
  benefitMatches?: BenefitMatch[];
  interviewQuestions?: InterviewQuestion[];
}
