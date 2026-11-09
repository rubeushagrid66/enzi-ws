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
  ChevronDown,
  Check,
} from "lucide-react";

import { scoresForParticipant, findingBoardPosition, groupAverageScores, findingBoardPositionForScores, calculateDVFScore, type FeasibilityQuadrant, type WeightInput } from "@/lib/scoring";
import { useMeParticipantId } from "@/lib/useMeParticipant";

// Equal-thirds fallback for the DVF weights (framework is 33/33/33
// today); the live weights are fetched and replace this.
const EQUAL_THIRDS: WeightInput[] = [
  { name: "Desirability", weight: 33 },
  { name: "Viability", weight: 33 },
  { name: "Feasibility", weight: 33 },
];

// Quadrant display names, shared by the per-group quadrant sections
// and the Roadmap.
const QUADRANT_META: Record<FeasibilityQuadrant, { title: string; detail: string }> = {
  QUICK_WINS: { title: "Quick Wins", detail: "High Impact, Low Effort" },
  BIG_BETS: { title: "Big Bets", detail: "High Impact, High Effort" },
  FILL_INS: { title: "Fill-ins", detail: "Low Impact, Low Effort" },
  AVOID: { title: "Avoid", detail: "Low Impact, High Effort" },
};

/** A finding's D/V/F FOR one group. D is the finding's research score
 *  (same for every group in the project); V/F are this group's
 *  participant averages. All null when the finding isn't assigned to
 *  (or open to) this group, or the group has no complete score. */
