import type { AnalysisResult } from "../job-analyzer";
import type { UserProfile, CompanyResearch } from "../types";

export interface Flashcard {
  key?: string;
  front: string;
  back: string;
  tags: string[];
}

export interface QuestionPref {
  rating: number;
  favourite: boolean;
  excluded: boolean;
  notes: string | null;
}

export const CLOSING_QUESTIONS: Flashcard[] = [
  // ─── Pre-Close & Success Framing ───
  {
    key: "closing-success-12m",
    front: "Closing: Success in 12 months",
    back: "\"Imagine I was successful in this role. In 12 months when we talk, what would I need to have done to be successful?\"<br><br><b>Why this works:</b> Forces the interviewer to articulate concrete expectations and reveals the real priorities behind the job description. Embeds your success in their thinking before the decision is made.",
    tags: ["closing", "power-question", "pre-close"],
  },
  {
    key: "closing-good-vs-exceptional",
    front: "Closing: Good vs exceptional",
    back: "\"What separates someone who is good in this role from someone who is exceptional?\"<br><br><b>Why this works:</b> Reveals the unwritten success criteria and shows you're aiming higher than 'adequate'. They'll describe the person they actually want — compare it against yourself in real time.",
    tags: ["closing", "power-question", "pre-close"],
  },
  {
    key: "closing-hesitations",
    front: "Closing: Address hesitations",
    back: "\"Is there anything about my background that gives you hesitation that I could address right now?\"<br><br><b>Why this works:</b> Gives you a chance to overcome objections before they write you off. Shows confidence and directness. Most candidates never ask — you get the last word.",
    tags: ["closing", "power-question", "pre-close"],
  },
  {
    key: "closing-regret-hiring",
    front: "Closing: Make you regret hiring me",
    back: "\"What would make you regret hiring me?\"<br><br><b>Why this works:</b> More direct version of addressing hesitations — harder to deflect. Surfaces their real fears about the hire. Shows extreme confidence and self-awareness.",
    tags: ["closing", "power-question", "pre-close"],
  },

  // ─── Reveal the Real Role ───
  {
    key: "closing-team-challenge",
    front: "Closing: Team's biggest challenge",
    back: "\"What does the team's biggest challenge look like right now, and how would this role help solve it?\"<br><br><b>Why this works:</b> Shows you're thinking about contribution from day one. Reveals the real pain points — not the sanitised job ad version.",
    tags: ["closing", "power-question", "real-role"],
  },
  {
    key: "closing-predecessor",
    front: "Closing: Lessons from predecessor",
    back: "\"What is the one thing you wish the previous person in this role had done differently?\"<br><br><b>Why this works:</b> Reveals what went wrong before. Lets you position yourself as the solution. Shows you learn from others' mistakes.",
    tags: ["closing", "power-question", "real-role"],
  },
  {
    key: "closing-first-90-days",
    front: "Closing: First 90 days reality",
    back: "\"What does the first 90 days actually look like — not the ideal version?\"<br><br><b>Why this works:</b> 'Not the ideal version' grants them permission to be honest. Reveals if there's a crisis waiting, a political mess, or an unclear mandate. Shows you're pragmatic, not naive.",
    tags: ["closing", "power-question", "real-role"],
  },
  {
    key: "closing-key-relationships",
    front: "Closing: Key relationships",
    back: "\"Who would I need to build the strongest relationships with to succeed?\"<br><br><b>Why this works:</b> Uncovers informal power structures and political landscape. Shows you think systemically — not just task-level. Reveals who actually matters vs the org chart.",
    tags: ["closing", "power-question", "real-role"],
  },
  {
    key: "closing-role-tension",
    front: "Closing: Tension between roles",
    back: "\"What's the tension between this role and the roles around it?\"<br><br><b>Why this works:</b> Senior candidates think in systems and interfaces, not just job descriptions. Shows organisational maturity. Surfaces turf wars, unclear boundaries, or political minefields nobody mentioned.",
    tags: ["closing", "power-question", "real-role", "seniority"],
  },

  // ─── Reveal Culture & Leadership Quality ───
  {
    key: "closing-decisions",
    front: "Closing: How decisions get made",
    back: "\"How do decisions actually get made here?\"<br><br><b>Why this works:</b> Cuts through org chart fiction. Reveals power dynamics, bureaucracy, and whether you'll have real authority or just a title. Watch for hesitation — that's the answer.",
    tags: ["closing", "power-question", "culture"],
  },
  {
    key: "closing-people-thrive",
    front: "Closing: People who thrive",
    back: "\"What do the people who've thrived here have in common?\"<br><br><b>Why this works:</b> Pattern elicitation — they'll describe the cultural archetype they actually reward, not what the values poster says. Compare it mentally against who you are. If it doesn't sound like you, that's data.",
    tags: ["closing", "power-question", "culture"],
  },
  {
    key: "closing-things-go-wrong",
    front: "Closing: When things go wrong",
    back: "\"How does leadership respond when something goes wrong?\"<br><br><b>Why this works:</b> Nobody asks this. The answer tells you everything about psychological safety. Watch for over-rehearsed answers — that's a flag. Blame culture vs learning culture is revealed in seconds.",
    tags: ["closing", "power-question", "culture"],
  },
  {
    key: "closing-unwritten-rules",
    front: "Closing: Unwritten rules",
    back: "\"What are the unwritten rules here that took people a while to figure out?\"<br><br><b>Why this works:</b> Disarms with informality, extracts real cultural norms. Good interviewers love this question; bad ones get uncomfortable. Either way, you learn something valuable.",
    tags: ["closing", "power-question", "culture"],
  },
  {
    key: "closing-what-changed",
    front: "Closing: What changed most",
    back: "\"What's changed most about this team in the last year?\"<br><br><b>Why this works:</b> Surfaces instability, restructures, or culture shifts they won't volunteer. If the answer is 'a lot' — probe deeper. Stability or chaos are both useful to know before signing.",
    tags: ["closing", "power-question", "culture"],
  },

  // ─── Signal Seniority ───
  {
    key: "closing-no-constraints",
    front: "Closing: Fix first with no constraints",
    back: "\"If budget or headcount weren't a constraint, what would you fix first?\"<br><br><b>Why this works:</b> Reveals strategic priorities and frustration points. Positions you as someone thinking at leadership level. Their answer tells you what they've been fighting for internally.",
    tags: ["closing", "power-question", "seniority"],
  },

  // ─── Create Memorable Impression ───
  {
    key: "closing-no-one-asks",
    front: "Closing: Question no one asks",
    back: "\"What would you want someone to ask you that no one ever does?\"<br><br><b>Why this works:</b> Metacognitive flip — completely unexpected, makes you unforgettable. Some interviewers freeze — that's fine, you've already differentiated yourself from every other candidate.",
    tags: ["closing", "power-question", "memorable"],
  },
  {
    key: "closing-what-excites",
    front: "Closing: What excites you",
    back: "\"What are you most excited about in the direction this team/company is heading?\"<br><br><b>Why this works:</b> Emotional mirroring — gets them talking about something they care about. People who feel heard and excited in an interview associate that feeling with you. Anchoring bias works in your favour.",
    tags: ["closing", "power-question", "memorable"],
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

export interface CustomQuestionData {
  id: string;
  question: string;
  desiredOutcome: string | null;
  category: string;
  status: string;
  favourite: boolean;
  excluded: boolean;
  includeInDeck: boolean;
}

export function generateFlashcards(
  analysis: AnalysisResult,
  profile: UserProfile,
  companyResearch?: CompanyResearch,
  questionPrefs?: Record<string, QuestionPref>,
  customQuestions?: CustomQuestionData[]
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

  // 7. Closing Questions — filtered by user preferences
  for (const q of CLOSING_QUESTIONS) {
    const pref = q.key && questionPrefs ? questionPrefs[q.key] : undefined;

    // Skip if user has excluded this question
    if (pref?.excluded) continue;

    const extraTags: string[] = [];
    if (pref?.favourite) extraTags.push("favourite");
    if (pref?.rating && pref.rating >= 4) extraTags.push("top-rated");

    const back = pref?.notes
      ? `${q.back}<br><br><b>Your notes:</b> ${pref.notes}`
      : q.back;

    cards.push({
      ...q,
      back,
      tags: [...roleTags, ...q.tags, ...extraTags],
    });
  }

  // 8. Custom questions — user-created, moderated, approved only
  if (customQuestions) {
    for (const cq of customQuestions) {
      if (cq.excluded || !cq.includeInDeck) continue;
      if (cq.status !== "approved") continue; // Only approved questions make it to deck

      const extraTags: string[] = ["custom"];
      if (cq.favourite) extraTags.push("favourite");
      if (cq.category !== "custom") extraTags.push(cq.category);

      let back = cq.desiredOutcome
        ? `<b>Desired outcome:</b> ${cq.desiredOutcome}`
        : "Observe the interviewer's reaction and body language. Note what they emphasise.";

      cards.push({
        key: `custom-${cq.id}`,
        front: cq.question,
        back,
        tags: [...roleTags, ...extraTags],
      });
    }
  }

  // 9. Tailored summary — for elevator pitch
  cards.push({
    front: "Give your 60-second elevator pitch for this role",
    back: analysis.tailoredSummary,
    tags: [...roleTags, "elevator-pitch"],
  });

  return cards;
}
