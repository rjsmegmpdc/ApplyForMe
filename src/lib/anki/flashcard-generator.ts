import type { AnalysisResult } from "../job-analyzer";
import type { UserProfile, CompanyResearch } from "../types";

export interface Flashcard {
  front: string;
  back: string;
  tags: string[];
}

const CLOSING_QUESTIONS: Flashcard[] = [
  {
    front: "Closing Question: Success in 12 months",
    back: "\"Imagine I was successful in this role. In 12 months when we talk, what would I need to have done to be successful?\"<br><br><b>Why this works:</b> Forces the interviewer to articulate concrete expectations and reveals the real priorities behind the job description.",
    tags: ["closing", "power-question"],
  },
  {
    front: "Closing Question: Team's biggest challenge",
    back: "\"What does the team's biggest challenge look like right now, and how would this role help solve it?\"<br><br><b>Why this works:</b> Shows you're thinking about contribution from day one, and reveals the real pain points you'd be addressing.",
    tags: ["closing", "power-question"],
  },
  {
    front: "Closing Question: Good vs exceptional",
    back: "\"What separates someone who is good in this role from someone who is exceptional?\"<br><br><b>Why this works:</b> Reveals the unwritten success criteria and shows you're aiming higher than 'adequate'.",
    tags: ["closing", "power-question"],
  },
  {
    front: "Closing Question: Address hesitations",
    back: "\"Is there anything about my background that gives you hesitation that I could address right now?\"<br><br><b>Why this works:</b> Gives you a chance to overcome objections before they write you off. Shows confidence and directness.",
    tags: ["closing", "power-question"],
  },
  {
    front: "Closing Question: Lessons from predecessor",
    back: "\"What is the one thing you wish the previous person in this role had done differently?\"<br><br><b>Why this works:</b> Reveals what went wrong before and lets you position yourself as the solution. Also shows you learn from others' mistakes.",
    tags: ["closing", "power-question"],
  },
];

const BEHAVIOURAL_TEMPLATES: Record<string, { front: string; backPrompt: string }[]> = {
  "AI & Machine Learning": [
    { front: "Tell me about a time you delivered an AI solution that had measurable business impact.", backPrompt: "Use STAR format. Reference your AI delivery experience." },
    { front: "How have you governed responsible AI in a production environment?", backPrompt: "Describe your Responsible AI controls and governance approach." },
  ],
  "Leadership & Strategy": [
    { front: "Describe a time you built and led a high-performing technology team.", backPrompt: "Use STAR format. Reference team size, structure, outcomes." },
    { front: "Tell me about a technology strategy you developed and delivered.", backPrompt: "Describe roadmap creation, stakeholder alignment, delivery." },
  ],
  "Security & Compliance": [
    { front: "How have you improved an organisation's security posture?", backPrompt: "Reference Zero Trust, PAM, NIST frameworks, measurable outcomes." },
    { front: "Describe your approach to balancing security with user experience.", backPrompt: "Give examples of tiered access, risk-based decisions." },
  ],
  "Cloud & Infrastructure": [
    { front: "Tell me about a significant cloud migration you led.", backPrompt: "Reference platforms, scale, OPEX savings, challenges overcome." },
    { front: "How do you approach cloud cost optimisation?", backPrompt: "Describe licensing strategies, automation, monitoring." },
  ],
  "Financial Management": [
    { front: "Describe a time you delivered significant cost savings.", backPrompt: "Reference $ figures, approach, stakeholder management." },
    { front: "How do you manage technology budgets and forecasting?", backPrompt: "Describe OPEX/CAPEX management, governance, reporting." },
  ],
  "DevOps & Engineering": [
    { front: "How have you transformed a team's DevOps practices?", backPrompt: "Reference CI/CD, automation, cultural change, metrics." },
    { front: "Describe your approach to engineering quality and delivery velocity.", backPrompt: "Reference TDD, code review, sprint management." },
  ],
};