function groupScoresFor(finding: any, group: any): { d: number | null; v: number | null; f: number | null } {
  const assigned: string[] = finding.groupIds || [];
  if (assigned.length > 0 && !assigned.includes(group.id)) return { d: null, v: null, f: null };
  const participantIds: string[] = (group.participants || [])
    .filter((p: any) => p.isActive !== false && p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR")
    .map((p: any) => p.id);
  const vf = groupAverageScores(finding.scores?.participantScores, participantIds);
  return { d: finding.scores?.desirability ?? null, v: vf.viability, f: vf.feasibility };
}

/** A finding's quadrant FOR one group (null when it has none there).
 *  Assignment gates the quadrant: a finding only has a quadrant for
 *  the groups it is assigned to (or every group when unassigned).
 *  This check must come first — a manual pin would otherwise give the
 *  finding a quadrant for every group, even ones it isn't assigned
 *  to. A manual pin wins over the computed position, same as the
 *  board. */
function quadrantForGroup(finding: any, group: any): FeasibilityQuadrant | null {
  const assigned: string[] = finding.groupIds || [];
  if (assigned.length > 0 && !assigned.includes(group.id)) return null;
  const { d, v, f } = groupScoresFor(finding, group);
  return findingBoardPositionForScores(finding, d, v, f).quadrant;
}

function FindingCard({
  finding,
  meId,
  onSelect,
  group,
}: {
  finding: any;
  meId: string | null;
  onSelect: (f: any) => void;
  /** When given (inside a group), the card shows THIS group's V/F and
      quadrant, matching its section and the detail page — not the
      logged-in viewer's own scores. */
  group?: any;
}) {
  const s = finding.scores || {};
  // V/F and quadrant: inside a group these are the GROUP's values
  // (group averages, same as the detail page and the section the card
  // sits under). Without a group they fall back to the logged-in
  // viewer's own scores.
  const groupVF = group ? groupScoresFor(finding, group) : null;
  const my = scoresForParticipant(s.participantScores, meId);
  const shownV = groupVF ? groupVF.v : my.viability;
  const shownF = groupVF ? groupVF.f : my.feasibility;
  // The quadrant: the group's (assignment-gated, pinned or computed
  // from the group's D/V/F), or the viewer's board position without
  // a group.
  const quad = group ? quadrantForGroup(finding, group) : findingBoardPosition(finding, meId).quadrant;
  const pinned = finding?.feasibilityManual === true && finding?.feasibilityX != null && finding?.feasibilityY != null;
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
  // Tags are colour-coded by kind so a card scans at a glance:
  // Sumber (research source) emerald, Fitur blue, Platform slate.
  const tagStyle = (category: string) =>
    category === "Sumber"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : category === "Fitur"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-slate-200 bg-slate-100 text-slate-600";
  return (
    <div
      onClick={() => onSelect(finding)}
      className="group flex cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
    >
      <div className="flex-1 space-y-3">
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
              {pinned && " · manual"}
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
              Awaiting scoring
            </span>
          )}
        </div>

        {/* Fixed two-line height so the tags below always start at the
            same place, whether the title wraps or not. */}
        <h3 className="min-h-[2.75rem] text-base font-semibold leading-snug text-slate-900 transition group-hover:text-emerald-700 line-clamp-2 sm:min-h-[3.125rem] sm:text-lg">
          {finding.title}
        </h3>

        {finding.tagsList && finding.tagsList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {finding.tagsList.map((tag: any, i: number) => (
              <span
                key={i}
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${tagStyle(tag.category || "")}`}
              >
                {tag.category ? `${tag.category}: ${tag.value}` : tag.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Pinned to the card bottom so the score strip and link align
          across every card in the row, whatever the title/tags above. */}
      <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {scoreBox("Desirability", s.desirability != null ? `${s.desirability} / 3` : null)}
          {scoreBox("Viability & Feasibility", shownV != null ? `${shownV} / 3` : null)}
          {scoreBox("Matrix", shownF != null ? `${shownF} / 3` : null)}
        </div>

        <div className="flex items-center justify-between pt-1 text-xs font-semibold text-emerald-600">
          <span>View details</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
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
                        group={selectedGroup}
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
                <p className="mt-0.5 text-xs text-slate-500">No quadrant yet — score the idea to place it.</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {byQuadrant.UNPLACED.map((finding: any) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      meId={meId}
                      group={selectedGroup}
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
            <h3 className="mt-3 text-base font-bold text-slate-800">No ideas in this group yet</h3>
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
                  {count != null ? `${count} idea${count === 1 ? "" : "s"}` : "Loading ideas…"}
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
  weights,
  onSelectFinding,
}: {
  project: any;
  weights: WeightInput[] | null;
  onSelectFinding: (f: any) => void;
}) {
  const groups: any[] = (project.groups || []).filter((g: any) => g.isActive !== false);
  const findings: any[] = project.findings || [];

  const HORIZONS: {
    key: "QUICK_WINS" | "FILL_INS" | "BIG_BETS";
    horizon: string;
    subtitle: string;
  }[] = [
    { key: "QUICK_WINS", horizon: "Jangka Pendek", subtitle: "High impact, low effort. Do these first." },
    { key: "FILL_INS", horizon: "Jangka Menengah", subtitle: "Low impact, low effort. Fit them in next." },
    { key: "BIG_BETS", horizon: "Jangka Panjang", subtitle: "High impact, high effort. Plan these for later." },
  ];

  // For each horizon quadrant, the findings placed there, with the
  // groups that place them there — ordered by DVF score, highest
  // first. A finding placed by several groups takes its best DVF
  // among those groups, so the order reflects its strongest case.
  const itemsByHorizon = HORIZONS.map((h) => {
    const items: { finding: any; groups: any[]; dvf: number | null }[] = [];
    for (const finding of findings) {
      const placing = groups.filter((g) => quadrantForGroup(finding, g) === h.key);
      if (placing.length === 0) continue;
      const dvfs = placing
        .map((g) => {
          const { d, v, f } = groupScoresFor(finding, g);
          return calculateDVFScore(d, v, f, weights ?? EQUAL_THIRDS);
        })
        .filter((x): x is number => x != null);
      const dvf = dvfs.length > 0 ? Math.max(...dvfs) : null;
      items.push({ finding, groups: placing, dvf });
    }
    items.sort((a, b) => (b.dvf ?? -1) - (a.dvf ?? -1));
    return { ...h, items };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Roadmap</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          All scored findings, across every group, placed on the timeline by their quadrant.
        </p>
      </div>
      {/* Three horizon columns side by side on tablet/desktop, stacked
          on mobile. Each column is headed by the horizon name only —
          no quadrant label. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {itemsByHorizon.map((section) => (
        <section key={section.key}>
          <h3 className="text-base font-bold text-slate-900">{section.horizon}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{section.subtitle}</p>
          {section.items.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {section.items.map(({ finding, groups: placing, dvf }) => (
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
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                      DVF {dvf != null ? dvf.toFixed(2) : "N/A"}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-400">
              No findings here yet.
            </p>
          )}
        </section>
      ))}
      </div>
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

  // Groups view — separate from the global findings list. A group shows
  // the findings assigned to it (admin + facilitator assign them in the
  // dashboard), as the same cards with D/V/F. `groupFindings` is loaded
  // per group from the group-findings endpoint, so a finding from the
  // other project assigned to this group shows here too.
  const [view, setView] = useState<"findings" | "groups" | "roadmap">("findings");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupFindings, setGroupFindings] = useState<Record<string, any[]>>({});
  const [groupFindingsLoading, setGroupFindingsLoading] = useState(false);

  // Project switcher — the list of all projects for the header
  // dropdown, fetched once. Picking one navigates to its slug, which
  // re-loads this page with that project's data (the load effect
  // depends on `slug`).
  const [projects, setProjects] = useState<any[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.projects)) setProjects(data.projects);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Framework weights for the Roadmap's DVF ordering (global, from
  // Framework & Weighting — today 33/33/33). Fetched once; the
  // equal-thirds fallback keeps the order right before it lands.
  const [weights, setWeights] = useState<WeightInput[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/global/weights", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.weights?.length) setWeights(data.weights);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const loadGroupFindings = async (groupId: string) => {
    setGroupFindingsLoading(true);
    try {
      const res = await fetch(`/api/projects/${slug}/groups/${groupId}/findings`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load group ideas");
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

  // Filter findings — the search matches the title, description,
  // linked finding titles, and platform names, so the table narrows
  // to what the user is looking for from one box.
  const filteredFindings = findings.filter((f) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchDesc = (f.description || "").toLowerCase().includes(q);
      const matchRelated = (f.relatedIdeas || []).some((r: any) =>
        (r.title || "").toLowerCase().includes(q)
      );
      const matchPlatform = (f.platform || []).some((p: string) =>
        p.toLowerCase().includes(q)
      );
      if (!matchTitle && !matchDesc && !matchRelated && !matchPlatform) return false;
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
            {/* Project name doubles as the project switcher — a
                chevron sits next to it; clicking the title opens the
                dropdown to jump to the other workshop. Picking one
                navigates to its URL, which re-loads this page with that
                project's data (view and search reset, like a fresh
                visit). */}
            <div className="relative">
              <h1 className="page-title">
                <button
                  type="button"
                  onClick={() => setSwitcherOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={switcherOpen}
                  className="inline-flex items-center gap-2 text-left transition hover:text-emerald-700"
                >
                  {project.name}
                  <ChevronDown className={`h-7 w-7 shrink-0 text-slate-400 transition-transform ${switcherOpen ? "rotate-180" : ""}`} />
                </button>
              </h1>
              {switcherOpen && projects.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Close project switcher"
                    onClick={() => setSwitcherOpen(false)}
                    className="fixed inset-0 z-10 cursor-default bg-transparent"
                  />
                  <div
                    role="listbox"
                    className="absolute left-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-lg"
                  >
                    {projects.map((p: any) => {
                      const isCurrent = p.slug === slug;
                      return (
                        <button
                          key={p.slug}
                          type="button"
                          role="option"
                          aria-selected={isCurrent}
                          disabled={isCurrent}
                          onClick={() => {
                            setSwitcherOpen(false);
                            if (isCurrent) return;
                            setView("findings");
                            setSelectedGroupId(null);
                            setSearchQuery("");
                            router.push(`/${p.slug}`);
                          }}
                          className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition ${
                            isCurrent
                              ? "cursor-default font-semibold text-emerald-700"
                              : "font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                          }`}
                        >
                          <span className="min-w-0 truncate">{p.name}</span>
                          {isCurrent && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
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
        <div className="mb-6 flex items-center gap-2" role="tablist" aria-label="Ideas, groups or roadmap">
          <button
            type="button"
            role="tab"
            aria-selected={view === "findings"}
            onClick={() => { setView("findings"); setSelectedGroupId(null); }}
            className={`tab-pill ${view === "findings" ? "tab-pill-active" : ""}`}
          >
            Ideas
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
            weights={weights}
            onSelectFinding={(f: any) => router.push(`/${slug}/ideas/${f.id}`)}
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
            onSelectFinding={(f: any) => router.push(`/${slug}/ideas/${f.id}`)}
          />
        ) : (
        <>
        {/* FINDINGS DIRECTORY */}
          <div className="space-y-6">
            {/* Search bar — the only control above the table. A single
                row at every width: the search takes the space, the
                result count pins to the right, so nothing dangles. */}
            <div className="flex items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="relative min-w-0 flex-1">
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
              <span className="shrink-0 text-xs font-semibold text-slate-500">
                {filteredFindings.length} idea{filteredFindings.length === 1 ? "" : "s"}
              </span>
            </div>



            {/* Ideas table — a plain listing: title, linked findings,
                platform. No chips or labels; the row itself opens the
                detail page. */}
            {filteredFindings.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th scope="col" className="px-4 py-3">Ideas</th>
                      <th scope="col" className="px-4 py-3">Related Findings</th>
                      <th scope="col" className="px-4 py-3">Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFindings.map((finding) => (
                      <tr
                        key={finding.id}
                        onClick={() => router.push(`/${slug}/ideas/${finding.id}`)}
                        className="cursor-pointer border-b border-slate-100 transition hover:bg-emerald-50/50 last:border-b-0"
                      >
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-semibold leading-snug text-slate-900">{finding.title}</div>
                          {finding.description && (
                            <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{finding.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          {finding.relatedIdeas && finding.relatedIdeas.length > 0 ? (
                            <div className="leading-snug text-slate-700">
                              {finding.relatedIdeas.map((r: any) => r.title).join(", ")}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top whitespace-nowrap text-slate-700">
                          {(finding.platform || []).length > 0 ? finding.platform.join(", ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <Target className="h-10 w-10 text-slate-300 mx-auto" />
                <h3 className="mt-3 text-base font-bold text-slate-800">
                  No Ideas Match Your Filters
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Try clearing the search text.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                  }}
                  className="mt-4 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  Clear Search
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
