"use client";

import { useState, useEffect, useCallback } from "react";
import { CLOSING_QUESTIONS, type Flashcard } from "@/lib/anki/flashcard-generator";

interface Pref {
  rating: number;
  favourite: boolean;
  excluded: boolean;
  notes: string | null;
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
  const [prefs, setPrefs] = useState<Record<string, Pref>>({});
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    fetch("/api/question-prefs")
      .then((r) => r.json())
      .then(setPrefs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
    </div>
  );
}
