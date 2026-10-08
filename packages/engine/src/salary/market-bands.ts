/**
 * Estimated NZ market salary bands (base, NZD per year) by role family and
 * seniority, used when a job ad gives no salary. Australian jobs use the same
 * family scaled by AU_MARKET_PREMIUM (AUD) and converted at AUD_TO_NZD, so
 * every figure the pipeline compares is NZD.
 *
 * Calibrated October 2026 against published ranges, not live data:
 *  - Robert Walters NZ 2026: CTO Auckland $290k–$450k (national $180k–$450k);
 *    IT Director Auckland $200k–$320k; General Manager Auckland $220k–$380k.
 *  - Robert Walters ANZ Tech & Transformation 2025: Engineering Manager
 *    $200k–$250k, Enterprise Architect $240k–$270k.
 *  - SEEK NZ salary insights: CTO national average $205k–$225k (Auckland
 *    Central ~$250k); Product Manager $120k–$140k.
 *  - Robert Half NZ 2026: Product Manager $110k–$130k (25th–75th pct).
 *  - Glassdoor / PayScale Auckland: IT Manager ~$107k–$158k; Product
 *    Management Director ~$183k average.
 * Bands sit inside those ranges at the mid-to-large-enterprise level Matt
 * targets. Edit here when a newer guide lands; tests pin the lookups.
 *
 * Pure: regex lookups, no I/O.
 */

export interface MarketBand {
  id: string;
  /** Human label used in the review email ("Head of Technology / Digital"). */
  label: string;
  minNzd: number;
  maxNzd: number;
}

interface BandRule extends MarketBand {
  match: RegExp;
}

/** AUD → NZD, approximate mid-2026 rate. Used for advertised AUD salaries and AU estimates. */
export const AUD_TO_NZD = 1.12;
/** USD → NZD, approximate. */
export const USD_TO_NZD = 1.75;
/** GBP → NZD, approximate. */
export const GBP_TO_NZD = 2.25;
/** Australian base salaries for the same role run roughly this much higher in AUD terms. */
export const AU_MARKET_PREMIUM = 1.12;

