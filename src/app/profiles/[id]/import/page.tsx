"use client";

import { useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import type { UserProfile, CareerRole, CertificationEntry } from "@/lib/types";

export default function ImportPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<Partial<UserProfile> | null>(null);

  // Editable parsed fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [summary, setSummary] = useState("");
  const [competencies, setCompetencies] = useState<string[]>([]);
  const [careerHistory, setCareerHistory] = useState<CareerRole[]>([]);
  const [certifications, setCertifications] = useState<CertificationEntry[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    setParsed(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/profiles/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        setUploading(false);
        return;
      }
      const p = data.profile as Partial<UserProfile>;
      setParsed(p);
      setName(p.personal?.name || "");
      setEmail(p.personal?.email || "");
      setPhone(p.personal?.phone || "");
      setAddress(p.personal?.address || "");
      setSummary(p.executive_summary || "");
      setCompetencies(p.core_competencies || []);
      setCareerHistory(p.career_history || []);
      setCertifications(p.certifications_and_training || []);
    } catch {
      setError("Upload failed");
    }
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/profiles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personal: {
            name,
            email,
            phone,
            address,
            linkedin: "",
            nationality: parsed?.personal?.nationality || "",
            years_experience: parsed?.personal?.years_experience || 0,
          },
          executive_summary: summary,
          core_competencies: competencies,
          career_history: careerHistory,
          certifications_and_training: certifications,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Save failed");
        setSaving(false);
        return;
      }
      router.push(`/profiles/${id}`);
    } catch {
      setError("Save failed");
    }
    setSaving(false);
  };

  const removeCompetency = (i: number) => setCompetencies(competencies.filter((_, j) => j !== i));
  const removeCareer = (i: number) => setCareerHistory(careerHistory.filter((_, j) => j !== i));
  const removeCert = (i: number) => setCertifications(certifications.filter((_, j) => j !== i));

  const updateHighlight = (roleIdx: number, hlIdx: number, value: string) => {
    setCareerHistory(careerHistory.map((r, i) =>
      i === roleIdx ? { ...r, highlights: r.highlights.map((h, j) => (j === hlIdx ? value : h)) } : r
    ));
  };

  const removeHighlight = (roleIdx: number, hlIdx: number) => {
    setCareerHistory(careerHistory.map((r, i) =>
      i === roleIdx ? { ...r, highlights: r.highlights.filter((_, j) => j !== hlIdx) } : r
    ));
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Import Profile Data</h1>
        <button onClick={() => router.push(`/profiles/${id}`)} className="text-sm text-slate-500 hover:text-slate-700">
          Back to Profile
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Upload Section */}
      {!parsed && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Upload a File</h2>
          <p className="text-sm text-slate-500 mb-4">Supported: .docx, .xlsx, .json, .md, .txt</p>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
          >
            <input ref={fileRef} type="file" accept=".docx,.xlsx,.xls,.json,.md,.txt" onChange={handleFileSelect} className="hidden" />
            {file ? (
              <div>
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-500">Click to select a file or drag and drop</p>
                <p className="text-xs text-slate-400 mt-1">.docx, .xlsx, .json, .md, .txt</p>
              </div>
            )}
          </div>

          {file && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Parsing..." : "Upload & Parse"}
            </button>
          )}
        </div>
      )}

      {/* Preview & Edit Parsed Data */}
      {parsed && (
        <div className="space-y-6">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            File parsed successfully. Review and edit the extracted data below, then save to your profile.
          </div>

          {/* Personal Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Personal Information</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Phone</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Address</label>
                <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-slate-500 mb-1">Executive Summary</label>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Competencies */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-3">
              Core Competencies ({competencies.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {competencies.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                  {c}
                  <button onClick={() => removeCompetency(i)} className="ml-1 text-blue-400 hover:text-red-500">&times;</button>
                </span>
              ))}
              {competencies.length === 0 && <p className="text-xs text-slate-400">No competencies extracted</p>}
            </div>
          </div>

          {/* Career History */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-3">
              Career History ({careerHistory.length} roles)
            </h2>
            <div className="space-y-4">
              {careerHistory.map((role, ri) => (
                <div key={ri} className="p-4 bg-slate-50 rounded-lg relative">
                  <button onClick={() => removeCareer(ri)} className="absolute top-2 right-2 text-xs text-red-400 hover:text-red-600">&times; Remove</button>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      type="text"
                      value={role.title}
                      onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, title: e.target.value } : r))}
                      className="p-2 border border-slate-200 rounded text-sm font-medium"
                      placeholder="Job Title"
                    />
                    <input
                      type="text"
                      value={role.company}
                      onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, company: e.target.value } : r))}
                      className="p-2 border border-slate-200 rounded text-sm"
                      placeholder="Company"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input
                      type="text"
                      value={role.start_date}
                      onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, start_date: e.target.value } : r))}
                      className="p-2 border border-slate-200 rounded text-xs"
                      placeholder="Start date"
                    />
                    <input
                      type="text"
                      value={role.end_date}
                      onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, end_date: e.target.value } : r))}
                      className="p-2 border border-slate-200 rounded text-xs"
                      placeholder="End date"
                    />
                    <input
                      type="text"
                      value={role.location}
                      onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, location: e.target.value } : r))}
                      className="p-2 border border-slate-200 rounded text-xs"
                      placeholder="Location"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 font-medium">Highlights:</p>
                    {role.highlights.map((h, hi) => (
                      <div key={hi} className="flex gap-1">
                        <input
                          type="text"
                          value={h}
                          onChange={(e) => updateHighlight(ri, hi, e.target.value)}
                          className="flex-1 p-1.5 border border-slate-200 rounded text-xs"
                        />
                        <button onClick={() => removeHighlight(ri, hi)} className="text-xs text-red-400 px-1">&times;</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {careerHistory.length === 0 && <p className="text-xs text-slate-400">No career entries extracted</p>}
            </div>
          </div>

          {/* Certifications */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-3">
              Certifications ({certifications.length})
            </h2>
            <div className="space-y-1">
              {certifications.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-slate-700">{c.name}</span>
                  <span className="text-xs text-slate-400">{c.year || ""}</span>
                  <button onClick={() => removeCert(i)} className="text-xs text-red-400 hover:text-red-600">&times;</button>
                </div>
              ))}
              {certifications.length === 0 && <p className="text-xs text-slate-400">No certifications extracted</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving..." : "Save to Profile"}
            </button>
            <button onClick={() => { setParsed(null); setFile(null); }} className="px-6 py-3 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Upload Different File
            </button>
            <button onClick={() => router.push(`/profiles/${id}`)} className="px-6 py-3 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
