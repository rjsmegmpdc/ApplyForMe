"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import type { AnalysisResult } from "@/lib/job-analyzer";
import type { UserProfile, CompanyResearch, SalaryResearch } from "@/lib/types";
import { generateCV, generateCoverLetter, generateBriefing } from "@/lib/docx-generator";
import { Packer } from "docx";
import Link from "next/link";

interface ApplicationDetail {
  id: string;
  userId: string;
  jobTitle: string | null;
  company: string | null;
  matchPercentage: number | null;
  officeLocation: string | null;
  hiringManagerName: string | null;
  analysisJson: string | null;
  briefingJson: string | null;
  salaryJson: string | null;
  createdAt: string;
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const appId = params.id as string;

  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [companyResearch, setCompanyResearch] = useState<CompanyResearch | null>(null);
  const [salaryResearch, setSalaryResearch] = useState<SalaryResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${appId}`)
      .then((r) => r.json())
      .then(async (data) => {
        setApp(data);
        if (data.analysisJson) {
          const parsed = JSON.parse(data.analysisJson);
          setAnalysis(parsed);
        }
        if (data.briefingJson) setCompanyResearch(JSON.parse(data.briefingJson));
        if (data.salaryJson) setSalaryResearch(JSON.parse(data.salaryJson));

        // Load the profile for document re-generation
        if (data.userId) {
          const profileRes = await fetch(`/api/profiles/${data.userId}`);
          if (profileRes.ok) setProfile(await profileRes.json());
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [appId]);

  const handleDownload = useCallback(
    async (type: "cv" | "letter" | "briefing") => {
      if (!analysis || !profile) return;
      setGenerating(type);
      try {
        let doc;
        let filename;
        const safeName = profile.personal.name.replace(/\s+/g, "_");
        const safeCompany = (app?.company || "Unknown").replace(/\s+/g, "_");
        if (type === "cv") {
          doc = generateCV(analysis, profile);
          filename = `${safeName}_CV_${safeCompany}.docx`;
        } else if (type === "letter") {
          doc = generateCoverLetter(analysis, profile, app?.hiringManagerName || undefined);
          filename = `${safeName}_Cover_Letter_${safeCompany}.docx`;
        } else {
          if (!companyResearch || !salaryResearch) return;
          doc = generateBriefing(analysis, profile, companyResearch, salaryResearch);
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
    [analysis, profile, app, companyResearch, salaryResearch]
  );

  if (loading) return <div className="max-w-4xl mx-auto px-6 py-8 text-slate-500">Loading...</div>;
  if (!app) return <div className="max-w-4xl mx-auto px-6 py-8 text-red-500">Application not found</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{app.jobTitle || "Untitled"}</h1>
          <p className="text-sm text-slate-500">
            {app.company || "Unknown"} &middot; {new Date(app.createdAt).toLocaleDateString("en-NZ")}
            {app.officeLocation && ` \u00b7 ${app.officeLocation}`}
          </p>
        </div>
        <Link href="/history" className="text-sm text-slate-500 hover:text-slate-700">Back to History</Link>
      </div>

      {/* Match Score */}
      {analysis && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Match Analysis</h2>
            <div className={`text-3xl font-bold ${(app.matchPercentage || 0) >= 80 ? "text-green-600" : (app.matchPercentage || 0) >= 60 ? "text-blue-600" : "text-yellow-600"}`}>
              {app.matchPercentage}%
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 mb-4">
            <div className={`h-3 rounded-full ${(app.matchPercentage || 0) >= 80 ? "bg-green-500" : (app.matchPercentage || 0) >= 60 ? "bg-blue-500" : "bg-yellow-500"}`} style={{ width: `${app.matchPercentage || 0}%` }} />
          </div>

          {/* Requirements */}
          <div className="space-y-2">
            {analysis.matches.map((match, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded bg-slate-50">
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${
                  match.matchStrength === "strong" ? "bg-green-100 text-green-800 border-green-200" :
                  match.matchStrength === "moderate" ? "bg-blue-100 text-blue-800 border-blue-200" :
                  match.matchStrength === "weak" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                  "bg-red-100 text-red-800 border-red-200"
                }`}>{match.matchStrength.toUpperCase()}</span>
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-700">{match.requirement.category}</span>
                  <span className="text-xs text-slate-400 ml-2">{match.requirement.keywords.join(", ")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tailored Summary */}
      {analysis?.tailoredSummary && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Tailored Summary</h2>
          <p className="text-sm text-slate-600 leading-relaxed bg-blue-50 p-4 rounded-lg border border-blue-100">{analysis.tailoredSummary}</p>
        </div>
      )}

      {/* Benefits Match */}
      {analysis?.benefitMatches && analysis.benefitMatches.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Priority Benefits</h2>
          <div className="space-y-2">
            {analysis.benefitMatches.map((b, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded bg-slate-50">
                <span className={`text-lg ${b.found ? "text-green-500" : "text-red-400"}`}>{b.found ? "\u2713" : "\u2717"}</span>
                <span className="text-sm text-slate-700">{b.keyword}</span>
                <span className="text-xs text-slate-400">#{b.priority}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Re-download */}
      {profile && analysis && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
          <h2 className="text-lg font-semibold mb-2">Re-download Documents</h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => handleDownload("cv")} disabled={generating !== null} className="px-5 py-2.5 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 disabled:opacity-50 text-sm">
              {generating === "cv" ? "..." : "CV (.docx)"}
            </button>
            <button onClick={() => handleDownload("letter")} disabled={generating !== null} className="px-5 py-2.5 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 disabled:opacity-50 text-sm">
              {generating === "letter" ? "..." : "Cover Letter (.docx)"}
            </button>
            {companyResearch && salaryResearch && (
              <button onClick={() => handleDownload("briefing")} disabled={generating !== null} className="px-5 py-2.5 bg-white/20 text-white border border-white/30 rounded-lg font-medium hover:bg-white/30 disabled:opacity-50 text-sm">
                {generating === "briefing" ? "..." : "Briefing (.docx)"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
