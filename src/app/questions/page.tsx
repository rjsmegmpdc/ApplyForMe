"use client";

import { useState, useEffect, useCallback } from "react";
import { CLOSING_QUESTIONS, type Flashcard } from "@/lib/anki/flashcard-generator";
import { useUserRole } from "@/components/AuthGuard";

interface Pref {
  rating: number;
  favourite: boolean;
  excluded: boolean;
  notes: string | null;
}

interface CustomQ {
  id: string;
  question: string;
  desiredOutcome: string | null;
  category: string;
  basedOnKey: string | null;
  status: string;
  moderationNote: string | null;
  rating: number;
  favourite: boolean;
  excluded: boolean;
  includeInDeck: boolean;
  user?: { name: string };
}

interface ModerationIssue {
  type: string;
  severity: string;
  detail: string;
}

const CATEGORIES: Record<string, string> = {
  "pre-close": "Pre-Close & Success Framing",
  "real-role": "Reveal the Real Role",
  "culture": "Reveal Culture & Leadership",
  "seniority": "Signal Seniority",
  "memorable": "Create Memorable Impression",
};

function getCategoryFromTags(tags: string[]): string {
  for (const tag of tags) {
    if (CATEGORIES[tag]) return tag;
  }
  return "other";
}

export default function QuestionsPage() {
  const role = useUserRole();
  const [prefs, setPrefs] = useState<Record<string, Pref>>({});
  const [customQs, setCustomQs] = useState<CustomQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  // Custom question form
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customOutcome, setCustomOutcome] = useState("");
  const [customCategory, setCustomCategory] = useState("custom");
  const [customBasedOn, setCustomBasedOn] = useState("");
  const [modErrors, setModErrors] = useState<ModerationIssue[]>([]);
  const [modSuggestion, setModSuggestion] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/question-prefs").then((r) => r.json()),
      fetch("/api/custom-questions").then((r) => r.json()),
    ]).then(([prefsData, customData]) => {
      setPrefs(prefsData);
      setCustomQs(Array.isArray(customData) ? customData : []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleAddCustom = async () => {
    if (!customText.trim()) return;
    setSaving(true);
    setModErrors([]);
    setModSuggestion("");
    try {
      const res = await fetch("/api/custom-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: customText,
          desiredOutcome: customOutcome || null,
          category: customCategory,
          basedOnKey: customBasedOn || null,
        }),
      });
      const data = await res.json();
      if (res.status === 422) {
        setModErrors(data.moderation?.issues || []);
        setModSuggestion(data.suggestion || "");
      } else if (res.ok) {
        setCustomQs([data, ...customQs]);
        setCustomText("");
        setCustomOutcome("");
        setCustomCategory("custom");
        setCustomBasedOn("");
        setShowAddCustom(false);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleModerateCustom = async (id: string, action: string) => {
    const res = await fetch(`/api/custom-questions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderationAction: action }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCustomQs(customQs.map((q) => (q.id === id ? { ...q, status: updated.status } : q)));
    }
  };

  const handleDeleteCustom = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await fetch(`/api/custom-questions/${id}`, { method: "DELETE" });
    setCustomQs(customQs.filter((q) => q.id !== id));
  };

  const updatePref = useCallback(async (questionKey: string, updates: Partial<Pref>) => {
    // Optimistic update
    setPrefs((prev) => ({
      ...prev,
      [questionKey]: { ...{ rating: 0, favourite: false, excluded: false, notes: null }, ...prev[questionKey], ...updates },
    }));

    await fetch("/api/question-prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey, ...updates }),
    }).catch(console.error);
  }, []);

  const saveNotes = useCallback(async (questionKey: string) => {
    await updatePref(questionKey, { notes: noteText || null });
    setEditingNotes(null);
    setNoteText("");
  }, [noteText, updatePref]);

  // Group by category
  const grouped: Record<string, (Flashcard & { pref: Pref })[]> = {};
  for (const q of CLOSING_QUESTIONS) {
    const cat = getCategoryFromTags(q.tags);
    if (!grouped[cat]) grouped[cat] = [];
    const pref = (q.key && prefs[q.key]) || { rating: 0, favourite: false, excluded: false, notes: null };
    grouped[cat].push({ ...q, pref });
  }

  if (loading) return <div className="max-w-4xl mx-auto px-6 py-8 text-slate-500 dark:text-slate-400">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Interview Questions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Rate, favourite, and choose which closing questions appear in your Anki decks. Excluded questions won&apos;t be generated.
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2">
          <span className="text-xs text-slate-500">Total</span>
          <span className="ml-2 font-bold text-slate-800 dark:text-white">{CLOSING_QUESTIONS.length}</span>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 px-4 py-2">
          <span className="text-xs text-yellow-700 dark:text-yellow-300">Favourites</span>
          <span className="ml-2 font-bold text-yellow-700 dark:text-yellow-300">
            {Object.values(prefs).filter((p) => p.favourite).length}
          </span>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 px-4 py-2">
          <span className="text-xs text-red-600 dark:text-red-400">Excluded</span>
          <span className="ml-2 font-bold text-red-600 dark:text-red-400">
            {Object.values(prefs).filter((p) => p.excluded).length}
          </span>
        </div>
      </div>

      {Object.entries(CATEGORIES).map(([catKey, catLabel]) => {
        const questions = grouped[catKey];
        if (!questions || questions.length === 0) return null;

        return (
          <div key={catKey} className="mb-8">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-3">{catLabel}</h2>
            <div className="space-y-3">
              {questions.map((q) => {
                const key = q.key!;
                const p = q.pref;
                const isExcluded = p.excluded;

                return (
                  <div
                    key={key}
                    className={`bg-white dark:bg-slate-800 rounded-xl border p-4 transition-opacity ${
                      isExcluded
                        ? "border-red-200 dark:border-red-800 opacity-50"
                        : p.favourite
                        ? "border-yellow-300 dark:border-yellow-700"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-medium text-sm text-slate-800 dark:text-white">{q.front}</h3>
                        <p
                          className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: q.back.split("<br><br><b>Why this works:</b>")[0] }}
                        />
                      </div>

                      {/* Favourite toggle */}
                      <button
                        onClick={() => updatePref(key, { favourite: !p.favourite })}
                        className={`text-lg shrink-0 ${p.favourite ? "text-yellow-500" : "text-slate-300 dark:text-slate-600 hover:text-yellow-400"}`}
                        title={p.favourite ? "Remove favourite" : "Mark as favourite"}
                      >
                        {p.favourite ? "\u2605" : "\u2606"}
                      </button>
                    </div>

                    {/* Rating + actions */}
                    <div className="flex items-center gap-4 mt-3">
                      {/* Star rating 1-5 */}
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => updatePref(key, { rating: p.rating === star ? 0 : star })}
                            className={`text-sm ${star <= p.rating ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}`}
                          >
                            {star <= p.rating ? "\u25cf" : "\u25cb"}
                          </button>
                        ))}
                        <span className="text-xs text-slate-400 ml-1">{p.rating > 0 ? `${p.rating}/5` : ""}</span>
                      </div>

                      <div className="flex-1" />

                      {/* Notes */}
                      <button
                        onClick={() => {
                          if (editingNotes === key) { setEditingNotes(null); }
                          else { setEditingNotes(key); setNoteText(p.notes || ""); }
                        }}
                        className="text-xs text-slate-400 hover:text-blue-500"
                      >
                        {p.notes ? "Edit notes" : "+ Notes"}
                      </button>

                      {/* Exclude toggle */}
                      <button
                        onClick={() => updatePref(key, { excluded: !isExcluded })}
                        className={`text-xs px-2 py-0.5 rounded ${
                          isExcluded
                            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-500"
                        }`}
                      >
                        {isExcluded ? "Excluded \u2013 click to restore" : "Exclude from deck"}
                      </button>
                    </div>

                    {/* Notes editor */}
                    {editingNotes === key && (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveNotes(key)}
                          placeholder="Personal notes about this question..."
                          className="flex-1 p-2 border border-slate-200 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button onClick={() => saveNotes(key)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs">Save</button>
                      </div>
                    )}

                    {/* Saved notes display */}
                    {p.notes && editingNotes !== key && (
                      <p className="mt-2 text-xs text-blue-600 dark:text-blue-400 italic">{p.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ─── Custom Questions ─── */}
      <div className="mt-10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Your Custom Questions</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Create your own questions or customise existing ones. All submissions pass through a content filter before being included in Anki decks.
            </p>
          </div>
          <button
            onClick={() => setShowAddCustom(!showAddCustom)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            {showAddCustom ? "Cancel" : "+ New Question"}
          </button>
        </div>

        {/* Add form */}
        {showAddCustom && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-4">
            {modErrors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">Content issues found:</p>
                {modErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">
                    <span className={`font-bold ${e.severity === "block" ? "text-red-700" : "text-amber-600"}`}>{e.severity === "block" ? "BLOCKED" : "WARNING"}:</span> {e.detail}
                  </p>
                ))}
                {modSuggestion && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-500">Suggested version:</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 italic mt-1">{modSuggestion}</p>
                    <button onClick={() => setCustomText(modSuggestion)} className="text-xs text-blue-600 underline mt-1">Use suggestion</button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Question *</label>
                <textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  rows={2}
                  placeholder="What question would you ask the interviewer?"
                  className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Desired Outcome (what you hope to learn)</label>
                <textarea
                  value={customOutcome}
                  onChange={(e) => setCustomOutcome(e.target.value)}
                  rows={2}
                  placeholder="What insight should this question surface? What are you really trying to find out?"
                  className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Category</label>
                  <select value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="custom">Custom</option>
                    <option value="pre-close">Pre-Close & Success Framing</option>
                    <option value="real-role">Reveal the Real Role</option>
                    <option value="culture">Culture & Leadership</option>
                    <option value="seniority">Signal Seniority</option>
                    <option value="memorable">Memorable Impression</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Based on (optional — customising existing)</label>
                  <select value={customBasedOn} onChange={(e) => setCustomBasedOn(e.target.value)} className="w-full p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Original question</option>
                    {CLOSING_QUESTIONS.filter((q) => q.key).map((q) => (
                      <option key={q.key} value={q.key}>{q.front}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button onClick={handleAddCustom} disabled={saving || !customText.trim()} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Checking..." : "Submit for Review"}
              </button>
            </div>
          </div>
        )}

        {/* Custom questions list */}
        <div className="space-y-3">
          {customQs.length === 0 && !showAddCustom && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No custom questions yet. Click &quot;+ New Question&quot; to create one.</p>
          )}
          {customQs.map((cq) => (
            <div key={cq.id} className={`bg-white dark:bg-slate-800 rounded-xl border p-4 ${
              cq.status === "approved" ? "border-green-200 dark:border-green-800" :
              cq.status === "rejected" ? "border-red-200 dark:border-red-800 opacity-50" :
              cq.status === "needs_review" ? "border-amber-200 dark:border-amber-800" :
              "border-slate-200 dark:border-slate-700"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      cq.status === "approved" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                      cq.status === "rejected" ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                      cq.status === "needs_review" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" :
                      "bg-slate-100 dark:bg-slate-700 text-slate-500"
                    }`}>{cq.status.replace("_", " ")}</span>
                    {cq.basedOnKey && <span className="text-[10px] text-slate-400">customised from library</span>}
                    {cq.user?.name && role === "ADMIN" && <span className="text-[10px] text-slate-400">by {cq.user.name}</span>}
                  </div>
                  <h3 className="font-medium text-sm text-slate-800 dark:text-white">{cq.question}</h3>
                  {cq.desiredOutcome && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1"><b>Desired outcome:</b> {cq.desiredOutcome}</p>
                  )}
                  {cq.moderationNote && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">Moderation: {cq.moderationNote}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {/* Admin moderation actions */}
                  {role === "ADMIN" && cq.status !== "approved" && (
                    <button onClick={() => handleModerateCustom(cq.id, "approved")} className="text-[10px] px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded hover:bg-green-200">Approve</button>
                  )}
                  {role === "ADMIN" && cq.status !== "rejected" && (
                    <button onClick={() => handleModerateCustom(cq.id, "rejected")} className="text-[10px] px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200">Reject</button>
                  )}
                  <button onClick={() => handleDeleteCustom(cq.id)} className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded hover:bg-red-100 hover:text-red-500">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
