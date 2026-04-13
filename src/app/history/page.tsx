"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useUserId } from "@/components/AuthGuard";
import Link from "next/link";

interface AppSummary {
  id: string;
  jobTitle: string | null;
  company: string | null;
  matchPercentage: number | null;
  createdAt: string;
  user: { name: string };
}

export default function HistoryPage() {
  const userId = useUserId();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/applications?userId=${userId}`)
      .then((r) => r.json())
      .then(setApps)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Application History</h1>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : apps.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500">No applications yet. Analyse a job to get started.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Role</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Company</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">Match</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/history/${app.id}`}>
                  <td className="py-3 px-4 text-slate-500">
                    {new Date(app.createdAt).toLocaleDateString("en-NZ")}
                  </td>
                  <td className="py-3 px-4 font-medium text-blue-700 hover:underline">
                    <Link href={`/history/${app.id}`}>{app.jobTitle || "Untitled"}</Link>
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {app.company || "Unknown"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        (app.matchPercentage || 0) >= 80
                          ? "bg-green-100 text-green-700"
                          : (app.matchPercentage || 0) >= 60
                          ? "bg-blue-100 text-blue-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {app.matchPercentage}%
                    </span>
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
