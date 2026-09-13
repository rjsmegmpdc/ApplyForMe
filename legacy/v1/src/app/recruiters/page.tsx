"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  agency: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  lastContacted: string | null;
  followUpDate: string | null;
  status: string;
}

export default function RecruitersPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", agency: "", notes: "", followUpDate: "" });

  useEffect(() => {
    fetch("/api/recruiters").then((r) => r.json()).then(setContacts).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    const res = await fetch("/api/recruiters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const contact = await res.json();
      setContacts([contact, ...contacts]);
      setForm({ name: "", email: "", phone: "", company: "", agency: "", notes: "", followUpDate: "" });
      setShowAdd(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/recruiters/${id}`, { method: "DELETE" });
    setContacts(contacts.filter((c) => c.id !== id));
  };

  const handleMarkContacted = async (id: string) => {
    const res = await fetch(`/api/recruiters/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastContacted: new Date().toISOString() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setContacts(contacts.map((c) => (c.id === id ? updated : c)));
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const overdue = contacts.filter((c) => c.followUpDate && c.followUpDate.split("T")[0] <= today && c.status === "active");

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Recruiter Contacts</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          {showAdd ? "Cancel" : "+ Add Contact"}
        </button>
      </div>

      {/* Overdue follow-ups */}
      {overdue.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {overdue.length} follow-up{overdue.length > 1 ? "s" : ""} overdue:
            {" "}{overdue.map((c) => c.name).join(", ")}
          </p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-4">New Contact</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name *" className="p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company / Client" className="p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} placeholder="Agency (if applicable)" className="p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} className="p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes..." rows={2} className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={handleAdd} disabled={!form.name.trim()} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Save Contact</button>
        </div>
      )}

      {/* Contact list */}
      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500">No recruiter contacts yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => (
            <div key={c.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-white">{c.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {[c.agency, c.company].filter(Boolean).join(" \u00b7 ") || "No company"}
                    {c.email && ` \u00b7 ${c.email}`}
                    {c.phone && ` \u00b7 ${c.phone}`}
                  </p>
                  {c.notes && <p className="text-xs text-slate-400 mt-1">{c.notes}</p>}
                  <div className="flex gap-3 mt-2 text-xs text-slate-400">
                    {c.lastContacted && <span>Last contact: {new Date(c.lastContacted).toLocaleDateString("en-NZ")}</span>}
                    {c.followUpDate && (
                      <span className={c.followUpDate.split("T")[0] <= today ? "text-amber-600 font-medium" : ""}>
                        Follow up: {new Date(c.followUpDate).toLocaleDateString("en-NZ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleMarkContacted(c.id)} className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">Contacted</button>
                  <button onClick={() => handleDelete(c.id)} className="px-2 py-1 text-xs border border-red-200 dark:border-red-700 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
