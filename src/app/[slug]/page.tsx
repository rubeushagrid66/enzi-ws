"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { Modal } from "@/components/Modal";
import {
  Search,
  Target,
  ArrowRight,
  Plus,
  Users,
  ArrowLeft,
} from "lucide-react";

import { scoresForParticipant, findingBoardPosition } from "@/lib/scoring";
import { useMeParticipantId } from "@/lib/useMeParticipant";

function FindingCard({
  finding,
  meId,
  onSelect,
}: {
  finding: any;
  meId: string | null;
  onSelect: (f: any) => void;
}) {
  const s = finding.scores || {};
  // The quadrant this finding shows for the viewer: its board position
  // (pinned, or computed from the viewer's D/V/F).
  const boardPos = findingBoardPosition(finding, meId);
  const quad = boardPos.quadrant;
  // V/F are per participant: the card shows the logged-in participant's
  // own values (no composite, no cross-participant average), in the
  // same three-box layout in the global Findings list and inside a
  // group — a group card is the same card, just group-filtered.
  const my = scoresForParticipant(s.participantScores, meId);
  const myPending: string[] = [];
  if (!finding.scoringStatus?.desirabilityScored) myPending.push("Desirability");
  if (my.viability == null) myPending.push("Viability");
  if (my.feasibility == null) myPending.push("Feasibility");
  const myScored = myPending.length === 0;
  return (
    <div
      onClick={() => onSelect(finding)}
      className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {quad ? (
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
              {boardPos.pinned && " · manual"}
            </span>
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
              Awaiting scoring
            </span>
          )}
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

        {!myScored && myPending.length > 0 && (
          <p className="text-xs text-amber-700">
            Needs scoring: {myPending.join(", ")}
          </p>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded bg-emerald-50/80 p-1.5 border border-emerald-100">
            <div className="text-emerald-700 font-semibold">Desirability</div>
            <div className="font-extrabold text-emerald-900 mt-0.5">
              {s.desirability != null ? `${s.desirability} / 3` : "—"}
            </div>
          </div>
          <div className="rounded bg-blue-50/80 p-1.5 border border-blue-100">
            <div className="text-blue-700 font-semibold">Viability &amp; Feasibility</div>
            <div className="font-extrabold text-blue-900 mt-0.5">
              {my.viability != null ? `${my.viability} / 3` : "—"}
            </div>
          </div>
          <div className="rounded bg-amber-50/80 p-1.5 border border-amber-100">
            <div className="text-amber-700 font-semibold">Matrix</div>
            <div className="font-extrabold text-amber-900 mt-0.5">
              {my.feasibility != null ? `${my.feasibility} / 3` : "—"}
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

/** Groups view — separate from the global findings list. Lists the
 *  project's groups; opening a group shows its assigned findings as the
 *  same cards with D/V/F. A finding assigned to this group shows here
 *  even when its home project is the other one. */
function GroupsView({
  project,
  slug,
  meId,
  selectedGroupId,
  groupFindings,
  groupFindingsLoading,
  onOpenGroup,
  onBackToGroups,
  onSelectFinding,
}: {
  project: any;
  slug: string;
  meId: string | null;
  selectedGroupId: string | null;
  groupFindings: Record<string, any[]>;
  groupFindingsLoading: boolean;
  onOpenGroup: (groupId: string) => void;
  onBackToGroups: () => void;
  onSelectFinding: (f: any) => void;
}) {
  const groups: any[] = project.groups || [];
  const selectedGroup = groups.find((g: any) => g.id === selectedGroupId) || null;

  if (selectedGroup) {
    const findings: any[] = groupFindings[selectedGroup.id];
    const isLoading = findings === undefined && groupFindingsLoading;
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={onBackToGroups}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-emerald-700 transition"
          >
            <ArrowLeft className="h-4 w-4" /> All groups
          </button>
          <h2 className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            {selectedGroup.name}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {(selectedGroup.participants || []).map((p: any) => p.name).join(", ") || "No participants yet"}
            {" · "}
            {findings ? `${findings.length} finding${findings.length === 1 ? "" : "s"}` : "…"}
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          </div>
        ) : findings && findings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {findings.map((finding: any) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                meId={meId}
                onSelect={onSelectFinding}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <Users className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="mt-3 text-base font-bold text-slate-800">No findings in this group yet</h3>
            <p className="mt-1 text-xs text-slate-500">
              An admin or facilitator assigns findings to this group from the dashboard (Findings &amp; Tags).
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Groups</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Each group holds the findings assigned to it, with their D, V and F. Open a group to see its findings.
        </p>
      </div>
      {groups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((g: any) => {
            const count = groupFindings[g.id]?.length;
            const participants: any[] = g.participants || [];
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onOpenGroup(g.id)}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:border-emerald-300 hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                    <Users className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-base font-bold text-slate-900">{g.name}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {participants.length > 0
                    ? participants.map((p: any) => p.name).join(", ")
                    : "No participants yet"}
                </p>
                <p className="mt-2 text-xs font-semibold text-emerald-700">
                  {count != null ? `${count} finding${count === 1 ? "" : "s"}` : "Loading findings…"}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  View findings <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Users className="h-10 w-10 text-slate-300 mx-auto" />
          <h3 className="mt-3 text-base font-bold text-slate-800">No groups yet</h3>
          <p className="mt-1 text-xs text-slate-500">Create a group in the dashboard (Groups &amp; Participants tab).</p>
        </div>
      )}
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
  const [selectedTag, setSelectedTag] = useState<string>("ALL");

  // Groups view — separate from the global findings list. A group shows
  // the findings assigned to it (admin + facilitator assign them in the
  // dashboard), as the same cards with D/V/F. `groupFindings` is loaded
  // per group from the group-findings endpoint, so a finding from the
  // other project assigned to this group shows here too.
  const [view, setView] = useState<"findings" | "groups">("findings");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupFindings, setGroupFindings] = useState<Record<string, any[]>>({});
  const [groupFindingsLoading, setGroupFindingsLoading] = useState(false);

  const loadGroupFindings = async (groupId: string) => {
    setGroupFindingsLoading(true);
    try {
      const res = await fetch(`/api/projects/${slug}/groups/${groupId}/findings`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load group findings");
      const data = await res.json();
      setGroupFindings((prev) => ({ ...prev, [groupId]: data.findings || [] }));
    } catch {
      setGroupFindings((prev) => ({ ...prev, [groupId]: [] }));
    } finally {
      setGroupFindingsLoading(false);
    }
  };

  const openGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    if (!groupFindings[groupId]) loadGroupFindings(groupId);
  };

  // When the Groups view opens, load every group's findings in parallel
  // so the tiles show accurate counts and opening a group is instant.
  // (The endpoint includes findings from the other project assigned to
  // this group, which the project's own findings list would miss.)
  useEffect(() => {
    if (view !== "groups" || !project) return;
    for (const g of project.groups || []) {
      loadGroupFindings(g.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, project?.slug]);

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

  // "Me" MUST be resolved here, before any early return: hooks have to
  // run in the same order on every render. Calling this hook only after
  // the project loads threw "Rendered more hooks than during the previous
  // render" and crashed the viewer on every load (5e87906). During the
  // loading render project/currentUser are null, so the hook just waits.
  const meId = useMeParticipantId(project?.slug, currentUser);

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
  // "Me" is resolved above (before the early returns) — the cards show
  // this participant's own V/F (1–3), never a cross-participant average.
  const findings: any[] = project.findings || [];
  const myScores = (f: any) =>
    scoresForParticipant(f.scores?.participantScores, meId);
  // Scored FOR ME: Desirability scored from research + I scored a Viability aspect +
  // I scored a Feasibility aspect. Logged-out viewers have no V/F, so
  // every finding waits in "Awaiting scoring" for them.
  const myScored = (f: any) => {
    const my = myScores(f);
    return (
      !!f.scoringStatus?.desirabilityScored &&
      my.viability != null &&
      my.feasibility != null
    );
  };

  // The tag filter offers Sumber only — Wawancara and Survey. Internal
  // is not offered as a filter (it does not count toward Desirability).
  const allTags = ["Sumber: Wawancara", "Sumber: Survey"];

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchDesc = (f.description || "").toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }

    if (selectedTag !== "ALL") {
      const hasTag = (f.tagsList || []).some(
        (t: any) => `${t.category}: ${t.value}` === selectedTag
      );
      if (!hasTag) return false;
    }

    return true;
  });

  // (myScored above is still used by the hero "Scored by you" count.)

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
                <span className="text-slate-400">Scored by you:</span>{" "}
                <span className="font-bold text-slate-900">
                  {findings.filter((f) => myScored(f)).length} of {findings.length} findings
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
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 flex-1 w-full">
        {/* Findings / Groups — the group view is separate from the
            global findings list. Inside a group are the findings
            assigned to it, as the same cards with D/V/F. */}
        <div className="mb-6 flex items-center gap-2" role="tablist" aria-label="Findings or groups">
          <button
            type="button"
            role="tab"
            aria-selected={view === "findings"}
            onClick={() => { setView("findings"); setSelectedGroupId(null); }}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${view === "findings" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Findings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "groups"}
            onClick={() => { setView("groups"); setSelectedGroupId(null); }}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${view === "groups" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            <Users className="h-3.5 w-3.5" /> Groups
          </button>
        </div>

        {view === "groups" ? (
          <GroupsView
            project={project}
            slug={slug}
            meId={meId}
            selectedGroupId={selectedGroupId}
            groupFindings={groupFindings}
            groupFindingsLoading={groupFindingsLoading}
            onOpenGroup={openGroup}
            onBackToGroups={() => setSelectedGroupId(null)}
            onSelectFinding={(f: any) => router.push(`/${slug}/findings/${f.id}`)}
          />
        ) : (
        <>
        {/* FINDINGS DIRECTORY */}
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



            {/* Findings List — one flat list of all global findings,
                scored or not, assigned to a group or not. No "Scored by
                you" / "Awaiting scoring" split. */}
            {filteredFindings.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredFindings.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} meId={meId} onSelect={(f) => router.push(`/${slug}/findings/${f.id}`)} />
                ))}
              </div>
            ) : (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <Target className="h-10 w-10 text-slate-300 mx-auto" />
                <h3 className="mt-3 text-base font-bold text-slate-800">
                  No Findings Match Your Filters
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Try clearing the search text or resetting the filters.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedTag("ALL");
                  }}
                  className="mt-4 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        </>
        )}
      </main>

      {/* Credit footer — same text as the homepage, styled for the white page */}
      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between border-t border-slate-100 px-4 py-6 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400 sm:px-6 lg:px-10">
        <span>Bank BSI &times; Aleph</span>
        <span>&copy; Enzi 2026</span>
      </footer>

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
