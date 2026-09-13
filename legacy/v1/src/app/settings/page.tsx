"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "@/components/ThemeContext";
import { AuthGuard, useUserRole } from "@/components/AuthGuard";

export default function SettingsPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const role = useUserRole();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleDeleteEverything = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/settings/reset", { method: "DELETE" });
      if (res.ok) {
        // Sign out and redirect to register
        await signOut({ callbackUrl: "/register" });
      } else {
        const data = await res.json();
        alert(data.error || "Delete failed");
      }
    } catch {
      alert("Delete failed");
    }
    setDeleting(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Settings</h1>

      {/* Account Info */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3">Account</h2>
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
          <p><span className="text-slate-400">Name:</span> {session?.user?.name}</p>
          <p><span className="text-slate-400">Email:</span> {session?.user?.email}</p>
          <p><span className="text-slate-400">Role:</span> {role}</p>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3">Appearance</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-300">Theme:</label>
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setTheme("light")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                theme === "light"
                  ? "bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                theme === "dark"
                  ? "bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Dark
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <AuthGuard requiredPermission="user:manage">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-red-200 dark:border-red-800 p-6">
          <h2 className="text-base font-semibold text-red-700 dark:text-red-400 mb-2">Danger Zone</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Permanently delete all data — every profile, application, interview note, and account. This cannot be undone.
          </p>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Delete Everything
            </button>
          ) : (
            <div className="space-y-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                Type DELETE to confirm permanent deletion of all data:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full p-2.5 border border-red-300 dark:border-red-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteEverything}
                  disabled={confirmText !== "DELETE" || deleting}
                  className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting..." : "Confirm Delete Everything"}
                </button>
                <button
                  onClick={() => { setConfirmDelete(false); setConfirmText(""); }}
                  className="px-5 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </AuthGuard>
    </div>
  );
}
