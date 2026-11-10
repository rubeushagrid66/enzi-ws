"use client";

import React, { useState, useEffect, useRef } from "react";
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
  ChevronRight,
  Check,
  X,
  ImageOff,
  Lightbulb,
  Layers,
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

/** A finding's D/V/F for the IDEA (all roles combined). Ideas are
 *  assigned to roles, not groups: every role scores the same idea,
 *  but only on its own label's aspects. Averaging across every
 *  scorer in the project gives the idea's single overall V/F — the
 *  number the detail page, the cards and the Roadmap all show. */
function overallScoresFor(finding: any, groups: any[], extraParticipantIds: string[] = []): { d: number | null; v: number | null; f: number | null } {
  const participantIds: string[] = [
    ...groups.flatMap((g: any) => (g.participants || []))
      .filter((p: any) => p.isActive !== false && p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR")
      .map((p: any) => p.id),
    // The viewer's own id: ADMIN/FACILITATOR score as themselves in
    // any group, so their vote counts here even though their row lives
    // in only one group.
    ...extraParticipantIds,
  ];
  const vf = groupAverageScores(finding.scores?.participantScores, participantIds);
  return { d: finding.scores?.desirability ?? null, v: vf.viability, f: vf.feasibility };
}

/** A finding's quadrant for the IDEA (null when it has none). */
function overallQuadrantFor(finding: any, groups: any[], extraParticipantIds: string[] = []): FeasibilityQuadrant | null {
  const { d, v, f } = overallScoresFor(finding, groups, extraParticipantIds);
  return findingBoardPositionForScores(finding, d, v, f).quadrant;
}

function FindingCard({
  finding,
  meId,
  onSelect,
  groups,
}: {
  finding: any;
  meId: string | null;
  onSelect: (f: any) => void;
  /** All groups in the project: the card shows the IDEA's overall
      V/F (all roles combined), not one group's values. */
  groups: any[];
}) {
  const s = finding.scores || {};
  // V/F: the idea's overall values (all roles combined). Without any
  // scorer they fall back to the logged-in viewer's own scores.
  const overallVF = overallScoresFor(finding, groups, meId ? [meId] : []);
  const my = scoresForParticipant(s.participantScores, meId);
  const shownV = overallVF.v ?? my.viability;
  const shownF = overallVF.f ?? my.feasibility;
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
      <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
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
 *  project's groups; opening a group shows every idea in the project
 *  as the same cards with D/V/F (ideas are no longer assigned to
 *  groups — each group is a label team: Product, Tech, or
 *  Business & Ops — and scores every idea on its own label's
 *  aspects). */
// Initials for a participant's avatar circle: first letter of the first
// two words ("Biz CMS 1" -> "BC", "John Doe" -> "JD", "Naimy" -> "N").
function initials(name: string): string {
  const words = (name || "").split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]).join("");
  return (letters || "?").toUpperCase();
}

