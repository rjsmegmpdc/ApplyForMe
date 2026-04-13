"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import type { AnalysisResult } from "@/lib/job-analyzer";
import type { UserProfile, CompanyResearch, SalaryResearch, HiringManagerResearch, BenefitMatch, InterviewQuestion } from "@/lib/types";
import { generateCV, generateCoverLetter, generateBriefing } from "@/lib/docx-generator";
import { Packer } from "docx";
import { AuthGuard, useUserId } from "@/components/AuthGuard";

function MatchBadge({ strength }: { strength: string }) {
  const colors: Record<string, string> = {
    strong: "bg-green-100 text-green-800 border-green-200",
    moderate: "bg-blue-100 text-blue-800 border-blue-200",
    weak: "bg-yellow-100 text-yellow-800 border-yellow-200",
    none: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${colors[strength] || colors.none}`}>
      {strength.toUpperCase()}
    </span>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  basics: "Role Basics",
  compensation: "Compensation",
  role_specific: "Role-Specific",
  culture: "Culture & Fit",
  process: "Process & Next Steps",
};

export default function Home() {
  const { data: session } = useSession();
  const userId = useUserId();
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [jobText, setJobText] = useState("");
  const [hiringManager, setHiringManager] = useState("");
  const [analysis, setAnalysis] = useState<(AnalysisResult & { applicationId?: string }) | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [companyResearch, setCompanyResearch] = useState<CompanyResearch | null>(null);
  const [salaryResearch, setSalaryResearch] = useState<SalaryResearch | null>(null);
  const [hmResearch, setHmResearch] = useState<HiringManagerResearch | null>(null);
  const [interviewNotes, setInterviewNotes] = useState<(InterviewQuestion & { id?: string })[]>([]);
  const [showInterview, setShowInterview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => {
        setProfiles(data);
        if (data.length === 1) setSelectedProfileId(data[0].id);
        else if (userId && data.find((p: { id: string }) => p.id === userId)) setSelectedProfileId(userId);
      })
      .catch(console.error);
  }, [userId]);

  const handleAnalyze = useCallback(async () => {
    if (!selectedProfileId || !jobText.trim()) return;
    setLoading(true);
    setAnalysis(null);
    setCompanyResearch(null);
    setSalaryResearch(null);
    setHmResearch(null);
    setInterviewNotes([]);
    setShowInterview(false);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: selectedProfileId, jobText, hiringManager }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const result = await res.json();
      setAnalysis(result);
      const profileRes = await fetch(`/api/profiles/${selectedProfileId}`);
      if (profileRes.ok) setProfile(await profileRes.json());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [selectedProfileId, jobText, hiringManager]);

  const handleResearch = useCallback(async () => {
    if (!analysis) return;
    setResearching(true);
    try {
      const [companyRes, salaryRes] = await Promise.all([
        fetch("/api/research/company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName: analysis.company, jobTitle: analysis.jobTitle }),
        }),
        fetch("/api/research/salary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobTitle: analysis.jobTitle }),
        }),
      ]);
      if (companyRes.ok) setCompanyResearch(await companyRes.json());
      if (salaryRes.ok) setSalaryResearch(await salaryRes.json());
    } catch (e) {
      console.error(e);
    }
    setResearching(false);
  }, [analysis]);

  const handlePrepInterview = useCallback(() => {
    if (!analysis) return;
    setInterviewNotes(analysis.interviewQuestions.map((q) => ({ ...q })));
    setShowInterview(true);
  }, [analysis]);

  const handleSaveNotes = useCallback(async () => {
    if (!analysis?.applicationId) return;
    try {
      await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: analysis.applicationId, questions: interviewNotes }),
      });

      // Auto-populate from answers
      const locationNote = interviewNotes.find((n) => n.questionKey === "location");
      if (locationNote?.answer?.trim()) {
        setAnalysis((prev) => prev ? { ...prev, officeLocation: locationNote.answer!.trim() } : prev);
      }

      const salaryNote = interviewNotes.find((n) => n.questionKey === "salary_band");
      if (salaryNote?.answer?.trim() && salaryResearch) {
        // Show comparison in a simple format
        const answeredSalary = salaryNote.answer.trim();
        setSalaryResearch((prev) => prev ? {
          ...prev,
          marketNotes: `${prev.marketNotes} Recruiter indicated: ${answeredSalary}.`,
        } : prev);
      }

      // Research hiring manager if answered
      const hmNote = interviewNotes.find((n) => n.questionKey === "hiring_manager");
      if (hmNote?.answer && hmNote.answer.trim()) {
        const res = await fetch("/api/research/hiring-manager", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: hmNote.answer.trim(), company: analysis.company, jobTitle: analysis.jobTitle }),
        });
        if (res.ok) setHmResearch(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  }, [analysis, interviewNotes, salaryResearch]);

  const updateNoteAnswer = (index: number, answer: string) => {
    setInterviewNotes((prev) => prev.map((n, i) => (i === index ? { ...n, answer } : n)));
  };

  const handleDownload = useCallback(
    async (type: "cv" | "letter" | "briefing") => {
      if (!analysis || !profile) return;
      setGenerating(type);
      try {
        let doc;
        let filename;
        const safeName = profile.personal.name.replace(/\s+/g, "_");
        const safeCompany = analysis.company.replace(/\s+/g, "_");
        if (type === "cv") {
          doc = generateCV(analysis, profile);
          filename = `${safeName}_CV_${safeCompany}.docx`;
        } else if (type === "letter") {
          doc = generateCoverLetter(analysis, profile, hiringManager || undefined);
          filename = `${safeName}_Cover_Letter_${safeCompany}.docx`;
        } else {
          if (!companyResearch || !salaryResearch) return;
          doc = generateBriefing(analysis, profile, companyResearch, salaryResearch, hmResearch || undefined);
          filename = `${safeName}_Briefing_${safeCompany}.docx`;
        }
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
      }
      setGenerating(null);
    },
    [analysis, profile, hiringManager, companyResearch, salaryResearch]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Job Analysis</h1>
          {session?.user && (
            <span className="text-sm text-slate-500">{session.user.name} ({(session.user as { role?: string }).role})</span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Step 1 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Step 1: Select Profile & Paste Job</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Profile</label>
            <select value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select a profile...</option>
              {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
          <textarea value={jobText} onChange={(e) => setJobText(e.target.value)} placeholder="Paste the full job description, job ad, or recruiter email here..." className="w-full h-48 p-4 border border-slate-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Hiring Manager (optional)</label>
              <input type="text" value={hiringManager} onChange={(e) => setHiringManager(e.target.value)} placeholder="e.g. Sarah Thompson" className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <AuthGuard requiredPermission="analysis:run">
              <button onClick={handleAnalyze} disabled={loading || !selectedProfileId || !jobText.trim()} className="mt-5 px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {loading ? "Analysing..." : "Analyse & Match"}
              </button>
            </AuthGuard>
          </div>
        </div>

        {analysis && (
          <div className="space-y-6">
            {/* Match Score + Location */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Match Analysis</h2>
                  <p className="text-sm text-slate-500">{analysis.jobTitle} @ {analysis.company}</p>
                  <p className="text-sm mt-1">
                    <span className="text-slate-400">Location:</span>{" "}
                    <span className="font-medium text-slate-700">{analysis.officeLocation}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-4xl font-bold ${analysis.matchPercentage >= 80 ? "text-green-600" : analysis.matchPercentage >= 60 ? "text-blue-600" : "text-yellow-600"}`}>
                    {analysis.matchPercentage}%
                  </div>
                  <div className="text-xs text-slate-500">Match Score</div>
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 mb-6">
                <div className={`h-3 rounded-full ${analysis.matchPercentage >= 80 ? "bg-green-500" : analysis.matchPercentage >= 60 ? "bg-blue-500" : "bg-yellow-500"}`} style={{ width: `${analysis.matchPercentage}%` }} />
              </div>
              <div className="space-y-3">
                {analysis.matches.map((match, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                    <MatchBadge strength={match.matchStrength} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-slate-700">{match.requirement.category}</div>
                      <div className="text-xs text-slate-500 mt-1">Keywords: {match.requirement.keywords.join(", ")}</div>
                      {match.evidence.slice(0, 2).map((ev, j) => (
                        <div key={j} className="text-xs text-slate-600 pl-3 border-l-2 border-blue-200 mt-1">{ev}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Benefits */}
            {analysis.benefitMatches.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-3">Your Priority Benefits</h2>
                <div className="space-y-2">
                  {analysis.benefitMatches.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                      <span className={`text-lg ${b.found ? "text-green-500" : "text-red-400"}`}>
                        {b.found ? "\u2713" : "\u2717"}
                      </span>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">{b.keyword}</span>
                        <span className="text-xs text-slate-400 ml-2">Priority #{b.priority}</span>
                        {b.found && b.context && (
                          <p className="text-xs text-slate-500 mt-0.5">{b.context}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tailored Summary */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-3">Tailored Executive Summary</h2>
              <p className="text-sm text-slate-600 leading-relaxed bg-blue-50 p-4 rounded-lg border border-blue-100">{analysis.tailoredSummary}</p>
            </div>

            {/* Action Buttons Row */}
            <div className="flex flex-wrap gap-3 justify-center">
              {!companyResearch && (
                <button onClick={handleResearch} disabled={researching} className="px-6 py-3 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-900 disabled:opacity-50 transition-colors text-sm">
                  {researching ? "Researching..." : `Research ${analysis.company}`}
                </button>
              )}
              {!showInterview && (
                <button onClick={handlePrepInterview} className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors text-sm">
                  Prepare Interview Questions
                </button>
              )}
            </div>

            {/* Interview Prep */}
            {showInterview && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Phone Interview Prep</h2>
                <p className="text-xs text-slate-500 mb-4">Fill in answers during or after your call. Saving will trigger hiring manager research if a name is provided.</p>
                {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
                  const catQuestions = interviewNotes.filter((n) => n.category === cat);
                  if (catQuestions.length === 0) return null;
                  return (
                    <div key={cat} className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide">{label}</h3>
                      <div className="space-y-3">
                        {catQuestions.map((note) => {
                          const idx = interviewNotes.indexOf(note);
                          return (
                            <div key={note.questionKey} className="bg-slate-50 p-3 rounded-lg">
                              <p className="text-sm font-medium text-slate-700 mb-1">{note.question}</p>
                              <input
                                type="text"
                                value={note.answer || ""}
                                onChange={(e) => updateNoteAnswer(idx, e.target.value)}
                                placeholder="Enter answer..."
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <button onClick={handleSaveNotes} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 text-sm mt-2">
                  Save Notes & Research Hiring Manager
                </button>
              </div>
            )}

            {/* Hiring Manager Research */}
            {hmResearch && (
              <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-6">
                <h2 className="text-lg font-semibold text-purple-800 mb-3">Hiring Manager: {hmResearch.name}</h2>
                <p className="text-sm text-slate-600 mb-3">{hmResearch.linkedinSummary}</p>
                {hmResearch.knownDrivers.length > 0 && (
                  <div className="mb-3">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1">Known Drivers</h3>
                    <div className="flex flex-wrap gap-1">
                      {hmResearch.knownDrivers.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">{d}</span>
                      ))}
                    </div>
                  </div>
                )}
                {hmResearch.articles.length > 0 && (
                  <div className="mb-3">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1">Articles & Content</h3>
                    {hmResearch.articles.map((a, i) => (
                      <p key={i} className="text-xs text-slate-600">{a.title}</p>
                    ))}
                  </div>
                )}
                <div className="bg-purple-50 p-3 rounded-lg mt-2">
                  <h3 className="text-xs font-semibold text-purple-700 mb-1">Recommended Approach</h3>
                  <p className="text-sm text-purple-800">{hmResearch.recommendedApproach}</p>
                </div>
              </div>
            )}

            {/* Company & Salary Briefing */}
            {companyResearch && salaryResearch && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Recruiter Briefing</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <h3 className="font-medium text-sm text-slate-800 mb-2">Company</h3>
                    <p className="text-xs text-slate-600">{companyResearch.overview}</p>
                    <p className="text-xs text-slate-500 mt-2">Industry: {companyResearch.industry}</p>
                    <p className="text-xs text-slate-500">Culture: {companyResearch.cultureSummary}</p>
                    <p className="text-xs text-slate-500">WFH: {companyResearch.remoteWorkPolicy}</p>
                    <p className="text-xs mt-1">WFH Resistance: <span className={`font-medium ${companyResearch.wfhResistance === "low" ? "text-green-600" : companyResearch.wfhResistance === "high" ? "text-red-600" : "text-yellow-600"}`}>{companyResearch.wfhResistance}</span></p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <h3 className="font-medium text-sm text-slate-800 mb-2">Salary (NZD / AUD)</h3>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>NZ: ${salaryResearch.nzRange.low.toLocaleString()} - ${salaryResearch.nzRange.high.toLocaleString()} (median ${salaryResearch.nzRange.median.toLocaleString()})</p>
                      <p>AU: ${salaryResearch.auRange.low.toLocaleString()} - ${salaryResearch.auRange.high.toLocaleString()} (median ${salaryResearch.auRange.median.toLocaleString()})</p>
                    </div>
                    <h4 className="font-medium text-xs text-slate-700 mt-3 mb-1">Common Benefits</h4>
                    <p className="text-xs text-slate-500">{salaryResearch.commonBenefits.join(", ")}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Download */}
            <AuthGuard requiredPermission="document:download">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
                <h2 className="text-lg font-semibold mb-2">Step 2: Download Documents</h2>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => handleDownload("cv")} disabled={generating !== null || !profile} className="px-5 py-2.5 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 disabled:opacity-50 text-sm">
                    {generating === "cv" ? "..." : "CV (.docx)"}
                  </button>
                  <button onClick={() => handleDownload("letter")} disabled={generating !== null || !profile} className="px-5 py-2.5 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 disabled:opacity-50 text-sm">
                    {generating === "letter" ? "..." : "Cover Letter (.docx)"}
                  </button>
                  {companyResearch && salaryResearch && (
                    <button onClick={() => handleDownload("briefing")} disabled={generating !== null || !profile} className="px-5 py-2.5 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 disabled:opacity-50 text-sm">
                      {generating === "briefing" ? "..." : "Briefing (.docx)"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowEmailModal(true);
                      setEmailSubject(`Application: ${analysis?.jobTitle} — ${profile?.personal.name}`);
                      setEmailMessage(`Dear Hiring Manager,\n\nPlease find attached my CV and cover letter for the ${analysis?.jobTitle} position.\n\nKind regards,\n${profile?.personal.name}`);
                      setEmailResult(null);
                    }}
                    disabled={!profile}
                    className="px-5 py-2.5 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 disabled:opacity-50 text-sm"
                  >
                    Email Application
                  </button>
                  <button
                    onClick={async () => {
                      if (!analysis?.applicationId) return;
                      setGenerating("anki");
                      try {
                        const res = await fetch("/api/anki/generate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ applicationId: analysis.applicationId }),
                        });
                        const data = await res.json();
                        if (data.apkg) {
                          const blob = new Blob([Uint8Array.from(atob(data.apkg), c => c.charCodeAt(0))], { type: "application/octet-stream" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a"); a.href = url;
                          a.download = `${analysis.jobTitle.replace(/\s+/g, "_")}_${analysis.company.replace(/\s+/g, "_")}.apkg`;
                          a.click(); URL.revokeObjectURL(url);
                        }
                        if (data.csv) {
                          const blob = new Blob([Uint8Array.from(atob(data.csv), c => c.charCodeAt(0))], { type: "text/tab-separated-values" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a"); a.href = url;
                          a.download = `${analysis.jobTitle.replace(/\s+/g, "_")}_${analysis.company.replace(/\s+/g, "_")}_anki.txt`;
                          a.click(); URL.revokeObjectURL(url);
                        }
                      } catch (e) { console.error(e); }
                      setGenerating(null);
                    }}
                    disabled={generating !== null || !analysis?.applicationId}
                    className="px-5 py-2.5 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 disabled:opacity-50 text-sm"
                  >
                    {generating === "anki" ? "..." : "Anki Deck"}
                  </button>
                </div>
              </div>
            </AuthGuard>

            {/* Email Modal */}
            {showEmailModal && analysis && profile && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Email Application</h2>
                {emailResult && (
                  <div className={`mb-4 p-3 rounded-lg text-sm ${emailResult.success ? "bg-green-50 dark:bg-green-900/20 border border-green-200 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-300"}`}>
                    {emailResult.success ? "Email sent successfully!" : `Failed: ${emailResult.error}`}
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">To</label>
                    <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="recruiter@company.com" className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Subject</label>
                    <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Message</label>
                    <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={4} className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <p className="text-xs text-slate-400">CV and cover letter will be attached as .docx files.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!emailTo) return;
                        setEmailSending(true);
                        setEmailResult(null);
                        try {
                          // Generate docs as base64
                          const cvDoc = generateCV(analysis, profile);
                          const letterDoc = generateCoverLetter(analysis, profile, hiringManager || undefined);
                          const cvBlob = await Packer.toBlob(cvDoc);
                          const letterBlob = await Packer.toBlob(letterDoc);
                          const toBase64 = (blob: Blob) => new Promise<string>((res) => {
                            const reader = new FileReader();
                            reader.onload = () => res((reader.result as string).split(",")[1]);
                            reader.readAsDataURL(blob);
                          });
                          const cvB64 = await toBase64(cvBlob);
                          const letterB64 = await toBase64(letterBlob);
                          const safeName = profile.personal.name.replace(/\s+/g, "_");
                          const result = await fetch("/api/email/send", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              to: emailTo,
                              subject: emailSubject,
                              message: emailMessage,
                              applicationId: analysis.applicationId,
                              attachments: [
                                { filename: `${safeName}_CV.docx`, base64: cvB64, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
                                { filename: `${safeName}_Cover_Letter.docx`, base64: letterB64, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
                              ],
                            }),
                          });
                          setEmailResult(await result.json());
                        } catch (e) {
                          setEmailResult({ success: false, error: "Send failed" });
                        }
                        setEmailSending(false);
                      }}
                      disabled={emailSending || !emailTo}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {emailSending ? "Sending..." : "Send Email"}
                    </button>
                    <button onClick={() => setShowEmailModal(false)} className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
