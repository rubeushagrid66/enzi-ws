"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import {
  Search,
  Target,
  ArrowRight,
  Users,
  ArrowLeft,
  Map,
} from "lucide-react";

import { scoresForParticipant, findingBoardPosition, groupAverageScores, findingBoardPositionForScores, type FeasibilityQuadrant } from "@/lib/scoring";
import { useMeParticipantId } from "@/lib/useMeParticipant";

// Quadrant display names, shared by the per-group quadrant sections
// and the Roadmap.
const QUADRANT_META: Record<FeasibilityQuadrant, { title: string; detail: string }> = {
  QUICK_WINS: { title: "Quick Wins", detail: "High Impact, Low Effort" },
  BIG_BETS: { title: "Big Bets", detail: "High Impact, High Effort" },
  FILL_INS: { title: "Fill-ins", detail: "Low Impact, Low Effort" },
  AVOID: { title: "Avoid", detail: "Low Impact, High Effort" },
};

/** A finding's quadrant FOR one group (null when it has none there).
 *  D is the finding's research score (same for every group in the
 *  project); V/F are this group's participant averages. A finding
 *  assigned to specific groups only has a quadrant for those groups
 *  (an unassigned finding is open to every group). A manual pin wins
 *  over the computed position, same as the board. */
function quadrantForGroup(finding: any, group: any): FeasibilityQuadrant | null {
  const assigned: string[] = finding.groupIds || [];
  if (assigned.length > 0 && !assigned.includes(group.id)) return null;
  const participantIds: string[] = (group.participants || [])
    .filter((p: any) => p.isActive !== false && p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR")
    .map((p: any) => p.id);
  const vf = groupAverageScores(finding.scores?.participantScores, participantIds);
  const d = finding.scores?.desirability ?? null;
  return findingBoardPositionForScores(finding, d, vf.viability, vf.feasibility).quadrant;
}

function FindingCard({
  finding,
  meId,
  onSelect,
  plain,
}: {
  finding: any;
  meId: string | null;
  onSelect: (f: any) => void;
  /** Plain listing card (Findings tab): title + tags only — no scores,
      no quadrant badge, not clickable. Scoring lives in the Groups
      tab, whose cards keep the full layout. */
  plain?: boolean;
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
  // Score boxes: label row is a fixed height so a two-line label
  // ("Viability & Feasibility") never pushes its value out of line
  // with the other two boxes.
  const scoreBox = (label: string, value: string | null) => (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2.5">
      <div className="flex min-h-8 items-center justify-center text-[11px] font-semibold leading-tight text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
        {value ?? "—"}
      </div>
    </div>
  );
  return (
    <div
      {...(!plain ? { onClick: () => onSelect(finding) } : {})}
      className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs ${plain ? "" : "group cursor-pointer transition-all hover:border-emerald-300 hover:shadow-md"}`}
    >
      <div className="flex-1 space-y-3">
        {!plain && (
        <div className="flex items-center justify-between gap-2">
          {quad ? (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                quad === "QUICK_WINS"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : quad === "BIG_BETS"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : quad === "AVOID"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
              }`}
            >
              {quad.replace("_", " ")}
              {boardPos.pinned && " · manual"}
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
              Awaiting scoring
            </span>
          )}
        </div>
        )}

        {/* Fixed two-line height so the tags below always start at the
            same place, whether the title wraps or not. The description
            lives on the detail page — the card is for scanning. */}
        <h3 className="min-h-[2.75rem] text-base font-semibold leading-snug text-slate-900 transition group-hover:text-emerald-700 line-clamp-2 sm:min-h-[3.125rem] sm:text-lg">
          {finding.title}
        </h3>

        {finding.tagsList && finding.tagsList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {finding.tagsList.map((tag: any, i: number) => (
              <span
                key={i}
                className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
              >
                {tag.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Pinned to the card bottom so the score strip and link align
          across every card in the row, whatever the title/tags above.
          Only on scoring cards (Groups tab) — the plain Findings
          listing has no scores and no link. */}
      {!plain && (
      <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {scoreBox("Desirability", s.desirability != null ? `${s.desirability} / 3` : null)}
          {scoreBox("Viability & Feasibility", my.viability != null ? `${my.viability} / 3` : null)}
          {scoreBox("Matrix", my.feasibility != null ? `${my.feasibility} / 3` : null)}
        </div>

        <div className="flex items-center justify-between pt-1 text-xs font-semibold text-emerald-600">
          <span>View details</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
      )}
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
    // Findings grouped by their quadrant FOR this group, so the group
    // shows which findings already have a quadrant (and which don't
    // yet). Unplaced = no complete D/V/F for this group.
    const byQuadrant: Record<string, any[]> = { QUICK_WINS: [], BIG_BETS: [], FILL_INS: [], AVOID: [], UNPLACED: [] };
    for (const f of findings || []) {
      const q = quadrantForGroup(f, selectedGroup);
      (byQuadrant[q ?? "UNPLACED"] ?? byQuadrant.UNPLACED).push(f);
    }
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
            {(selectedGroup.participants || []).filter((p: any) => p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR").map((p: any) => p.name).join(", ") || "No participants yet"}
            {" · "}
            {findings ? `${findings.length} finding${findings.length === 1 ? "" : "s"}` : "…"}
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          </div>
        ) : findings && findings.length > 0 ? (
          <div className="space-y-8">
            {(["QUICK_WINS", "BIG_BETS", "FILL_INS", "AVOID"] as const).map((q) => {
              const inQuad = byQuadrant[q];
              if (inQuad.length === 0) return null;
              return (
                <section key={q}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-bold text-slate-900">{QUADRANT_META[q].title}</h3>
                    <span className="text-xs font-semibold text-slate-400">{QUADRANT_META[q].detail}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {inQuad.map((finding: any) => (
                      <FindingCard
                        key={finding.id}
                        finding={finding}
                        meId={meId}
                        onSelect={onSelectFinding}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {byQuadrant.UNPLACED.length > 0 && (
              <section>
                <h3 className="text-base font-bold text-slate-900">Not yet placed</h3>
                <p className="mt-0.5 text-xs text-slate-500">No quadrant yet — score the finding to place it.</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {byQuadrant.UNPLACED.map((finding: any) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      meId={meId}
                      onSelect={onSelectFinding}
                    />
                  ))}
                </div>
              </section>
            )}
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
            const participants: any[] = (g.participants || []).filter((p: any) => p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR");
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

/** Roadmap — all scored findings, globally across every group in this
 *  project, organised by time horizon from their quadrant:
 *  Jangka Pendek = Quick Wins only, Jangka Menengah = Fill-ins only,
 *  Jangka Panjang = Big Bets only. Avoid is deliberately not on the
 *  roadmap. A finding appears under each group that places it in that
 *  quadrant (with the group named), so a finding in different
 *  quadrants for different groups shows in each matching horizon. */
function RoadmapView({
  project,
  onSelectFinding,
}: {
  project: any;
  onSelectFinding: (f: any) => void;
}) {
  const groups: any[] = (project.groups || []).filter((g: any) => g.isActive !== false);
  const findings: any[] = project.findings || [];

  const HORIZONS: {
    key: "QUICK_WINS" | "FILL_INS" | "BIG_BETS";
    horizon: string;
    subtitle: string;
  }[] = [
    { key: "QUICK_WINS", horizon: "Jangka Pendek", subtitle: "Quick Wins — high impact, low effort. Do these first." },
    { key: "FILL_INS", horizon: "Jangka Menengah", subtitle: "Fill-ins — low impact, low effort. Fit them in next." },
    { key: "BIG_BETS", horizon: "Jangka Panjang", subtitle: "Big Bets — high impact, high effort. Plan these for later." },
  ];

  // For each horizon quadrant, the findings placed there, with the
  // groups that place them there.
  const itemsByHorizon = HORIZONS.map((h) => {
    const items: { finding: any; groups: any[] }[] = [];
    for (const finding of findings) {
      const placing = groups.filter((g) => quadrantForGroup(finding, g) === h.key);
      if (placing.length > 0) items.push({ finding, groups: placing });
    }
    return { ...h, items };
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Roadmap</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          All scored findings, across every group, placed on the timeline by their quadrant.
        </p>
      </div>
      {itemsByHorizon.map((section) => (
        <section key={section.key}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900">{section.horizon}</h3>
            <span className="text-xs font-semibold text-slate-400">{QUADRANT_META[section.key].title}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{section.subtitle}</p>
          {section.items.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {section.items.map(({ finding, groups: placing }) => (
                <button
                  key={finding.id + section.key}
                  type="button"
                  onClick={() => onSelectFinding(finding)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-emerald-300 hover:shadow-sm"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 group-hover:text-emerald-700">
                      {finding.title}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {placing.map((g: any) => (
                        <span key={g.id} className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {g.name}
                        </span>
                      ))}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-400">
              No findings in this quadrant yet.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

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
  const [view, setView] = useState<"findings" | "groups" | "roadmap">("findings");
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

  const findings: any[] = project.findings || [];
  const myScores = (f: any) =>
    scoresForParticipant(f.scores?.participantScores, meId);

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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      {/* Hero Banner */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 lg:px-10">
          <div className="max-w-3xl space-y-2">
            <span className="eyebrow">
              Bewize Workshop &middot; Phase DVF
            </span>
            <h1 className="page-title">
              {project.name}
            </h1>
            {/* The DVC description is still the literal placeholder "test"
                in the database (restoring it to blank awaits the user's
                call); never render that placeholder as if it were copy.
                "Workshop tim X" is the same kind of placeholder — it just
                restates the project name, so it adds nothing here. A real
                description still shows. */}
            {project.description &&
              project.description.trim().toLowerCase() !== "test" &&
              project.description.trim().toLowerCase() !== `workshop tim ${project.name.toLowerCase()}` && (
                <p className="text-sm leading-relaxed text-slate-600">
                  {project.description}
                </p>
              )}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 pt-2 sm:px-6 lg:px-10">
        {/* Findings / Groups — the group view is separate from the
            global findings list. Inside a group are the findings
            assigned to it, as the same cards with D/V/F. */}
        <div className="mb-6 flex items-center gap-2" role="tablist" aria-label="Findings, groups or roadmap">
          <button
            type="button"
            role="tab"
            aria-selected={view === "findings"}
            onClick={() => { setView("findings"); setSelectedGroupId(null); }}
            className={`tab-pill ${view === "findings" ? "tab-pill-active" : ""}`}
          >
            Findings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "groups"}
            onClick={() => { setView("groups"); setSelectedGroupId(null); }}
            className={`tab-pill ${view === "groups" ? "tab-pill-active" : ""}`}
          >
            <Users className="h-3.5 w-3.5" /> Groups
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "roadmap"}
            onClick={() => { setView("roadmap"); setSelectedGroupId(null); }}
            className={`tab-pill ${view === "roadmap" ? "tab-pill-active" : ""}`}
          >
            <Map className="h-3.5 w-3.5" /> Roadmap
          </button>
        </div>

        {view === "roadmap" ? (
          <RoadmapView
            project={project}
            onSelectFinding={(f: any) => router.push(`/${slug}/findings/${f.id}`)}
          />
        ) : view === "groups" ? (
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
                  className="input w-full pl-10 pr-4 py-2"
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
                    className="input px-3 py-2 font-medium text-slate-700"
                  >
                    <option value="ALL">All Sumber</option>
                    {allTags.map((t, idx) => (
                      <option key={idx} value={t}>
                        {t.replace("Sumber: ", "")}
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
                  <FindingCard key={finding.id} finding={finding} meId={meId} plain onSelect={(f) => router.push(`/${slug}/findings/${f.id}`)} />
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
    </div>
  );
}
