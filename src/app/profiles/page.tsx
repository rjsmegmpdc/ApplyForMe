"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { AuthGuard, useUserRole } from "@/components/AuthGuard";
import Link from "next/link";

interface ProfileSummary {
  id: string;
  name: string;
  email: string | null;
  role: string;
  updatedAt: string;
  applicationCount: number;
}

export default function ProfilesPage() {
  const { data: session } = useSession();
  const role = useUserRole();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then(setProfiles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this profile and all its data?")) return;
    await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    setProfiles((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Profiles</h1>
        <AuthGuard requiredPermission="profile:edit_own">
          <div className="flex gap-2">
            {profiles.length < 10 && (
              <Link
                href="/profiles/new"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                + Add Profile
              </Link>
            )}
          </div>
        </AuthGuard>
      </div>

      {profiles.length >= 10 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          Maximum 10 profiles reached.
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500">No profiles yet.</p>
          <Link href="/register" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
            Create your first profile
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">{p.name}</h3>
                <p className="text-sm text-slate-500">
                  {p.email || "No email"} &middot; {p.applicationCount} application{p.applicationCount !== 1 ? "s" : ""}
                  &middot; Role: <span className="font-medium">{p.role}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <AuthGuard requiredPermission="profile:edit_own">
                  <Link
                    href={`/profiles/${p.id}`}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    Edit
                  </Link>
                </AuthGuard>
                <AuthGuard requiredPermission="profile:delete">
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                </AuthGuard>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
