"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { Modal } from "@/components/Modal";
import FeasibilityMatrix from "@/components/FeasibilityMatrix";
import {
  Search,
  Target,
  ArrowRight,
  Plus,
} from "lucide-react";

function FindingCard({
  finding,
  rank,
  onSelect,
}: {
  finding: any;
  rank?: number;
  onSelect: (f: any) => void;
}) {
  const s = finding.scores || {};
  const quad = finding.feasibilityQuadrant || "QUICK_WINS";
  const scored = finding.scoringStatus?.scored;
  return (
    <div
      onClick={() => onSelect(finding)}
      className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {scored ? (
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                quad === "QUICK_WINS"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : quad === "BIG_BETS"
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : quad === "AVOID"
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              {quad.replace("_", " ")}
            </span>
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
              Awaiting scoring
            </span>
          )}

          <div className="flex items-center gap-1 text-xs font-extrabold text-slate-900 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
            {rank != null && (
              <span className="text-xs font-extrabold text-emerald-700">#{rank}</span>
            )}
            <span className="text-xs text-slate-500 font-normal">DVF:</span>
            <span>{s.composite != null ? s.composite : "—"}</span>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-900 group-hover:text-emerald-700 transition leading-snug line-clamp-2 sm:text-lg">
            {finding.title}
          </h3>
          {finding.description && (
            <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">
              {finding.description}
            </p>
          )}
        </div>

        {finding.tagsList && finding.tagsList.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {finding.tagsList.map((tag: any, i: number) => (
              <span
                key={i}
                className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200"
              >
                {tag.category}: {tag.value}
              </span>
            ))}
          </div>
        )}

        {!scored && finding.scoringStatus?.pending?.length > 0 && (
          <p className="text-xs text-amber-700">
            Needs scoring: {finding.scoringStatus.pending.join(", ")}
          </p>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded bg-emerald-50/80 p-1.5 border border-emerald-100">
            <div className="text-emerald-700 font-semibold">Desir.</div>
            <div className="font-extrabold text-emerald-900 mt-0.5">
              {s.desirability != null ? s.desirability : "—"}
            </div>
          </div>
          <div className="rounded bg-blue-50/80 p-1.5 border border-blue-100">
            <div className="text-blue-700 font-semibold">Viab.</div>
            <div className="font-extrabold text-blue-900 mt-0.5">
              {s.viability != null ? `${s.viability}%` : "—"}
            </div>
          </div>
          <div className="rounded bg-amber-50/80 p-1.5 border border-amber-100">
            <div className="text-amber-700 font-semibold">Feas.</div>
            <div className="font-extrabold text-amber-900 mt-0.5">
              {s.feasibility != null ? s.feasibility : "—"}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-emerald-600 font-semibold pt-1">
          <span>View 3-Tab breakdown</span>
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </div>
  );
}

// Registered parameter values — the only options offered for Sumber and
// Platform in the Add Finding form, same as the dashboard's finding form.
const SUMBER_OPTIONS = ["Wawancara", "Survey", "Internal"];
const PLATFORM_OPTIONS = ["CMS", "DVC"];

export default function ProjectResultViewer({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = params;
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuadrant, setSelectedQuadrant] = useState<string>("ALL");
  const [selectedTag, setSelectedTag] = useState<string>("ALL");
  const [selectedFinding, setSelectedFinding] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<"directory" | "canvas">("directory");

  // Add Finding — same fields as the dashboard's finding modal. Creates the
  // finding in THIS project; open to any logged-in user, like editing
  // findings (the API only requires a session).
  const [addFindingOpen, setAddFindingOpen] = useState(false);
  const [findingForm, setFindingForm] = useState({
    title: "",
    description: "",
    sumber: [] as string[],
    fitur: "",
    platform: [] as string[],
  });
  const [savingFinding, setSavingFinding] = useState(false);
  const [findingError, setFindingError] = useState<string | null>(null);

  const handleSaveFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!findingForm.title.trim() || savingFinding) return;
    setSavingFinding(true);
    setFindingError(null);
    try {
      const res = await fetch(`/api/projects/${slug}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(findingForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create finding");
      }
      setAddFindingOpen(false);
      setFindingForm({ title: "", description: "", sumber: [], fitur: "", platform: [] });
      await loadProjectData(true);
    } catch (err: any) {
      setFindingError(err.message || "Failed to create finding");
    } finally {
      setSavingFinding(false);
    }
  };

  // Fetch project data. `silent` refreshes in the background without
  // flashing the full-page loading screen or unmounting the matrix —
  // a full reload after a drag-drop save used to snap the card back
  // to its old position.
  const loadProjectData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      // The project and the session are independent — fetch them
      // together instead of one after the other.
      const [res, userRes] = await Promise.all([
        fetch(`/api/projects/${slug}`, { cache: "no-store" }),
        fetch("/api/auth/me"),
      ]);
      if (!res.ok) {
        throw new Error("Project not found");
      }
      const data = await res.json();
      setProject(data.project);

      // Check current session
      if (userRes.ok) {
        const userData = await userRes.json();
        setCurrentUser(userData.user);
      }
    } catch (err: any) {
      if (!silent) setError(err.message || "Failed to load project");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Apply a saved finding (e.g. a dragged position) to local state
  // immediately, so the card stays where it was dropped. The backend
  // already saved it; this just keeps the UI in sync with the truth.
  const applyUpdatedFinding = (updated: any) => {
    if (!updated?.id) return;
    setProject((prev: any) =>
      prev
        ? {
            ...prev,
            findings: (prev.findings || []).map((f: any) =>
              f.id === updated.id ? { ...f, ...updated } : f
            ),
          }
        : prev
    );
    setSelectedFinding((prev: any) =>
      prev && prev.id === updated.id ? { ...prev, ...updated } : prev
    );
  };

  useEffect(() => {
    loadProjectData();
  }, [slug]);

  // Auto-refresh when the tab comes back into view, so changes made in
  // the admin dashboard (possibly in another tab) show up without a
  // manual reload.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") loadProjectData(true);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
            <p className="text-sm font-semibold text-slate-600">
              Loading Workshop Prioritization Platform...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
            <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center font-bold text-xl">
              !
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              Project Not Found
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              The project slug <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">{slug}</code> does not exist or has been archived.
            </p>
            <a
              href="/"
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "FACILITATOR";
  const findings: any[] = project.findings || [];

  // The tag filter offers Sumber only — the L2s under L1 "Sumber" in the
  // global parameter tree (Wawancara, Survey). Legacy free-form tag values
  // such as "Survey Riset" or "FGD Internal" are not offered.
  const allTags = ["Sumber: Wawancara", "Sumber: Survey", "Sumber: Internal"];

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchDesc = (f.description || "").toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }

    if (selectedQuadrant !== "ALL") {
      if (f.feasibilityQuadrant !== selectedQuadrant) return false;
    }

    if (selectedTag !== "ALL") {
      const hasTag = (f.tagsList || []).some(
        (t: any) => `${t.category}: ${t.value}` === selectedTag
      );
      if (!hasTag) return false;
    }

    return true;
  });

  // Ranked list = fully scored findings, best composite first.
  // Unscored findings are never ranked — they wait in "Awaiting scoring".
  const scoredFindings = filteredFindings
    .filter((f) => f.scoringStatus?.scored)
    .sort((a, b) => (b.scores?.composite ?? 0) - (a.scores?.composite ?? 0));
  const awaitingFindings = filteredFindings.filter(
    (f) => !f.scoringStatus?.scored
  );

  // Average composite DVF over scored findings only (unscored ones have
  // no composite and must not drag the average down with 0s).
  const avgDvfScore =
    scoredFindings.length > 0
      ? (
          scoredFindings.reduce((acc, curr) => acc + (curr.scores?.composite || 0), 0) /
          scoredFindings.length
        ).toFixed(1)
      : "—";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar projectSlug={project.slug} projectName={project.name} />

      {/* Hero Banner */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Bewize Workshop &middot; Phase DVF
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Live Workshop View
                </span>
                {isAdmin && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    Facilitator Mode Active
                  </span>
                )}
              </div>
              <h1 className="text-4xl font-semibold text-slate-900 tracking-tight sm:text-5xl">
                {project.name}
              </h1>
              {/* The DVC description is still the literal placeholder "test"
                  in the database (restoring it to blank awaits the user's
                  call); never render that placeholder as if it were copy. */}
              {project.description &&
                project.description.trim().toLowerCase() !== "test" && (
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {project.description}
                  </p>
                )}
            </div>

            {/* Framework Weight Distribution Badge */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shrink-0 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                DVF Framework Weights
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                  <div className="text-xs font-semibold text-emerald-700 uppercase">
                    Desirability
                  </div>
                  <div className="text-lg font-semibold text-emerald-950">
                    {project.weightsMap?.desirability ?? 33.3}%
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-blue-200">
                  <div className="text-xs font-semibold text-blue-700 uppercase">
                    Viability
                  </div>
                  <div className="text-lg font-semibold text-blue-950">
                    {project.weightsMap?.viability ?? 33.3}%
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                  <div className="text-xs font-semibold text-amber-700 uppercase">
                    Feasibility
                  </div>
                  <div className="text-lg font-semibold text-amber-950">
                    {project.weightsMap?.feasibility ?? 33.3}%
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-center text-slate-500 font-mono">
                Total:{" "}
                {(
                  (project.weightsMap?.desirability ?? 33.3) +
                  (project.weightsMap?.viability ?? 33.3) +
                  (project.weightsMap?.feasibility ?? 33.3)
                ).toFixed(1)}
                %
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600">
              <div>
                <span className="text-slate-400">Total Findings:</span>{" "}
                <span className="font-bold text-slate-900">{findings.length}</span>
              </div>
              <div>
                <span className="text-slate-400">Participant Groups:</span>{" "}
                <span className="font-bold text-slate-900">
                  {project.groups?.length || 0}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Viability Aspects:</span>{" "}
                <span className="font-bold text-slate-900">
                  {project.viabilityAspects?.length || 0}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Avg DVF Score:</span>{" "}
                <span className="font-extrabold text-emerald-700">
                  {avgDvfScore === "—" ? "— (no findings scored yet)" : `${avgDvfScore} / 100`}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Scored:</span>{" "}
                <span className="font-bold text-slate-900">
                  {findings.filter((f) => f.scoringStatus?.scored).length} of {findings.length} findings
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentUser && (
                <button
                  type="button"
                  onClick={() => setAddFindingOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shadow-xs hover:bg-emerald-700 transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Finding
                </button>
              )}

            {/* View Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                aria-pressed={viewMode === "directory"}
                onClick={() => setViewMode("directory")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === "directory"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Findings Directory
              </button>
              <button
                aria-pressed={viewMode === "canvas"}
                onClick={() => setViewMode("canvas")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === "canvas"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                2x2 Feasibility Board
              </button>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 flex-1 w-full">
        {/* VIEW MODE 1: FINDINGS DIRECTORY */}
        {viewMode === "directory" && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <label htmlFor="viewer-search" className="sr-only">Search findings</label>
                <input
                  id="viewer-search"
                  type="text"
                  placeholder="Search user findings, pain points, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Quadrant filter */}
                <label htmlFor="viewer-quadrant" className="sr-only">Filter by quadrant</label>
                <select
                  id="viewer-quadrant"
                  value={selectedQuadrant}
                  onChange={(e) => setSelectedQuadrant(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">All Quadrants</option>
                  <option value="QUICK_WINS">Quick Wins</option>
                  <option value="BIG_BETS">Big Bets</option>
                  <option value="FILL_INS">Fill-ins</option>
                  <option value="AVOID">Avoid</option>
                </select>

                {/* Sumber filter (Wawancara / Survey only) */}
                {allTags.length > 0 && (
                  <>
                  <label htmlFor="viewer-tag" className="sr-only">Filter by sumber</label>
                  <select
                    id="viewer-tag"
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ALL">All Sumber</option>
                    {allTags.map((t, idx) => (
                      <option key={idx} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  </>
                )}
              </div>
            </div>



            {/* Findings List — ranked (scored) first, awaiting scoring below */}
            {filteredFindings.length > 0 ? (
              <div className="space-y-8">
                {scoredFindings.length > 0 && (
                  <section aria-labelledby="ranked-heading">
                    <h2 id="ranked-heading" className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                      Ranked by DVF Score ({scoredFindings.length})
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Only findings fully scored in the workshop are ranked.
                    </p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {scoredFindings.map((finding, i) => (
                        <FindingCard key={finding.id} finding={finding} rank={i + 1} onSelect={(f) => router.push(`/${slug}/findings/${f.id}`)} />
                      ))}
                    </div>
                  </section>
                )}
                {awaitingFindings.length > 0 && (
                  <section aria-labelledby="awaiting-heading">
                    <h2 id="awaiting-heading" className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                      Awaiting Scoring ({awaitingFindings.length})
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Listed only — no scores yet. Score these together with participants in the workshop.
                    </p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {awaitingFindings.map((finding) => (
                        <FindingCard key={finding.id} finding={finding} onSelect={(f) => router.push(`/${slug}/findings/${f.id}`)} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <Target className="h-10 w-10 text-slate-300 mx-auto" />
                <h3 className="mt-3 text-base font-bold text-slate-800">
                  No Findings Match Your Filters
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Try clearing the search text or reset the quadrant filter.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedQuadrant("ALL");
                    setSelectedTag("ALL");
                  }}
                  className="mt-4 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        )}


        {/* VIEW MODE 2: 2X2 FEASIBILITY CANVAS (WHOLE PROJECT) */}
        {viewMode === "canvas" && (
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Project Feasibility 2x2 Matrix
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click any finding to inspect its 3-Tab details or drag to reposition if you are logged in as Admin.
                  </p>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {findings.length} findings mapped
                </div>
              </div>

              {/* Show matrix for the first finding or let user click to select */}
              {findings.length > 0 ? (
                <div className="mt-6">
                  <FeasibilityMatrix
                    finding={selectedFinding || findings[0]}
                    allFindings={findings}
                    projectSlug={project.slug}
                    isAdmin={isAdmin}
                    onPositionSaved={(updated) => {
                      applyUpdatedFinding(updated);
                      // Silent background refresh for recalculated scores
                      // (quadrant / composite change with the position).
                      loadProjectData(true);
                    }}
                  />

                  {/* Findings quick picker */}
                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Select Finding to Active Focus:
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {findings.map((f) => {
                        const isFocused =
                          (selectedFinding?.id || findings[0].id) === f.id;
                        return (
                          <button
                            key={f.id}
                            onClick={() => setSelectedFinding(f)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                              isFocused
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs font-semibold"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {f.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-8 text-center italic">
                  No findings to display on matrix.
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Add Finding — same fields as the dashboard's finding form */}
      {addFindingOpen && (
        <Modal title="Add Finding" onClose={() => setAddFindingOpen(false)} wide>
          <form onSubmit={handleSaveFinding} className="space-y-3">
            <div>
              <label htmlFor="finding-title" className="field-label">Finding Title (User Need / Pain Point)</label>
              <input id="finding-title" type="text" required placeholder="e.g. Tampilan Membingungkan" value={findingForm.title} onChange={(e) => setFindingForm((f) => ({ ...f, title: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="finding-desc" className="field-label">Description</label>
              <textarea id="finding-desc" rows={2} placeholder="Elaborate on participant feedback..." value={findingForm.description} onChange={(e) => setFindingForm((f) => ({ ...f, description: e.target.value }))} className="input w-full" />
            </div>
            <fieldset>
              <legend className="field-label">Sumber</legend>
              <div className="flex flex-wrap gap-4">
                {SUMBER_OPTIONS.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={findingForm.sumber.includes(opt)} onChange={(e) => setFindingForm((f) => ({ ...f, sumber: e.target.checked ? [...f.sumber, opt] : f.sumber.filter((s) => s !== opt) }))} className="h-4 w-4 rounded accent-emerald-600" />
                    <span className="text-sm text-slate-700">{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="finding-fitur" className="field-label">Fitur</label>
              <input id="finding-fitur" type="text" placeholder="e.g. Bulk Payment" value={findingForm.fitur} onChange={(e) => setFindingForm((f) => ({ ...f, fitur: e.target.value }))} className="input w-full" />
            </div>
            <fieldset>
              <legend className="field-label">Platform</legend>
              <div className="flex flex-wrap gap-4">
                {PLATFORM_OPTIONS.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={findingForm.platform.includes(opt)} onChange={(e) => setFindingForm((f) => ({ ...f, platform: e.target.checked ? [...f.platform, opt] : f.platform.filter((p) => p !== opt) }))} className="h-4 w-4 rounded accent-emerald-600" />
                    <span className="text-sm text-slate-700">{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {findingError && (
              <p className="text-sm text-rose-600">{findingError}</p>
            )}
            <div className="flex items-center justify-end gap-2 pt-3">
              <button type="button" onClick={() => setAddFindingOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={savingFinding} className="btn-primary disabled:opacity-60">{savingFinding ? "Saving…" : "Create Finding"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
