"use client";

import { useState, useEffect } from "react";

interface AnalyticsData {
  totalApplications: number;
  appliedCount: number;
  analysedCount: number;
  avgMatch: number;
  highMatchCount: number;
  weeklyData: { week: string; count: number }[];
  topCompanies: { name: string; count: number }[];
  distribution: { high: number; medium: number; low: number };
  profileCount: number;
  recruiterCount: number;
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-8 text-slate-500">Loading analytics...</div>;
  if (!data) return <div className="max-w-5xl mx-auto px-6 py-8 text-red-500">Failed to load analytics</div>;

  const maxWeekly = Math.max(...data.weeklyData.map((w) => w.count), 1);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total Applications" value={data.totalApplications} />
        <KpiCard label="Applied" value={data.appliedCount} sub={`${data.analysedCount} analysed only`} />
        <KpiCard label="Avg Match" value={`${data.avgMatch}%`} sub={`${data.highMatchCount} above 80%`} />
        <KpiCard label="Profiles" value={data.profileCount} sub={`${data.recruiterCount} recruiter contacts`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Weekly Activity Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">Applications per Week</h2>
          <div className="flex items-end gap-2 h-32">
            {data.weeklyData.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-blue-500 dark:bg-blue-400 rounded-t"
                  style={{ height: `${(w.count / maxWeekly) * 100}%`, minHeight: w.count > 0 ? "4px" : "0" }}
                />
                <span className="text-[10px] text-slate-400">{w.week}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Match Distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">Match Score Distribution</h2>
          <div className="space-y-3">
            <DistributionBar label="80%+" count={data.distribution.high} total={data.totalApplications} color="bg-green-500" />
            <DistributionBar label="60-79%" count={data.distribution.medium} total={data.totalApplications} color="bg-blue-500" />
            <DistributionBar label="<60%" count={data.distribution.low} total={data.totalApplications} color="bg-yellow-500" />
          </div>
        </div>

        {/* Top Companies */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">Top Companies</h2>
          {data.topCompanies.length === 0 ? (
            <p className="text-sm text-slate-500">No applications yet</p>
          ) : (
            <div className="space-y-2">
              {data.topCompanies.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{c.name}</span>
                  <span className="text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">Pipeline</h2>
          <div className="space-y-3">
            <PipelineStage label="Analysed" count={data.analysedCount} color="text-blue-600 dark:text-blue-400" />
            <PipelineStage label="Applied" count={data.appliedCount} color="text-green-600 dark:text-green-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PipelineStage({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`text-2xl font-bold ${color}`}>{count}</span>
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  );
}
