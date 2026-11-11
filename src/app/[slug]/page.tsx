"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import FindingPopup from "@/components/FindingPopup";
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
  Lightbulb,
  Layers,
} from "lucide-react";

import { scoresForParticipant, findingBoardPosition, groupAverageScores, findingBoardPositionForScores, calculateDVFScore, type FeasibilityQuadrant, type WeightInput } from "@/lib/scoring";
import { useMeParticipantId } from "@/lib/useMeParticipant";
import { slugify } from "@/lib/slugify";

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
      <div className="flex min-h-8 items-center justify-center text-xs font-semibold leading-relaxed text-slate-600">
        {label}
      </div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
        {value ?? "—"}
      </div>
    </div>
  );
  // Tags are colour-coded by kind so a card scans at a glance:
  // Sumber (research source) BSI teal, Fitur deep teal, Platform slate.
  const tagStyle = (category: string) =>
    category === "Sumber"
      ? "chip-bsi"
      : category === "Fitur"
      ? "chip-deep"
      : "chip-neutral";
  return (
    <div
      onClick={() => onSelect(finding)}
      className="group flex cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-bsi-300 hover:shadow-md"
    >
      <div className="flex-1 space-y-3">
        {/* Fixed two-line height so the tags below always start at the
            same place, whether the title wraps or not. */}
        <h3 className="min-h-[2.75rem] text-base font-semibold leading-snug text-slate-900 transition group-hover:text-bsi-700 line-clamp-2 sm:min-h-[3.125rem] sm:text-lg">
          {finding.title}
        </h3>

        {finding.tagsList && finding.tagsList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {finding.tagsList.map((tag: any, i: number) => (
              <span
                key={i}
                className={`chip ${tagStyle(tag.category || "")}`}
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

        <div className="flex items-center justify-between pt-1 text-xs font-semibold text-bsi-600">
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
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-bsi-700 transition"
          >
            <ArrowLeft className="h-4 w-4" /> All groups
          </button>
          <h2 className="mt-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            {selectedGroup.name}
            {selectedGroup.label && selectedGroup.label.toLowerCase() !== selectedGroup.name.toLowerCase() && (
              <span className="rounded-full bg-bsi-100 px-2 py-0.5 text-xs font-extrabold normal-case tracking-normal text-bsi-800">
                {selectedGroup.label}
              </span>
            )}
            {meId != null && (selectedGroup.participants || []).some((p: any) => p.id === meId) && (
              <span className="rounded-full bg-bsi-100 px-2 py-0.5 text-xs font-extrabold normal-case tracking-normal text-bsi-800">
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
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-bsi-600 border-t-transparent" />
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
        <div className="mt-0.5 space-y-1 text-xs text-slate-500">
          <p>
            Setiap kelompok mewakili satu fungsi: Business &amp; Ops, Tech, atau Product. Setiap kelompok bertugas menilai semua ide berdasarkan aspek yang menjadi tanggung jawabnya. Pilih kelompok Anda untuk melihat daftar ide yang perlu dinilai.
          </p>
          <p>
            <span className="font-semibold">Catatan:</span> Anda dapat melihat hasil penilaian dari kelompok lain, tetapi hanya dapat memberikan atau mengubah nilai untuk kelompok Anda sendiri.
          </p>
        </div>
      </div>
      {groups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((g: any) => {
            // Every group scores every idea in the project, so the
            // count is the project's idea count — already loaded with
            // the project (and filtered by the same Platform rule as
            // the per-group fetch), so it shows instantly instead of
            // waiting for the per-group fetch. The per-group fetch
            // still supplies the detail list when a group is opened.
            const count = groupFindings[g.id]?.length ?? (project.findings || []).length;
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
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-bsi-300 hover:shadow-md"
              >
                {/* Header: icon + name + participant count + chevron (signals it's clickable) */}
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bsi-50 text-bsi-700">
                    <Users className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-base font-bold text-slate-900">{g.name}</span>
                      {g.label && g.label.toLowerCase() !== g.name.toLowerCase() && (
                        <span className="shrink-0 rounded-full bg-bsi-100 px-2 py-0.5 text-xs font-extrabold text-bsi-800">
                          {g.label}
                        </span>
                      )}
                      {isMyGroup && (
                        <span className="shrink-0 rounded-full bg-bsi-100 px-2 py-0.5 text-xs font-extrabold text-bsi-800">
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
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-bsi-600" />
                </div>
                {/* Who's in the group: avatar initials + names */}
                {participants.length > 0 && (
                  <div className="mt-4 flex items-center gap-2.5">
                    <span className="flex shrink-0 -space-x-1.5">
                      {participants.slice(0, 5).map((p: any) => (
                        <span
                          key={p.id}
                          title={p.name}
                          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-bsi-100 text-xs font-bold text-bsi-800"
                        >
                          {initials(p.name)}
                        </span>
                      ))}
                      {participants.length > 5 && (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-xs font-bold text-slate-600">
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-bsi-50 px-2.5 py-1 text-xs font-semibold text-bsi-700 transition group-hover:bg-bsi-100">
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
 *  Jangka Pendek = Quick Wins only, Jangka Menengah = Fill-ins plus
 *  Big Bets whose Effort is below 2.5, Jangka Panjang = Big Bets
 *  whose Effort is 2.5 or above. Avoid is deliberately not on the
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
    { key: "QUICK_WINS", horizon: "Jangka Pendek", subtitle: "High impact, low effort. Do these first.", banner: "bg-bsi-700" },
    { key: "FILL_INS", horizon: "Jangka Menengah", subtitle: "Low impact, low effort. Fit them in next.", banner: "bg-gold-600" },
    { key: "BIG_BETS", horizon: "Jangka Panjang", subtitle: "High impact, high effort. Plan these for later.", banner: "bg-bsi-900" },
  ];

  // A finding's roadmap horizon (null = not on the roadmap). Quick
  // Wins go to Jangka Pendek and Fill-ins to Jangka Menengah; a Big
  // Bet splits on Effort (the average Effort aspect score = 4 − F):
  // below 2.5 it fits Jangka Menengah, 2.5 or above (or F unscored)
  // it stays in Jangka Panjang. Avoid is never on the roadmap.
  const horizonForFinding = (finding: any): "QUICK_WINS" | "FILL_INS" | "BIG_BETS" | null => {
    const quadrant = overallQuadrantFor(finding, groups, meId ? [meId] : []);
    if (quadrant === "QUICK_WINS") return "QUICK_WINS";
    if (quadrant === "FILL_INS") return "FILL_INS";
    if (quadrant === "BIG_BETS") {
      const { f } = overallScoresFor(finding, groups, meId ? [meId] : []);
      const effort = f != null ? 4 - f : null;
      return effort != null && effort < 2.5 ? "FILL_INS" : "BIG_BETS";
    }
    return null;
  };

  // For each horizon quadrant, the findings placed there — ordered by
  // the idea's overall DVF score, highest first. Ideas are assigned
  // to roles, not groups, so each idea has ONE overall position (all
  // roles combined), not one per group.
  const itemsByHorizon = HORIZONS.map((h) => {
    const items: { finding: any; dvf: number | null }[] = [];
    for (const finding of findings) {
      if (horizonForFinding(finding) !== h.key) continue;
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
        <div className="mt-0.5 space-y-1 text-xs text-slate-500">
          <p>
            Semua temuan yang sudah dinilai oleh seluruh kelompok dikelompokkan berdasarkan kuadrannya, kemudian disusun menjadi roadmap jangka pendek, menengah, dan panjang.
          </p>
          <p>
            Urutan pengerjaan: Dalam setiap jangka waktu, inisiatif dengan skor DVF tertinggi dikerjakan lebih dulu.
          </p>
        </div>
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
              <ArrowRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-gold-500 md:block" />
            )}
          </div>
          {section.items.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {section.items.map(({ finding, dvf }) => (
                <button
                  key={finding.id + section.key}
                  type="button"
                  onClick={() => onSelectFinding(finding)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-bsi-300 hover:shadow-sm"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 group-hover:text-bsi-700">
                      {finding.title}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-gold-200 bg-gold-50 px-2.5 py-0.5 text-xs font-bold text-gold-800">
                      DVF {dvf != null ? dvf.toFixed(2) : "N/A"}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-bsi-600" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500">
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
  // All categories start COLLAPSED — the Findings tab opens as a
  // clean list of category headers, and the user expands the ones
  // they want to read. (The first category used to auto-expand on
  // load; that was removed so nothing is open by default.)
  const toggle = (categoryId: string | null) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };
  // Search — same bar as the Ideas tab, so the user can type whatever
  // they want. It matches the title, description, fitur, category
  // name, and verbatim evidence. While a query is active, only
  // categories with a match are shown, and they auto-expand so the
  // matches are visible; clearing the query restores the manual
  // collapsed state.
  const [query, setQuery] = useState("");
  const total = findingsByCategory.reduce((n, g) => n + g.findings.length, 0);
  const q = query.trim().toLowerCase();
  const visibleGroups = findingsByCategory
    .map((group) => {
      if (!q) return group;
      const findings = group.findings.filter((f: any) => {
        const hay = [
          f.title,
          f.description,
          f.fitur,
          group.categoryName,
          f.verbatimEvidence,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
      return { ...group, findings };
    })
    .filter((g) => g.findings.length > 0);
  const matchCount = visibleGroups.reduce((n, g) => n + g.findings.length, 0);
  if (findingsByCategory.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <Lightbulb className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-500">No findings yet</p>
        <p className="mt-1 text-xs text-slate-500">Findings linked to this project&apos;s ideas will appear here, grouped by category.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {/* Search bar — the same one the Ideas tab has. A single row at
          every width: the search takes the space, the result count
          pins to the right, so nothing dangles. */}
      <div className="flex items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <label htmlFor="findings-search" className="sr-only">Search findings</label>
          <input
            id="findings-search"
            type="text"
            placeholder="Search user findings, pain points, or keywords..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input w-full pl-10 pr-4 py-2"
          />
        </div>
        <span className="shrink-0 text-xs font-semibold text-slate-500">
          {matchCount} {matchCount === 1 ? "finding" : "findings"}
        </span>
      </div>
      <p className="text-sm text-slate-500">
        <span className="font-semibold text-slate-700">{total}</span> {total === 1 ? "finding" : "findings"} in{" "}
        <span className="font-semibold text-slate-700">{findingsByCategory.length}</span>{" "}
        {findingsByCategory.length === 1 ? "category" : "categories"}
      </p>
      {matchCount === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Target className="h-10 w-10 text-slate-300 mx-auto" />
          <h3 className="mt-3 text-base font-bold text-slate-800">
            No Findings Match Your Search
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Try clearing the search text.
          </p>
          <button
            onClick={() => setQuery("")}
            className="mt-4 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            Clear Search
          </button>
        </div>
      ) : (
        visibleGroups.map((group) => {
          const open = q ? true : expanded.has(group.categoryId);
          return (
          <section key={group.categoryId ?? "uncategorized"} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <button
              type="button"
              onClick={() => toggle(group.categoryId)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bsi-50 text-bsi-700">
                <Layers className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900 sm:text-base">{group.categoryName}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {group.findings.length} {group.findings.length === 1 ? "finding" : "findings"}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-bsi-50 px-2.5 py-1 text-xs font-bold text-bsi-700">
                {group.findings.length}
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {group.findings.map((f: any) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onSelectFinding({ ...f, categoryName: group.categoryName })}
                      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-bsi-50/50 sm:px-5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 group-hover:text-bsi-700">{f.title}</span>
                        {f.description && String(f.description).trim() !== "" && (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{f.description}</span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-bsi-600" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
        })
      )}
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
  // Clicking an Ideas row opens the IDEA's own detail in a popup —
  // the same fields the admin dashboard Idea form holds (Tujuan,
  // Scope, Role/Users, Step, Apa Yang Berubah, Output, Tujuan Bisnis,
  // Fitur, Platform, linked findings). It used to show the related
  // findings' images instead; that detail now lives on the Findings
  // tab.
  const [ideaDetail, setIdeaDetail] = useState<any | null>(null);
  const [findingDetail, setFindingDetail] = useState<any | null>(null);
  // Which popup is on top. Both popups can be open at once (drill-down
  // in either direction: idea → related finding, or finding → linked
  // idea), and the most recently opened one paints above the other.
  // Set alongside every setIdeaDetail / setFindingDetail that OPENS a
  // popup; closing the top one leaves the other as the only popup, so
  // a stale value here is harmless.
  const [topPopup, setTopPopup] = useState<"idea" | "finding" | null>(null);
  // Lookup for opening a finding's detail from anywhere on the page
  // (e.g. a related finding inside the idea popup): the full finding
  // record — category name + linked ideas — keyed by id.
  const findingById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const g of project?.findingsByCategory || []) {
      for (const f of g.findings || []) {
        map[f.id] = { ...f, categoryName: g.categoryName };
      }
    }
    return map;
  }, [project?.findingsByCategory]);
  // Reverse lookup: the full idea record (detail fields, related
  // findings) keyed by id, for opening an idea from a finding's
  // Linked Ideas list.
  const ideaById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const f of project?.findings || []) {
      map[f.id] = f;
    }
    return map;
  }, [project?.findings]);
  // Same lookups keyed by title slug, for opening a tab/popup from a
  // shared URL (/{slug}/ideas/{idea-title},
  // /{slug}/findings/{finding-title}). First match wins when two
  // titles slugify the same way.
  const ideaBySlug = useMemo(() => {
    const map: Record<string, any> = {};
    for (const f of project?.findings || []) {
      const s = slugify(f.title || "");
      if (s && !map[s]) map[s] = f;
    }
    return map;
  }, [project?.findings]);
  const findingBySlug = useMemo(() => {
    const map: Record<string, any> = {};
    for (const g of project?.findingsByCategory || []) {
      for (const f of g.findings || []) {
        const s = slugify(f.title || "");
        if (s && !map[s]) map[s] = { ...f, categoryName: g.categoryName };
      }
    }
    return map;
  }, [project?.findingsByCategory]);

  // ── URL slugs: the address bar mirrors the current tab + topmost
  // popup, so a tab or an open popup is shareable and the back button
  // walks back through them. Tabs: /{slug}/findings (Findings tab),
  // /{slug}/ideas (Ideas tab), /{slug}/group (Groups tab),
  // /{slug}/roadmap. Popups: /{slug}/findings/{finding-title},
  // /{slug}/ideas/{idea-title}. The URL is updated with pushState
  // (not router.push) so switching tabs/popups never remounts the
  // page or refetches the project; back/forward is handled by the
  // popstate listener below. The base /{slug} is the Findings tab.
  type ProjectView = "findings" | "categories" | "groups" | "roadmap";
  const tabSlugForView = (v: ProjectView) =>
    v === "categories" ? "findings" : v === "findings" ? "ideas" : v === "groups" ? "group" : "roadmap";
  const urlForState = (v: ProjectView, idea: any | null, finding: any | null, top: "idea" | "finding" | null) => {
    if (top === "finding" && finding) return `/${slug}/findings/${slugify(finding.title || "")}`;
    if (top === "idea" && idea) return `/${slug}/ideas/${slugify(idea.title || "")}`;
    return `/${slug}/${tabSlugForView(v)}`;
  };
  const pushUrl = (url: string) => {
    if (typeof window !== "undefined" && window.location.pathname !== url) {
      window.history.pushState(null, "", url);
    }
  };
  // User actions: update the state AND push the matching URL, so the
  // back button steps back through tabs and popups.
  const goToTab = (v: ProjectView) => {
    setView(v);
    setSelectedGroupId(null);
    setIdeaDetail(null);
    setFindingDetail(null);
    setTopPopup(null);
    pushUrl(`/${slug}/${tabSlugForView(v)}`);
  };
  const openIdeaPopup = (idea: any) => {
    setIdeaDetail(idea);
    setTopPopup("idea");
    pushUrl(`/${slug}/ideas/${slugify(idea.title || "")}`);
  };
  const openFindingPopup = (finding: any) => {
    setFindingDetail(finding);
    setTopPopup("finding");
    pushUrl(`/${slug}/findings/${slugify(finding.title || "")}`);
  };
  const closeIdeaPopup = () => {
    const nextTop = findingDetail ? ("finding" as const) : null;
    setIdeaDetail(null);
    setTopPopup(nextTop);
    pushUrl(urlForState(view, null, findingDetail, nextTop));
  };
  const closeFindingPopup = () => {
    const nextTop = ideaDetail ? ("idea" as const) : null;
    setFindingDetail(null);
    setTopPopup(nextTop);
    pushUrl(urlForState(view, ideaDetail, null, nextTop));
  };
  const closeTopPopup = () => {
    if (topPopup === "idea" && ideaDetail) closeIdeaPopup();
    else if (findingDetail) closeFindingPopup();
    else if (ideaDetail) closeIdeaPopup();
  };
  // Apply a URL to the state: parse the path after /{slug} into a tab
  // + optional popup, and open the matching item. Used on first load
  // and on back/forward. A popup slug that matches nothing just shows
  // the tab.
  const applyUrlToState = (pathname: string) => {
    const rest = pathname.split("/").filter(Boolean).slice(1);
    const tabSeg = rest[0];
    const itemSeg = rest[1];
    let nextView: ProjectView = "categories";
    if (tabSeg === "findings") nextView = "categories";
    else if (tabSeg === "ideas") nextView = "findings";
    else if (tabSeg === "group" || tabSeg === "groups") nextView = "groups";
    else if (tabSeg === "roadmap") nextView = "roadmap";
    setView(nextView);
    setSelectedGroupId(null);
    if (itemSeg && tabSeg === "findings") {
      const f = findingBySlug[itemSeg];
      setFindingDetail(f || null);
      setIdeaDetail(null);
      setTopPopup(f ? "finding" : null);
    } else if (itemSeg && tabSeg === "ideas") {
      const idea = ideaBySlug[itemSeg];
      setIdeaDetail(idea || null);
      setFindingDetail(null);
      setTopPopup(idea ? "idea" : null);
    } else {
      setIdeaDetail(null);
      setFindingDetail(null);
      setTopPopup(null);
    }
  };
  // First load: once the project data is in, open whatever the URL
  // asks for (tab + popup). Runs once, so later project refreshes
  // never clobber what the user is doing.
  const didInitialUrlSync = useRef(false);
  useEffect(() => {
    if (didInitialUrlSync.current || !project || typeof window === "undefined") return;
    didInitialUrlSync.current = true;
    applyUrlToState(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);
  // Back/forward: the URL changed without a click, so re-apply it.
  // Reads the latest project + lookups through refs so the listener
  // itself never goes stale.
  const applyUrlRef = useRef(applyUrlToState);
  applyUrlRef.current = applyUrlToState;
  useEffect(() => {
    const onPopState = () => applyUrlRef.current(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!ideaDetail && !findingDetail) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape closes the topmost popup first, then the one beneath it.
      if (e.key === "Escape") closeTopPopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ideaDetail, findingDetail, topPopup]);

  // Groups view — separate from the global findings list. A group shows
  // every idea in the project (ideas are no longer assigned to groups),
  // as the same cards with D/V/F. `groupFindings` is loaded per group
  // from the group-findings endpoint, which returns the project's
  // findings by Platform tag.
  // "findings" is the Ideas tab (pool findings); "categories" is the
  // new Findings tab — the linked findings grouped by category.
  const [view, setView] = useState<"findings" | "categories" | "groups" | "roadmap">("categories");
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
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-bsi-600 border-t-transparent" />
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
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-bsi-600 text-white hover:bg-bsi-700 transition"
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
                  className="inline-flex items-center gap-2 text-left transition hover:text-bsi-700"
                >
                  {project.name}
                  <ChevronDown className={`h-7 w-7 shrink-0 text-slate-500 transition-transform ${switcherOpen ? "rotate-180" : ""}`} />
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
                            setView("categories");
                            setSelectedGroupId(null);
                            setSearchQuery("");
                            setIdeaDetail(null);
                            setFindingDetail(null);
                            setTopPopup(null);
                            router.push(`/${p.slug}`);
                          }}
                          className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition ${
                            isCurrent
                              ? "cursor-default font-semibold text-bsi-700"
                              : "font-medium text-slate-700 hover:bg-bsi-50 hover:text-bsi-700"
                          }`}
                        >
                          <span className="min-w-0 truncate">{p.name}</span>
                          {isCurrent && <Check className="h-4 w-4 shrink-0 text-bsi-600" />}
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
            onClick={() => goToTab("categories")}
            className={`tab-pill ${view === "categories" ? "tab-pill-active" : ""}`}
          >
            <Lightbulb className="h-3.5 w-3.5" /> Findings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "findings"}
            onClick={() => goToTab("findings")}
            className={`tab-pill ${view === "findings" ? "tab-pill-active" : ""}`}
          >
            Ideas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "groups"}
            onClick={() => goToTab("groups")}
            className={`tab-pill ${view === "groups" ? "tab-pill-active" : ""}`}
          >
            <Users className="h-3.5 w-3.5" /> Groups
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "roadmap"}
            onClick={() => goToTab("roadmap")}
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
            onSelectFinding={(f: any) => openFindingPopup(f)}
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
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
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
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                      <th scope="col" className="px-4 py-3">Ideas</th>
                      <th scope="col" className="px-4 py-3">Related Findings</th>
                      <th scope="col" className="px-4 py-3">Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFindings.map((finding) => (
                      <tr
                        key={finding.id}
                        onClick={() => openIdeaPopup(finding)}
                        className="cursor-pointer border-b border-slate-100 transition hover:bg-bsi-50/50 last:border-b-0"
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
                            <span className="text-slate-500">—</span>
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
      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between border-t border-slate-100 px-4 py-6 text-xs font-medium uppercase tracking-[0.2em] text-slate-600 sm:px-6 lg:px-10">
        <span>Bank BSI &times; Aleph</span>
        <span>&copy; Enzi 2026</span>
      </footer>

      {/* Idea-detail popup for the Ideas table. Shows the idea's own
          fields — the same ones the admin dashboard Idea form holds
          (Tujuan, Scope, Role/Users, Step, Apa Yang Berubah, Output,
          Tujuan Bisnis, Fitur, Platform, linked findings). Fields left
          empty are hidden. Responsive: full-width with margins on
          phones, capped at 2xl on desktop, scrolls when taller than
          the viewport. */}
      {ideaDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Idea detail — ${ideaDetail.title}`}
          className={`fixed inset-0 ${topPopup === "idea" ? "z-[110]" : "z-[100]"} flex items-center justify-center p-4`}
        >
          <button
            aria-label="Close"
            onClick={closeIdeaPopup}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold leading-snug text-slate-900 sm:text-lg">{ideaDetail.title}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {(ideaDetail.platform || []).map((p: string) => (
                    <span key={p} className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-600">{p}</span>
                  ))}
                  {ideaDetail.fitur && String(ideaDetail.fitur).trim() !== "" && (
                    <span className="rounded-full bg-bsi-50 px-2.5 py-0.5 font-bold text-bsi-700">{ideaDetail.fitur}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={closeIdeaPopup}
                aria-label="Close dialog"
                className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto px-5 py-4">
              {ideaDetail.description && String(ideaDetail.description).trim() !== "" ? (
                <p className="text-sm leading-relaxed text-slate-700">{ideaDetail.description}</p>
              ) : (
                <p className="text-sm text-slate-500">No description yet.</p>
              )}
              {ideaDetail.tujuan && String(ideaDetail.tujuan).trim() !== "" && (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tujuan</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{ideaDetail.tujuan}</p>
                </section>
              )}
              {(() => {
                // Scope table — one row per aspect (Siapa, Di mana, Apa
                // yang berubah), one column per side (Termasuk / Tidak
                // Termasuk). A row shows when either side has a value;
                // an empty side reads "—". There is no scope description
                // row: the scope is expressed through these three rows.
                const has = (v: any) => v && String(v).trim() !== "";
                const rows = [
                  { label: "Siapa", sub: "Peran atau pengguna", a: ideaDetail.roleUsers, b: ideaDetail.roleUsersTidakTermasuk },
                  { label: "Di mana", sub: "Langkah, fitur, layar", a: ideaDetail.stepFeatureScreen, b: ideaDetail.stepTidakTermasuk },
                  { label: "Apa yang berubah", sub: "Tampilan, alur, sistem", a: ideaDetail.apaYangBerubah, b: ideaDetail.apaYangBerubahTidakTermasuk },
                ].filter((r) => has(r.a) || has(r.b));
                if (rows.length === 0) return null;
                return (
                  <section>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Scope</p>
                    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                      <div className="hidden grid-cols-[140px_1fr_1fr] bg-slate-50 sm:grid">
                        <div className="px-3 py-2" />
                        <div className="border-l border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-bsi-700">Termasuk</div>
                        <div className="border-l border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gold-700">Tidak Termasuk</div>
                      </div>
                      {rows.map((r) => (
                        <div key={r.label} className="grid grid-cols-1 gap-1 border-t border-slate-100 px-3 py-3 sm:grid-cols-[140px_1fr_1fr] sm:gap-0 sm:px-0 sm:py-0">
                          <div className="sm:px-3 sm:py-3">
                            <p className="text-sm font-bold text-slate-800">{r.label}</p>
                            <p className="text-xs text-slate-500">{r.sub}</p>
                          </div>
                          <div className="sm:border-l sm:border-slate-100 sm:px-3 sm:py-3">
                            <span className="mb-0.5 block text-xs font-semibold text-bsi-700 sm:hidden">Termasuk</span>
                            <p className="text-sm leading-relaxed text-slate-700">{has(r.a) ? r.a : "—"}</p>
                          </div>
                          <div className="sm:border-l sm:border-slate-100 sm:px-3 sm:py-3">
                            <span className="mb-0.5 block text-xs font-semibold text-gold-700 sm:hidden">Tidak Termasuk</span>
                            <p className="text-sm leading-relaxed text-slate-700">{has(r.b) ? r.b : "—"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}
              {ideaDetail.outputKeberhasilan && String(ideaDetail.outputKeberhasilan).trim() !== "" && (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Output Keberhasilan</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{ideaDetail.outputKeberhasilan}</p>
                </section>
              )}
              {ideaDetail.tujuanBisnis && String(ideaDetail.tujuanBisnis).trim() !== "" && (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tujuan Bisnis</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{ideaDetail.tujuanBisnis}</p>
                </section>
              )}
              {(ideaDetail.relatedIdeas || []).length > 0 && (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Related findings</p>
                  <ul className="mt-2 space-y-1.5">
                    {(ideaDetail.relatedIdeas || []).map((r: any) => {
                      // Open the finding's own detail popup on top of
                      // this one (drill-down); closing it returns here.
                      // Fall back to the row's own data if the finding
                      // is not in this project's category list.
                      const full = findingById[r.id];
                      const target = full || { ...r, categoryName: "Uncategorized", linkedIdeas: [{ id: ideaDetail.id, title: ideaDetail.title }] };
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => openFindingPopup(target)}
                            className="group flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:border-bsi-300 hover:bg-bsi-50/60 hover:text-bsi-700"
                          >
                            <span className="min-w-0">{r.title}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-bsi-600" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
      {findingDetail && (
        <FindingPopup
          finding={findingDetail}
          onClose={closeFindingPopup}
          onOpenIdea={(li: any) => openIdeaPopup(ideaById[li.id] || li)}
          zIndexClass={topPopup === "finding" ? "z-[110]" : "z-[100]"}
        />
      )}
    </div>
  );
}
