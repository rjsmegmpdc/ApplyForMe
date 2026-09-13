"use client";

import { useState, useEffect } from "react";
import { useUserId } from "@/components/AuthGuard";
import Link from "next/link";

interface BatchResult {
  applicationId: string;
  label: string;
  jobTitle: string;
  company: string;
  matchPercentage: number;
  officeLocation: string;
  strongMatches: number;
  totalRequirements: number;
  missingSkills: string[];
  benefitMatches: number;
  totalBenefits: number;
}

export default function BatchPage() {
  const userId = useUserId();
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [jobsText, setJobsText] = useState("");
  const [results, setResults] = useState<BatchResult[]>([]);
  const [loading, setLoading] = useState(false);

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

  const handleBatchAnalyze = async () => {
    if (!selectedProfileId || !jobsText.trim()) return;
    setLoading(true);
    setResults([]);

    // Split by separator lines (--- or ===)
    const jobBlocks = jobsText
      .split(/\n[-=]{3,}\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 50);

    if (jobBlocks.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/batch-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selectedProfileId,
          jobs: jobBlocks.map((text, i) => ({ text, label: `Job ${i + 1}` })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Batch Analysis</h1>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Paste multiple job descriptions separated by a line of dashes (---) or equals (===). Each will be analysed and ranked by match score.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Profile</label>
          <select value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)} className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Select profile...</option>
            {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </div>

        <textarea
          value={jobsText}
          onChange={(e) => setJobsText(e.target.value)}
          placeholder={"Paste Job 1 here...\n---\nPaste Job 2 here...\n---\nPaste Job 3 here..."}
          className="w-full h-64 p-4 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-mono bg-white dark:bg-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleBatchAnalyze}
            disabled={loading || !selectedProfileId || !jobsText.trim()}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Analysing..." : "Analyse All & Rank"}
          </button>
          <span className="text-xs text-slate-400">
            {jobsText.split(/\n[-=]{3,}\n/).filter((b) => b.trim().length > 50).length} job(s) detected
          </span>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Ranked Results ({results.length} jobs)</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">#</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Role</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Company</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Location</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Match</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Strong</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Benefits</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.applicationId} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="py-3 px-4 text-slate-400 font-medium">{i + 1}</td>
                  <td className="py-3 px-4 font-medium text-slate-800 dark:text-white">{r.jobTitle}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{r.company}</td>
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs">{r.officeLocation}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                      r.matchPercentage >= 80 ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                      : r.matchPercentage >= 60 ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                      : "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300"
                    }`}>{r.matchPercentage}%</span>
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-slate-500 dark:text-slate-400">{r.strongMatches}/{r.totalRequirements}</td>
                  <td className="py-3 px-4 text-right text-xs text-slate-500 dark:text-slate-400">{r.benefitMatches}/{r.totalBenefits}</td>
                  <td className="py-3 px-4">
                    <Link href={`/history/${r.applicationId}`} className="text-xs text-blue-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
