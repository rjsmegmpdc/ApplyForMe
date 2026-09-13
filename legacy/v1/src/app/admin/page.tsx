"use client";

import { useState, useEffect } from "react";
import { AuthGuard, useUserRole } from "@/components/AuthGuard";

interface UserInfo {
  id: string;
  name: string;
  email: string | null;
  role: string;
  updatedAt: string;
  applicationCount: number;
}

export default function AdminPage() {
  const role = useUserRole();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        const updated = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update role");
      }
    } catch {
      alert("Failed to update role");
    }
  };

  if (role !== "ADMIN") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-red-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">User Management</h1>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Email</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Applications</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 dark:border-slate-700">
                  <td className="py-3 px-4 font-medium text-slate-800 dark:text-white">{user.name}</td>
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{user.email || "—"}</td>
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{user.applicationCount}</td>
                  <td className="py-3 px-4">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        user.role === "ADMIN"
                          ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700"
                          : user.role === "USER"
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600"
                      }`}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="USER">USER</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Role Permissions</h3>
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p><span className="font-medium text-purple-600 dark:text-purple-400">ADMIN</span> — Full access: manage all profiles, users, roles, delete data</p>
          <p><span className="font-medium text-blue-600 dark:text-blue-400">USER</span> — Own profile: edit, run analysis, download documents, import files</p>
          <p><span className="font-medium text-slate-600 dark:text-slate-300">VIEWER</span> — Read-only: view own profile and applications, no editing or downloads</p>
        </div>
      </div>
    </div>
  );
}