export function generateFlashcards(
  analysis: AnalysisResult,
  profile: UserProfile,
  companyResearch?: CompanyResearch
): Flashcard[] {
  const cards: Flashcard[] = [];
  const roleTags = [analysis.jobTitle.toLowerCase().replace(/\s+/g, "-"), analysis.company.toLowerCase().replace(/\s+/g, "-")];

  // 1. Role Knowledge cards
  cards.push({
    front: `What is the ${analysis.jobTitle} role at ${analysis.company}?`,
    back: `<b>Location:</b> ${analysis.officeLocation}<br><b>Match:</b> ${analysis.matchPercentage}%<br><br><b>Key Requirements:</b><br>${analysis.requirements.map((r) => `- ${r.category}: ${r.keywords.join(", ")}`).join("<br>")}`,
    tags: [...roleTags, "role-knowledge"],
  });

  cards.push({
    front: `What are the critical requirements for ${analysis.jobTitle}?`,
    back: analysis.requirements
      .filter((r) => r.importance === "critical")
      .map((r) => `<b>${r.category}:</b> ${r.requirement}`)
      .join("<br><br>") || "No critical requirements identified",
    tags: [...roleTags, "role-knowledge"],
  });

  // 2. Company Facts
  if (companyResearch) {
    cards.push({
      front: `What does ${analysis.company} do?`,
      back: `<b>Industry:</b> ${companyResearch.industry}<br><b>Size:</b> ${companyResearch.employeeCount}<br><b>HQ:</b> ${companyResearch.headquarters}<br><br>${companyResearch.overview}`,
      tags: [...roleTags, "company"],
    });
    cards.push({
      front: `What is ${analysis.company}'s culture and work environment?`,
      back: `<b>Culture:</b> ${companyResearch.cultureSummary}<br><b>Remote/WFH:</b> ${companyResearch.remoteWorkPolicy}<br><b>WFH Resistance:</b> ${companyResearch.wfhResistance}`,
      tags: [...roleTags, "company", "culture"],
    });
  }

  // 3. Your Experience Alignment — one card per strong/moderate match
  for (const match of analysis.matches.filter((m) => m.matched)) {
    const topEvidence = match.evidence.slice(0, 3);
    cards.push({
      front: `How does your experience align with the ${match.requirement.category} requirement?`,
      back: `<b>${match.matchStrength.toUpperCase()} match</b><br><br>${topEvidence.map((e) => `- ${e}`).join("<br>")}`,
      tags: [...roleTags, "alignment", match.requirement.category.toLowerCase().replace(/\s+/g, "-")],
    });
  }

  // 4. Technical Topics — from matched categories
  for (const match of analysis.matches.filter((m) => m.matchStrength === "strong")) {
    cards.push({
      front: `What specific expertise do you bring in ${match.requirement.category}?`,
      back: `<b>Keywords:</b> ${match.requirement.keywords.join(", ")}<br><br><b>Evidence:</b><br>${match.evidence.slice(0, 3).map((e) => `- ${e}`).join("<br>")}`,
      tags: [...roleTags, "technical", match.requirement.category.toLowerCase().replace(/\s+/g, "-")],
    });
  }

  // 5. Behavioural Questions — matched to categories
  for (const match of analysis.matches.filter((m) => m.matched)) {
    const templates = BEHAVIOURAL_TEMPLATES[match.requirement.category];
    if (templates) {
      for (const t of templates) {
        cards.push({
          front: t.front,
          back: `${t.backPrompt}<br><br><b>Your evidence:</b><br>${match.evidence.slice(0, 2).map((e) => `- ${e}`).join("<br>")}`,
          tags: [...roleTags, "behavioural", match.requirement.category.toLowerCase().replace(/\s+/g, "-")],
        });
      }
    }
  }

  // 6. Gap areas — prepare answers for weak spots
  for (const skill of analysis.missingSkills) {
    cards.push({
      front: `How would you address the gap in ${skill}?`,
      back: `This was identified as a gap area. Prepare a response that:<br>- Acknowledges the gap honestly<br>- References adjacent/transferable experience<br>- Shows active learning or interest<br>- Frames it as an opportunity for growth`,
      tags: [...roleTags, "gap", "preparation"],
    });
  }

  // 7. Closing Questions — always included
  for (const q of CLOSING_QUESTIONS) {
    cards.push({
      ...q,
      tags: [...roleTags, ...q.tags],
    });
  }

  // 8. Tailored summary — for elevator pitch
  cards.push({
    front: "Give your 60-second elevator pitch for this role",
    back: analysis.tailoredSummary,
    tags: [...roleTags, "elevator-pitch"],
  });

  return cards;
}
