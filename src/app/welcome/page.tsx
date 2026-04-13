"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export default function WelcomePage() {
  const { data: session } = useSession();

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="w-20 h-20 bg-blue-600 dark:bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white font-bold text-3xl">A</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-3">ApplyForMe</h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          AI-powered CV and cover letter customiser. Paste a job description, get a tailored CV, cover letter, and recruiter briefing in seconds.
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <FeatureCard
          title="Smart Job Matching"
          description="Analyses job descriptions against your career history across 12 skill categories. Shows match percentage with specific evidence from your experience."
        />
        <FeatureCard
          title="Tailored Documents"
          description="Generates a customised CV, cover letter, and recruiter briefing as professional Word documents. Every document is unique to the role."
        />
        <FeatureCard
          title="Company Research"
          description="Scrapes the company's website, about page, team page, and LinkedIn to build a briefing with culture insights, WFH stance, and salary data."
        />
        <FeatureCard
          title="Interview Prep"
          description="Generates structured interview questions based on the role. Fill in answers during the call, and the system researches the hiring manager."
        />
        <FeatureCard
          title="Priority Benefits"
          description="Configure the benefits you care about most. Every job analysis shows which of your priorities are mentioned in the listing."
        />
        <FeatureCard
          title="Multi-Profile"
          description="Manage up to 10 profiles. Import career data from Word docs, spreadsheets, or JSON files. Each profile gets its own tailored outputs."
        />
      </div>

      {/* About */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 mb-12">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">About</h2>
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
          <p>
            ApplyForMe was built to solve a simple problem: tailoring your CV and cover letter for every job application is tedious, repetitive work. The tool automates the matching, rewriting, and research so you can focus on the conversations that matter.
          </p>
          <p>
            The engine analyses job descriptions using keyword matching across categories like AI, Security, Cloud, Leadership, DevOps, and more. It maps each requirement against your career history, competencies, and certifications to produce a match score with specific evidence.
          </p>
          <p>
            Documents are generated as professional .docx files using your actual experience — nothing is fabricated. The system includes NZ and Australian salary benchmarks, company web scraping, and a structured interview preparation workflow.
          </p>
          <p>
            Built with Next.js, Prisma, SQLite, and TypeScript. Authentication via PIN, OAuth (Microsoft/Google), and passkeys. Role-based access control (Admin, User, Viewer) keeps data private.
          </p>
        </div>
      </div>

      {/* How It Works */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6 text-center">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Step number={1} title="Paste" description="Paste the job ad, recruiter email, or JD document" />
          <Step number={2} title="Analyse" description="Get match score, priority benefits check, and tailored summary" />
          <Step number={3} title="Research" description="Company scraping, salary data, culture and WFH insights" />
          <Step number={4} title="Download" description="Tailored CV, cover letter, and recruiter briefing as .docx" />
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        {session ? (
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-lg"
          >
            Start Analysing
          </Link>
        ) : (
          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-8 py-3 border border-slate-300 dark:border-slate-600 rounded-lg font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Create Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
      <h3 className="font-semibold text-slate-800 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center mx-auto mb-2 font-bold text-sm">
        {number}
      </div>
      <h3 className="font-semibold text-slate-800 dark:text-white text-sm mb-1">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}