/** Most specific first: the first rule whose pattern matches the title wins. */
const RULES: BandRule[] = [
  { id: 'ciso', label: 'CISO / Head of Security', minNzd: 200_000, maxNzd: 320_000, match: /\bciso\b|chief\s+information\s+security|head\s+of\s+(?:cyber\s*)?security|security\s+director|director\s+of\s+(?:cyber\s*)?security/i },
  { id: 'c-level', label: 'C-level technology / digital / product executive', minNzd: 250_000, maxNzd: 400_000, match: /\bchief\b[\w\s&,-]*\bofficer\b|\b(?:cto|cio|cdo|cpo|cdto|coo)\b/i },
  { id: 'general-manager', label: 'General Manager', minNzd: 200_000, maxNzd: 330_000, match: /\bgeneral\s+manager\b|\bgm\b/i },
  { id: 'director', label: 'Director (technology, digital, product, delivery)', minNzd: 200_000, maxNzd: 320_000, match: /\bdirector\b/i },
  { id: 'head-of-data', label: 'Head of Data / Analytics', minNzd: 190_000, maxNzd: 280_000, match: /\bhead\s+of\s+(?:data|analytics|ai|artificial\s+intelligence)\b/i },
  { id: 'head-of-product', label: 'Head of Product', minNzd: 170_000, maxNzd: 240_000, match: /\bhead\s+of\s+product\b/i },
  { id: 'head-of-technology', label: 'Head of Technology / Digital / Engineering', minNzd: 190_000, maxNzd: 280_000, match: /\bhead\s+of\s+(?:technology|tech|it|ict|information|engineering|digital|platforms?|architecture|infrastructure|transformation|delivery|cloud|enterprise)\b/i },
  { id: 'head-of', label: 'Head of (other function)', minNzd: 160_000, maxNzd: 240_000, match: /\bhead\s+of\b/i },
  { id: 'enterprise-architect', label: 'Enterprise / Chief Architect', minNzd: 190_000, maxNzd: 260_000, match: /\b(?:enterprise|chief|principal)\s+architect\b/i },
  { id: 'engineering-manager', label: 'Engineering / Technology Manager (people leader)', minNzd: 160_000, maxNzd: 220_000, match: /\b(?:engineering|software\s+development|technology\s+engineering)\s+manager\b|\bmanager\s+(?:of\s+)?(?:technology\s+)?engineering\b/i },
  { id: 'portfolio-programme', label: 'Portfolio / Programme Manager', minNzd: 150_000, maxNzd: 210_000, match: /\b(?:portfolio|programme|program)\s+(?:manager|lead|director)\b|\bvalue\s+stream\s+lead\b/i },
  { id: 'architect', label: 'Solution / Technical Architect', minNzd: 150_000, maxNzd: 210_000, match: /\barchitect\b/i },
  { id: 'senior-product', label: 'Senior Product Manager / Owner', minNzd: 130_000, maxNzd: 175_000, match: /\b(?:senior|lead|principal|group)\s+product\s+(?:manager|owner)\b/i },
  { id: 'product', label: 'Product Manager / Owner', minNzd: 115_000, maxNzd: 155_000, match: /\bproduct\s+(?:manager|owner|lead)\b/i },
  { id: 'delivery-manager', label: 'Delivery / Service Delivery Manager', minNzd: 130_000, maxNzd: 180_000, match: /\b(?:client|service|customer)?\s*delivery\s+(?:manager|lead)\b/i },
  { id: 'it-manager', label: 'IT / Infrastructure / Operations Manager', minNzd: 120_000, maxNzd: 170_000, match: /\b(?:it|ict|infrastructure|platform|operations|technology|systems)\s+(?:operations\s+)?manager\b/i },
  { id: 'project-manager', label: 'Project Manager', minNzd: 120_000, maxNzd: 165_000, match: /\bproject\s+manager\b/i },
  { id: 'tech-lead', label: 'Tech Lead / Principal Engineer', minNzd: 150_000, maxNzd: 200_000, match: /\b(?:tech(?:nical)?\s+lead|lead\s+engineer|principal\s+(?:engineer|consultant)|staff\s+engineer)\b/i },
  { id: 'manager', label: 'Manager (general)', minNzd: 120_000, maxNzd: 170_000, match: /\bmanager\b/i },
  { id: 'senior-ic', label: 'Senior specialist / consultant', minNzd: 120_000, maxNzd: 160_000, match: /\b(?:senior|lead)\b/i },
];

const FALLBACK: MarketBand = { id: 'general', label: 'Professional role (general)', minNzd: 90_000, maxNzd: 140_000 };

/** The NZ market band for a job title (never null — a general band is the fallback). */
export function marketBandFor(title: string): MarketBand {
  const t = title.trim();
  const rule = t ? RULES.find((r) => r.match.test(t)) : undefined;
  if (!rule) return { ...FALLBACK };
  const { match: _match, ...band } = rule;
  void _match;
  return band;
}

const AU_PLACES = /\b(?:australia|sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin|gold\s+coast|newcastle\s+nsw)\b/i;
const AU_STATES = /\b(?:NSW|VIC|QLD|ACT|WA|SA|TAS|NT)\b/;

/** True when a job location reads as Australian (city, "Australia", or a state code). */
export function isAustralianLocation(location: string): boolean {
  return AU_PLACES.test(location) || AU_STATES.test(location);
}

function round5k(n: number): number {
  return Math.round(n / 5000) * 5000;
}

/** The band for a title in the job's market, in NZD. Australian jobs: NZ band × premium (AUD) × AUD_TO_NZD. */
export function estimateMarketBand(title: string, location: string): MarketBand & { market: 'NZ' | 'AU' } {
  const band = marketBandFor(title);
  if (!isAustralianLocation(location)) return { ...band, market: 'NZ' };
  const factor = AU_MARKET_PREMIUM * AUD_TO_NZD;
  return { ...band, minNzd: round5k(band.minNzd * factor), maxNzd: round5k(band.maxNzd * factor), market: 'AU' };
}