function GroupsView({
  project,
  slug,
  meId,
  currentUserRole,
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
  currentUserRole?: string | null;
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
          <h2 className="mt-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            {selectedGroup.name}
            {selectedGroup.label && selectedGroup.label.toLowerCase() !== selectedGroup.name.toLowerCase() && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold normal-case tracking-normal text-violet-800">
                {selectedGroup.label}
              </span>
            )}
            {meId != null && (selectedGroup.participants || []).some((p: any) => p.id === meId) && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold normal-case tracking-normal text-emerald-800">
                Me
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {(selectedGroup.participants || []).filter((p: any) => p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR").map((p: any) => p.name).join(", ") || "No participants yet"}
            {" · "}
            {findings ? `${findings.length} idea${findings.length === 1 ? "" : "s"}` : "…"}
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          </div>
        ) : findings && findings.length > 0 ? (
          // One flat grid — no separation by quadrant, score, or status.
          // Fixed columns (1 / 2 / 3) so every card keeps the same width:
          // a lone card takes one column instead of stretching full-width.
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {findings.map((finding: any) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                meId={meId}
                groups={groups}
                onSelect={onSelectFinding}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <Users className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="mt-3 text-base font-bold text-slate-800">No ideas in this group yet</h3>
            <p className="mt-1 text-xs text-slate-500">
              Ideas are added to the project from the dashboard (Ideas &amp; Tags).
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
          Each group is a label team — Product, Tech, or Business &amp; Ops — and scores every idea in the project on its own label&apos;s aspects. Open a group to see its ideas.
        </p>
      </div>
      {groups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((g: any) => {
            const count = groupFindings[g.id]?.length;
            const participants: any[] = (g.participants || []).filter((p: any) => p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR");
            // "Me": this group holds the viewer's own participant row.
            // ADMIN/FACILITATOR are overseers, not group members — they
            // never get a "Me", even though an "Enzi Lead Admin"
            // participant row exists in the group.
            const isPrivileged = currentUserRole === "ADMIN" || currentUserRole === "FACILITATOR";
            const isMyGroup = !isPrivileged && meId != null && (g.participants || []).some((p: any) => p.id === meId);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onOpenGroup(g.id)}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
              >
                {/* Header: icon + name + participant count + chevron (signals it's clickable) */}
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                    <Users className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-base font-bold text-slate-900">{g.name}</span>
                      {g.label && g.label.toLowerCase() !== g.name.toLowerCase() && (
                        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-800">
                          {g.label}
                        </span>
                      )}
                      {isMyGroup && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                          Me
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {participants.length > 0
                        ? `${participants.length} participant${participants.length === 1 ? "" : "s"}`
                        : "No participants yet"}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                </div>
                {/* Who's in the group: avatar initials + names */}
                {participants.length > 0 && (
                  <div className="mt-4 flex items-center gap-2.5">
                    <span className="flex shrink-0 -space-x-1.5">
                      {participants.slice(0, 5).map((p: any) => (
                        <span
                          key={p.id}
                          title={p.name}
                          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-violet-100 text-[10px] font-bold text-violet-800"
                        >
                          {initials(p.name)}
                        </span>
                      ))}
                      {participants.length > 5 && (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-600">
                          +{participants.length - 5}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 truncate text-xs text-slate-500">
                      {participants.map((p: any) => p.name).join(", ")}
                    </span>
                  </div>
                )}
                {/* Footer: idea count (stat) + CTA */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-sm">
                    {count != null ? (
                      <>
                        <span className="font-bold text-slate-900">{count}</span>{" "}
                        <span className="text-slate-500">idea{count === 1 ? "" : "s"}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">Loading ideas…</span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition group-hover:bg-emerald-100">
                    View Ideas <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
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
 *  quadrant, so a finding in different quadrants for different groups
 *  shows in each matching horizon. Cards show only the idea title and
 *  its DVF score — the placing group names are hidden. */
function RoadmapView({
  project,
  weights,
  onSelectFinding,
  meId,
}: {
  project: any;
  weights: WeightInput[] | null;
  onSelectFinding: (f: any) => void;
  meId: string | null;
}) {
  const groups: any[] = (project.groups || []).filter((g: any) => g.isActive !== false);
  const findings: any[] = project.findings || [];

  const HORIZONS: {
    key: "QUICK_WINS" | "FILL_INS" | "BIG_BETS";
    horizon: string;
    subtitle: string;
    banner: string;
  }[] = [
    { key: "QUICK_WINS", horizon: "Jangka Pendek", subtitle: "High impact, low effort. Do these first.", banner: "bg-teal-700" },
    { key: "FILL_INS", horizon: "Jangka Menengah", subtitle: "Low impact, low effort. Fit them in next.", banner: "bg-amber-600" },
    { key: "BIG_BETS", horizon: "Jangka Panjang", subtitle: "High impact, high effort. Plan these for later.", banner: "bg-teal-900" },
  ];

  // For each horizon quadrant, the findings placed there — ordered by
  // the idea's overall DVF score, highest first. Ideas are assigned
  // to roles, not groups, so each idea has ONE overall position (all
  // roles combined), not one per group.
  const itemsByHorizon = HORIZONS.map((h) => {
    const items: { finding: any; dvf: number | null }[] = [];
    for (const finding of findings) {
      if (overallQuadrantFor(finding, groups, meId ? [meId] : []) !== h.key) continue;
      const { d, v, f } = overallScoresFor(finding, groups, meId ? [meId] : []);
      const dvf = calculateDVFScore(d, v, f, weights ?? EQUAL_THIRDS);
      items.push({ finding, dvf });
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
          on mobile. Each column is headed by a colored banner (teal /
          amber / dark teal, white text) with a timeline arrow into the
          next column on desktop. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {itemsByHorizon.map((section, idx) => (
        <section key={section.key}>
          <div className={`relative rounded-xl px-4 py-3 ${section.banner}`}>
            <h3 className="text-base font-bold text-white">{section.horizon}</h3>
            <p className="mt-0.5 text-xs text-white/90">{section.subtitle}</p>
            {idx < itemsByHorizon.length - 1 && (
              <ArrowRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-amber-500 md:block" />
            )}
          </div>
          {section.items.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {section.items.map(({ finding, dvf }) => (
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
              N/A
            </p>
          )}
        </section>
      ))}
      </div>
    </div>
  );
}

// FINDINGS BY CATEGORY — the Findings tab: every finding linked to
// one of this project's ideas, grouped under its category. Each
// group expands to list its findings; clicking one opens the detail
// popup. Responsive: full-width rows that stack naturally on mobile.
function FindingsByCategoryView({
  findingsByCategory,
  onSelectFinding,
}: {
  findingsByCategory: Array<{ categoryId: string | null; categoryName: string; findings: any[] }>;
  onSelectFinding: (f: any) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string | null>>(new Set());
  const didAutoExpand = useRef(false);
  useEffect(() => {
    // Open the first category once the data arrives, so the tab is
    // not an empty wall of headers. After that the user owns the
    // expand/collapse state.
    if (!didAutoExpand.current && findingsByCategory.length > 0) {
      didAutoExpand.current = true;
      setExpanded(new Set([findingsByCategory[0].categoryId]));
    }
  }, [findingsByCategory]);
  const toggle = (categoryId: string | null) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };
  const total = findingsByCategory.reduce((n, g) => n + g.findings.length, 0);
  if (findingsByCategory.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <Lightbulb className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-500">No findings yet</p>
        <p className="mt-1 text-xs text-slate-400">Findings linked to this project&apos;s ideas will appear here, grouped by category.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        <span className="font-semibold text-slate-700">{total}</span> {total === 1 ? "finding" : "findings"} in{" "}
        <span className="font-semibold text-slate-700">{findingsByCategory.length}</span>{" "}
        {findingsByCategory.length === 1 ? "category" : "categories"}
      </p>
      {findingsByCategory.map((group) => {
        const open = expanded.has(group.categoryId);
        return (
          <section key={group.categoryId ?? "uncategorized"} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <button
              type="button"
              onClick={() => toggle(group.categoryId)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Layers className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900 sm:text-base">{group.categoryName}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {group.findings.length} {group.findings.length === 1 ? "finding" : "findings"}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                {group.findings.length}
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {group.findings.map((f: any) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onSelectFinding({ ...f, categoryName: group.categoryName })}
                      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-emerald-50/50 sm:px-5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 group-hover:text-emerald-700">{f.title}</span>
                        {f.description && String(f.description).trim() !== "" && (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{f.description}</span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
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

  // Image-evidence popup for the Ideas table: the clicked idea (pool
  // item). Its related findings' uploaded images show here — the row
  // no longer opens the detail page (that lives under each group).
  const [imagePopup, setImagePopup] = useState<any | null>(null);
  const [findingDetail, setFindingDetail] = useState<any | null>(null);
  useEffect(() => {
    if (!imagePopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImagePopup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imagePopup]);

  // Groups view — separate from the global findings list. A group shows
  // every idea in the project (ideas are no longer assigned to groups),
  // as the same cards with D/V/F. `groupFindings` is loaded per group
  // from the group-findings endpoint, which returns the project's
  // findings by Platform tag.
  // "findings" is the Ideas tab (pool findings); "categories" is the
  // new Findings tab — the linked findings grouped by category.
  const [view, setView] = useState<"findings" | "categories" | "groups" | "roadmap">("findings");
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
  // manual reload. Throttled to at most once per 30s: without this,
  // every alt-tab back re-ran the whole project load (all Supabase
  // queries, no cache), so 15 people switching tabs at once hammered
  // the database for no new data.
  const lastFocusRefreshRef = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 30_000) return;
      lastFocusRefreshRef.current = now;
      loadProjectData(true);
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
        <div className="mb-6 flex items-center gap-2 overflow-x-auto" role="tablist" aria-label="Findings, ideas, groups or roadmap">
          <button
            type="button"
            role="tab"
            aria-selected={view === "categories"}
            onClick={() => { setView("categories"); setSelectedGroupId(null); }}
            className={`tab-pill ${view === "categories" ? "tab-pill-active" : ""}`}
          >
            <Lightbulb className="h-3.5 w-3.5" /> Findings
          </button>
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
            meId={meId}
            onSelectFinding={(f: any) => router.push(`/${slug}/ideas/${f.id}`)}
          />
        ) : view === "groups" ? (
          <GroupsView
            project={project}
            slug={slug}
            meId={meId}
            currentUserRole={currentUser?.role ?? null}
            selectedGroupId={selectedGroupId}
            groupFindings={groupFindings}
            groupFindingsLoading={groupFindingsLoading}
            onOpenGroup={openGroup}
            onBackToGroups={() => setSelectedGroupId(null)}
            onSelectFinding={(f: any) => router.push(`/${slug}/ideas/${f.id}`)}
          />
        ) : view === "categories" ? (
          <FindingsByCategoryView
            findingsByCategory={project?.findingsByCategory || []}
            onSelectFinding={(f: any) => setFindingDetail(f)}
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
                platform. No chips or labels; clicking a row opens the
                image-evidence popup (the detail page lives under each
                group instead). */}
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
                        onClick={() => setImagePopup(finding)}
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

      {/* Image-evidence popup for the Ideas table. Shows the images
          uploaded on this idea's related findings; "No image
          reference" when none of them has one. Responsive: full-width
          with margins on phones, capped at 2xl on desktop, scrolls
          when the content is taller than the viewport. */}
      {imagePopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Image evidence — ${imagePopup.title}`}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <button
            aria-label="Close"
            onClick={() => setImagePopup(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold leading-snug text-slate-900 sm:text-lg">{imagePopup.title}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Image, description and sub findings from related findings</p>
              </div>
              <button
                type="button"
                onClick={() => setImagePopup(null)}
                aria-label="Close dialog"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              {(() => {
                // Show every related finding that has something to show —
                // an image, a description, or sub findings (each with a
                // Fitur, a description, and/or image evidences). A
                // finding with none of those is skipped. The description
                // comes from the finding's Description field (set when
                // the finding is created).
                const hasSubContent = (r: any) =>
                  (r.subFindings || []).some(
                    (s: any) =>
                      (s.fitur && String(s.fitur).trim() !== "") ||
                      (s.description && String(s.description).trim() !== "") ||
                      (s.images || []).length > 0
                  );
                const withContent = (imagePopup.relatedIdeas || []).filter(
                  (r: any) =>
                    r.imageUrl || (r.description && String(r.description).trim() !== "") || hasSubContent(r)
                );
                if (withContent.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <ImageOff className="h-10 w-10 text-slate-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-500">No image, description or sub findings</p>
                      <p className="mt-1 text-xs text-slate-400">None of this idea&apos;s related findings has an uploaded image, a description, or sub findings yet.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-6">
                    {withContent.map((r: any) => (
                      <figure key={r.id}>
                        {r.imageUrl && (
                          <img src={r.imageUrl} alt={`Image evidence for ${r.title}`} className="h-auto w-full rounded-xl border border-slate-200 object-contain" />
                        )}
                        <figcaption className="mt-2 text-xs font-medium text-slate-500">{r.title}</figcaption>
                        {r.description && String(r.description).trim() !== "" && (
                          <p className="mt-1 text-sm leading-relaxed text-slate-700">{r.description}</p>
                        )}
                        {(r.subFindings || []).filter((s: any) =>
                          (s.fitur && String(s.fitur).trim() !== "") ||
                          (s.description && String(s.description).trim() !== "") ||
                          (s.images || []).length > 0
                        ).map((s: any, si: number) => (
                          <div key={s.id || si} className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              Sub Finding {si + 1}{s.fitur ? ` — ${s.fitur}` : ""}
                            </p>
                            {s.description && String(s.description).trim() !== "" && (
                              <p className="mt-1 text-sm leading-relaxed text-slate-700">{s.description}</p>
                            )}
                            {(s.images || []).map((im: any, ii: number) => (
                              <figure key={ii} className="mt-2">
                                <img src={im.image_url} alt={`Sub finding ${si + 1} evidence ${ii + 1}`} className="h-auto w-full rounded-lg border border-slate-200 object-contain" />
                                {im.description && String(im.description).trim() !== "" && (
                                  <figcaption className="mt-1 text-xs text-slate-500">{im.description}</figcaption>
                                )}
                              </figure>
                            ))}
                          </div>
                        ))}
                      </figure>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {findingDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Finding detail — ${findingDetail.title}`}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <button
            aria-label="Close"
            onClick={() => setFindingDetail(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold leading-snug text-slate-900 sm:text-lg">{findingDetail.title}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700">
                    {findingDetail.categoryName || "Uncategorized"}
                  </span>
                  {(findingDetail.linkedIdeas || []).length > 0 && (
                    <span>Linked to {(findingDetail.linkedIdeas || []).length} {(findingDetail.linkedIdeas || []).length === 1 ? "idea" : "ideas"}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFindingDetail(null)}
                aria-label="Close dialog"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto px-5 py-4">
              {findingDetail.imageUrl && (
                <img src={findingDetail.imageUrl} alt={`Image evidence for ${findingDetail.title}`} className="h-auto w-full rounded-xl border border-slate-200 object-contain" />
              )}
              {findingDetail.description && String(findingDetail.description).trim() !== "" ? (
                <p className="text-sm leading-relaxed text-slate-700">{findingDetail.description}</p>
              ) : (
                <p className="text-sm text-slate-400">No description yet.</p>
              )}
              {(findingDetail.subFindings || []).filter((s: any) =>
                (s.fitur && String(s.fitur).trim() !== "") ||
                (s.description && String(s.description).trim() !== "") ||
                (s.images || []).length > 0
              ).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sub findings</p>
                  <div className="mt-2 space-y-3">
                    {(findingDetail.subFindings || []).filter((s: any) =>
                      (s.fitur && String(s.fitur).trim() !== "") ||
                      (s.description && String(s.description).trim() !== "") ||
                      (s.images || []).length > 0
                    ).map((s: any, si: number) => (
                      <div key={s.id || si} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Sub Finding {si + 1}{s.fitur ? ` — ${s.fitur}` : ""}
                        </p>
                        {s.description && String(s.description).trim() !== "" && (
                          <p className="mt-1 text-sm leading-relaxed text-slate-700">{s.description}</p>
                        )}
                        {(s.images || []).map((im: any, ii: number) => (
                          <figure key={ii} className="mt-2">
                            <img src={im.image_url} alt={`Sub finding ${si + 1} evidence ${ii + 1}`} className="h-auto w-full rounded-lg border border-slate-200 object-contain" />
                            {im.description && String(im.description).trim() !== "" && (
                              <figcaption className="mt-1 text-xs text-slate-500">{im.description}</figcaption>
                            )}
                          </figure>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(findingDetail.linkedIdeas || []).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Linked ideas</p>
                  <ul className="mt-2 space-y-1.5">
                    {(findingDetail.linkedIdeas || []).map((li: any) => (
                      <li key={li.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm font-medium text-slate-700">
                        {li.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
