"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import type { UserProfile, CareerRole, CertificationEntry } from "@/lib/types";
import Link from "next/link";

export default function EditProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nationality, setNationality] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [competencies, setCompetencies] = useState<string[]>([]);
  const [newCompetency, setNewCompetency] = useState("");

  // Career history
  const [careerHistory, setCareerHistory] = useState<CareerRole[]>([]);

  // Certifications
  const [certifications, setCertifications] = useState<CertificationEntry[]>([]);
  const [newCertName, setNewCertName] = useState("");
  const [newCertYear, setNewCertYear] = useState("");

  // Priority benefits
  const [benefits, setBenefits] = useState<{ keyword: string; priority: number }[]>([]);
  const [newBenefit, setNewBenefit] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/profiles/${id}`).then((r) => r.json()),
      fetch(`/api/profiles/${id}/benefits`).then((r) => r.json()),
    ])
      .then(([profileData, benefitsData]) => {
        setProfile(profileData);
        setName(profileData.personal.name);
        setEmail(profileData.personal.email);
        setPhone(profileData.personal.phone);
        setAddress(profileData.personal.address);
        setNationality(profileData.personal.nationality);
        setYearsExperience(String(profileData.personal.years_experience || ""));
        setExecutiveSummary(profileData.executive_summary);
        setCompetencies(profileData.core_competencies || []);
        setCareerHistory(profileData.career_history || []);
        setCertifications(profileData.certifications_and_training || []);
        setBenefits(
          Array.isArray(benefitsData)
            ? benefitsData.map((b: { keyword: string; priority: number }) => ({
                keyword: b.keyword,
                priority: b.priority,
              }))
            : []
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
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
            linkedin: profile?.personal.linkedin || "",
            nationality,
            years_experience: yearsExperience ? parseInt(yearsExperience) : 0,
          },
          executive_summary: executiveSummary,
          core_competencies: competencies,
          career_history: careerHistory,
          certifications_and_training: certifications,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Save failed");
      } else {
        // Also save benefits
        await fetch(`/api/profiles/${id}/benefits`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ benefits }),
        });
        setSuccess("Profile saved successfully");
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch {
      setError("Save failed");
    }
    setSaving(false);
  };

  const addCompetency = () => {
    if (newCompetency.trim()) {
      setCompetencies([...competencies, newCompetency.trim()]);
      setNewCompetency("");
    }
  };

  const removeCompetency = (index: number) => {
    setCompetencies(competencies.filter((_, i) => i !== index));
  };

  const addBenefit = () => {
    if (newBenefit.trim()) {
      setBenefits([...benefits, { keyword: newBenefit.trim(), priority: benefits.length + 1 }]);
      setNewBenefit("");
    }
  };

  const removeBenefit = (index: number) => {
    const updated = benefits.filter((_, i) => i !== index);
    setBenefits(updated.map((b, i) => ({ ...b, priority: i + 1 })));
  };

  if (loading) return <div className="max-w-3xl mx-auto px-6 py-8 text-slate-500">Loading...</div>;
  if (!profile) return <div className="max-w-3xl mx-auto px-6 py-8 text-red-500">Profile not found</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Edit Profile</h1>
        <button onClick={() => router.push("/profiles")} className="text-sm text-slate-500 hover:text-slate-700">
          Back to Profiles
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      <div className="space-y-6">
        {/* Personal Info */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Personal Information</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Phone</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Years Experience</label>
                <input type="number" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Executive Summary</label>
              <textarea value={executiveSummary} onChange={(e) => setExecutiveSummary(e.target.value)} rows={4} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Security: Passkey */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-2">Security</h2>
          <p className="text-xs text-slate-500 mb-3">Register a passkey (Windows Hello, Touch ID, YubiKey) for passwordless login.</p>
          <button
            onClick={async () => {
              try {
                const { startRegistration } = await import("@simplewebauthn/browser");
                const optRes = await fetch("/api/auth/passkey/register-options", { method: "POST" });
                const options = await optRes.json();
                const credential = await startRegistration(options);
                const verifyRes = await fetch("/api/auth/passkey/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(credential),
                });
                const result = await verifyRes.json();
                if (result.verified) {
                  setSuccess("Passkey registered successfully!");
                  setTimeout(() => setSuccess(""), 3000);
                } else {
                  setError(result.error || "Passkey registration failed");
                }
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Passkey registration failed");
              }
            }}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors"
          >
            Register Passkey
          </button>
        </div>

        {/* Core Competencies */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Core Competencies</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {competencies.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                {c}
                <button onClick={() => removeCompetency(i)} className="ml-1 text-blue-400 hover:text-red-500">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newCompetency} onChange={(e) => setNewCompetency(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompetency())} placeholder="Add competency..." className="flex-1 p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={addCompetency} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add</button>
          </div>
        </div>

        {/* Priority Benefits */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-2">Priority Benefits</h2>
          <p className="text-xs text-slate-500 mb-4">Ranked list of benefits you care about. These are keyword-searched against job descriptions.</p>
          <div className="space-y-2 mb-3">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                <span className="text-xs font-bold text-slate-400 w-6">#{b.priority}</span>
                <span className="flex-1 text-sm text-slate-700">{b.keyword}</span>
                <button onClick={() => removeBenefit(i)} className="text-xs text-red-400 hover:text-red-600">&times;</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newBenefit} onChange={(e) => setNewBenefit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBenefit())} placeholder="e.g. remote, kiwisaver, health insurance..." className="flex-1 p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={addBenefit} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add</button>
          </div>
        </div>

        {/* Career History */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">Career History</h2>
            <div className="flex gap-2">
              <Link href={`/profiles/${id}/import`} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">
                Import from File
              </Link>
              <button
                onClick={() => setCareerHistory([...careerHistory, { title: "", company: "", location: "", start_date: "", end_date: "", highlights: [], keywords: [] }])}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + Add Role
              </button>
            </div>
          </div>
          {careerHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No career entries yet. Add a role or import from a file.</p>
          ) : (
            <div className="space-y-4">
              {careerHistory.map((role, ri) => (
                <div key={ri} className="p-4 bg-slate-50 rounded-lg relative">
                  <button
                    onClick={() => setCareerHistory(careerHistory.filter((_, i) => i !== ri))}
                    className="absolute top-2 right-2 text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input type="text" value={role.title} onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, title: e.target.value } : r))} className="p-2 border border-slate-200 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Job Title" />
                    <input type="text" value={role.company} onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, company: e.target.value } : r))} className="p-2 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Company" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input type="text" value={role.start_date} onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, start_date: e.target.value } : r))} className="p-2 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Start (e.g. 2021)" />
                    <input type="text" value={role.end_date} onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, end_date: e.target.value } : r))} className="p-2 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="End (e.g. Present)" />
                    <input type="text" value={role.location} onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, location: e.target.value } : r))} className="p-2 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Location" />
                  </div>
                  <div className="mb-2">
                    <p className="text-xs text-slate-500 font-medium mb-1">Highlights</p>
                    {role.highlights.map((h, hi) => (
                      <div key={hi} className="flex gap-1 mb-1">
                        <input type="text" value={h} onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, highlights: r.highlights.map((x, j) => j === hi ? e.target.value : x) } : r))} className="flex-1 p-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={() => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, highlights: r.highlights.filter((_, j) => j !== hi) } : r))} className="text-xs text-red-400 px-1">&times;</button>
                      </div>
                    ))}
                    <button onClick={() => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, highlights: [...r.highlights, ""] } : r))} className="text-xs text-blue-600 hover:underline mt-1">+ Add highlight</button>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-1">Keywords (comma-separated)</p>
                    <input
                      type="text"
                      value={role.keywords.join(", ")}
                      onChange={(e) => setCareerHistory(careerHistory.map((r, i) => i === ri ? { ...r, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) } : r))}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. AI, Copilot, Azure, Leadership"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Certifications */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-4">Certifications & Training</h2>
          <div className="space-y-2 mb-3">
            {certifications.map((cert, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <input
                  type="text"
                  value={cert.name}
                  onChange={(e) => setCertifications(certifications.map((c, j) => j === i ? { ...c, name: e.target.value } : c))}
                  className="flex-1 p-1.5 border border-slate-200 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="number"
                  value={cert.year || ""}
                  onChange={(e) => setCertifications(certifications.map((c, j) => j === i ? { ...c, year: parseInt(e.target.value) || 0 } : c))}
                  className="w-20 p-1.5 border border-slate-200 dark:border-slate-600 rounded text-sm text-center bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Year"
                />
                <button onClick={() => setCertifications(certifications.filter((_, j) => j !== i))} className="text-xs text-red-400 hover:text-red-600 px-1">&times;</button>
              </div>
            ))}
            {certifications.length === 0 && <p className="text-sm text-slate-500">No certifications yet.</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newCertName} onChange={(e) => setNewCertName(e.target.value)} onKeyDown={(e) => {
              if (e.key === "Enter" && newCertName.trim()) {
                e.preventDefault();
                setCertifications([...certifications, { name: newCertName.trim(), year: parseInt(newCertYear) || new Date().getFullYear() }]);
                setNewCertName(""); setNewCertYear("");
              }
            }} placeholder="Certification name..." className="flex-1 p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" value={newCertYear} onChange={(e) => setNewCertYear(e.target.value)} placeholder="Year" className="w-20 p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-center bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={() => {
              if (newCertName.trim()) {
                setCertifications([...certifications, { name: newCertName.trim(), year: parseInt(newCertYear) || new Date().getFullYear() }]);
                setNewCertName(""); setNewCertYear("");
              }
            }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add</button>
          </div>
        </div>

        {/* Save */}
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Save Profile"}
          </button>
          <button onClick={() => router.push("/profiles")} className="px-6 py-3 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
