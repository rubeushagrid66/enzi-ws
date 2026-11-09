"use client";

import React, { useState, useEffect } from "react";
import {
  Target,
  Users2,
  Compass,
  HelpCircle,
} from "lucide-react";
import FeasibilityMatrix from "./FeasibilityMatrix";
import ViabilityVoteMatrix from "./ViabilityVoteMatrix";
import { groupAverageScores, normalizeFramework, findingBoardPositionForScores, calculateDVFScore, type FeasibilityQuadrant, type WeightInput } from "@/lib/scoring";

// Quadrant display names + what they mean, shared by the Matrix score
// box and the board. The Matrix box shows the quadrant the finding
// lands in — not the F number — because that is what "Matrix" means.
const QUADRANT_LABEL: Record<FeasibilityQuadrant, { title: string; detail: string }> = {
  QUICK_WINS: { title: "Quick Wins", detail: "High Impact, Low Effort" },
  BIG_BETS: { title: "Big Bets", detail: "High Impact, High Effort" },
  FILL_INS: { title: "Fill-ins", detail: "Low Impact, Low Effort" },
  AVOID: { title: "Avoid", detail: "Low Impact, High Effort" },
};

interface FindingDetailViewProps {
  finding: any;
  allFindings: any[];
  project: any;
  isAdmin: boolean;
  currentUser?: { id?: string; name: string; role: string } | null;
  meId?: string | null;
}

export default function FindingDetailView({
  finding,
  allFindings,
  project,
  isAdmin,
  currentUser,
  meId,
}: FindingDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"desirability" | "viability" | "feasibility">(
    "desirability"
  );
  const [localFinding, setLocalFinding] = useState(finding);

  // ── Related ideas ────────────────────────────────────────────────
  // Ideas linked to this finding (assigned in the admin Ideas tab).
  // Shown under the header so the finding's ideas are visible at a
  // glance, whatever tab is open.
  const [relatedIdeas, setRelatedIdeas] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${project.slug}/findings/${finding.id}/ideas`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setRelatedIdeas(data?.ideas || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [finding.id, project.slug]);

  // ── Group scope ──────────────────────────────────────────────────
  // The group chips sit above the three tabs and scope the whole page:
  // the score strip, the tab badges, the matrix and the board all show
  // the SELECTED group's values. Default is the viewer's own group
  // (the group holding their participant row), else the first group.
  const groups = (project.groups || []).filter((g: any) => g.isActive !== false);
  const myGroupId =
    groups.find((g: any) =>
      (g.participants || []).some((p: any) => p.id === meId)
    )?.id ?? null;
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const activeGroupId =
    selectedGroupId && groups.some((g: any) => g.id === selectedGroupId)
      ? selectedGroupId
      : myGroupId ?? groups[0]?.id ?? null;
  const activeGroup = groups.find((g: any) => g.id === activeGroupId) || null;
  // Participants of the selected group who can score (the admin /
  // facilitator account is not a scorer and is never listed).
  const groupParticipantIds: string[] = (activeGroup?.participants || [])
    .filter((p: any) => p.isActive !== false && p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR")
    .map((p: any) => p.id);
  // Is this finding assigned to the selected group? A finding assigned
  // to no group is open to every group; a finding assigned to ≥1 group
  // only counts for those groups.
  const assignedGroupIds: string[] = localFinding.groupIds || [];
  const isGroupAssigned =
    assignedGroupIds.length === 0 || assignedGroupIds.includes(activeGroupId);
  // The selected group's values for this finding. V/F are the average
  // of the group's participants who scored that dimension (1 decimal);
  // a dimension nobody in the group scored is null. D is the finding's
  // research score — it comes from the research mentions and the
  // project's basis N, NOT from any group's votes, so it is the same
  // for every group in this project and is NOT gated by group
  // assignment (a non-assigned group still sees the D the admin just
  // saved). Only V/F are group scores, so only they are N/A when the
  // group is not assigned to (or has not scored) this finding.
  const groupVF = groupAverageScores(
    localFinding.scores?.participantScores,
    groupParticipantIds
  );
  const groupD = localFinding.scores?.desirability ?? null;
  const groupV = isGroupAssigned ? groupVF.viability : null;
  const groupF = isGroupAssigned ? groupVF.feasibility : null;
  // The quadrant this group lands in on the board (from its D/V/F —
  // a manual pin wins, same as the board). This is what the Matrix
  // score box shows: the quadrant name, not the F number.
  const groupBoardPos = findingBoardPositionForScores(localFinding, groupD, groupV, groupF);
  const groupQuadrant = groupBoardPos.quadrant;

  // Framework weights for the DVF Score (global, from Framework &
  // Weighting — today 33/33/33). Fetched once; the equal-thirds
  // fallback keeps the score right before the fetch lands.
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
  // DVF Score for the SELECTED group: the weighted composite of this
  // group's D, V and F. Null (shown as N/A) while any dimension is
  // unscored or the group is not assigned to this finding.
  const groupDVF = calculateDVFScore(groupD, groupV, groupF, weights ?? [
    { name: "Desirability", weight: 33 },
    { name: "Viability", weight: 33 },
    { name: "Feasibility", weight: 33 },
  ]);

  // Research basis N for this project: the total users per source.
  // It is per project, not per finding — editing it here updates every
  // finding in this project. The saved values come from the project;
  // the inputs below are what the user is typing.
  const [savedInterviewN, setSavedInterviewN] = useState<number | null>(
    project.interviewN ?? null
  );
  const [savedSurveyN, setSavedSurveyN] = useState<number | null>(
    project.surveyN ?? null
  );
  const [interviewNInput, setInterviewNInput] = useState<string>(
    project.interviewN != null ? String(project.interviewN) : ""
  );
  const [surveyNInput, setSurveyNInput] = useState<string>(
    project.surveyN != null ? String(project.surveyN) : ""
  );
  // Parse a typed total: blank/invalid/non-positive means "not set".
  const parseN = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // The totals driving the live preview are what the user is typing.
  const interviewN = parseN(interviewNInput);
  const surveyN = parseN(surveyNInput);
  // Sync the totals when a different project opens (they are
  // project-level, so they do not reset when switching findings).
  React.useEffect(() => {
    setSavedInterviewN(project.interviewN ?? null);
    setSavedSurveyN(project.surveyN ?? null);
    setInterviewNInput(project.interviewN != null ? String(project.interviewN) : "");
    setSurveyNInput(project.surveyN != null ? String(project.surveyN) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.slug]);
  // Research mention inputs (local until saved). Synced when a different
  // finding is opened; typing is never clobbered by a background refresh.
  const [interviewInput, setInterviewInput] = useState<string>(
    localFinding.interviewMentions != null ? String(localFinding.interviewMentions) : ""
  );
  const [surveyInput, setSurveyInput] = useState<string>(
    localFinding.surveyMentions != null ? String(localFinding.surveyMentions) : ""
  );
  const [researchSaving, setResearchSaving] = useState(false);
  const [researchStatus, setResearchStatus] = useState<string | null>(null);
  React.useEffect(() => {
    setInterviewInput(
      localFinding.interviewMentions != null ? String(localFinding.interviewMentions) : ""
    );
    setSurveyInput(
      localFinding.surveyMentions != null ? String(localFinding.surveyMentions) : ""
    );
    setResearchStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFinding.id]);

  const scores = localFinding.scores || {};
  const desirability = scores.desirabilityDetails || {};

  // The score strip shows the SELECTED group's values for this finding
  // (D, V, F on the 1–3 scale). A group that did not select this
  // finding has no value here and shows N/A on every card.
  const groupLabel = activeGroup ? activeGroup.name : "—";
  const groupScoresStrip = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Desirability Score ({groupLabel})
        </div>
        <div className="mt-1 text-3xl font-bold text-slate-900">
          {groupD != null ? (
            <>
              {groupD}
              <span className="text-sm font-normal text-slate-400"> / 3</span>
            </>
          ) : (
            "N/A"
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          From research mentions (Wawancara + Survey)
        </p>
      </div>

      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Viability &amp; Feasibility Score ({groupLabel})
        </div>
        <div className="mt-1 text-3xl font-bold text-slate-900">
          {groupV != null ? (
            <>
              {groupV}
              <span className="text-sm font-normal text-slate-400"> / 3</span>
            </>
          ) : (
            "N/A"
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Average of {groupLabel}&apos;s Viability aspect scores
        </p>
      </div>

      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Matrix Score ({groupLabel})
        </div>
        <div className="mt-1 text-3xl font-bold text-slate-900">
          {groupQuadrant ? QUADRANT_LABEL[groupQuadrant].title : "N/A"}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {groupQuadrant
            ? QUADRANT_LABEL[groupQuadrant].detail
            : "Not placed on the board yet — score the idea to place it"}
        </p>
      </div>
    </div>
  );

  // Live preview of a source score from a typed count (same thresholds
  // as the server): Wawancara ≥66% → 3, ≥33% → 2; Survey ≥30% → 3,
  // ≥15% → 2. A blank count or a missing basis N means that source
  // does not score D.
  const previewSource = (raw: string, total: number | null, high: number, mid: number) => {
    const n = raw.trim() === "" ? null : Math.floor(Number(raw));
    if (n == null || !Number.isFinite(n) || n < 0 || total == null || total <= 0) {
      return { mentions: n, percent: null as number | null, score: null as number | null };
    }
    const frac = n / total;
    return {
      mentions: n,
      percent: Number((frac * 100).toFixed(1)),
      score: frac >= high / 100 ? 3 : frac >= mid / 100 ? 2 : 1,
    };
  };
  const interviewPreview = previewSource(interviewInput, interviewN, 66, 33);
  const surveyPreview = previewSource(surveyInput, surveyN, 30, 15);
  const previewD = (() => {
    const ss = [interviewPreview, surveyPreview].filter((s) => s.score != null);
    if (ss.length === 0) return null;
    if (ss.length === 1) return ss[0].score;
    return Math.ceil(((ss[0].score as number) + (ss[1].score as number)) / 2);
  })();

  // Save the research numbers: the per-project totals (admin only)
  // and this finding's mention counts. The totals go first — the
  // project PUT is a partial update, so only the totals are sent, and
  // saving the basis before the counts means D is computed from the
  // fresh totals. The response merges into local state like a vote save.
  const handleSaveResearch = async () => {
    setResearchSaving(true);
    setResearchStatus(null);
    try {
      const newInterviewN = parseN(interviewNInput);
      const newSurveyN = parseN(surveyNInput);
      const nChanged =
        newInterviewN !== savedInterviewN || newSurveyN !== savedSurveyN;
      if (isAdmin && nChanged) {
        const resN = await fetch(`/api/projects/${project.slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewN: newInterviewN,
            surveyN: newSurveyN,
          }),
        });
        const dataN = await resN.json().catch(() => ({}));
        if (!resN.ok)
          throw new Error(dataN.error || `Could not save the project totals (${resN.status})`);
        setSavedInterviewN(newInterviewN);
        setSavedSurveyN(newSurveyN);
      }
      const res = await fetch(
        `/api/projects/${project.slug}/findings/${localFinding.id}/research`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewMentions:
              interviewInput.trim() === "" ? null : Math.floor(Number(interviewInput)),
            surveyMentions:
              surveyInput.trim() === "" ? null : Math.floor(Number(surveyInput)),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      if (data.finding) {
        setLocalFinding((prev: any) => ({
          ...prev,
          interviewMentions: data.finding.interviewMentions ?? null,
          surveyMentions: data.finding.surveyMentions ?? null,
          scoringStatus: data.finding.scoringStatus ?? prev.scoringStatus,
          scores: { ...prev.scores, ...(data.finding.scores || {}) },
        }));
      }
      setResearchStatus(
        isAdmin && nChanged
          ? "Research numbers saved — totals and Desirability updated."
          : "Research mentions saved — Desirability updated."
      );
    } catch (e: any) {
      setResearchStatus(e.message || "Failed to save research numbers.");
    } finally {
      setResearchSaving(false);
    }
  };

  // Scores update local state only. The viewer list refreshes when
  // navigating back (focus refresh + server revalidation on save).
  const handleVotesChanged = (updatedF: any) => {
    setLocalFinding(updatedF);
  };

  const handleFeasibilitySaved = (updatedData: any) => {
    setLocalFinding((prev: any) => ({
      ...prev,
      ...updatedData,
    }));
  };

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Idea Detail
                </span>
              </div>
              <h2 id="finding-detail-title" className="text-2xl font-semibold text-slate-900 leading-tight sm:text-3xl">
                {localFinding.title}
              </h2>
              {localFinding.description && (
                <p className="text-sm text-slate-600 line-clamp-2">
                  {localFinding.description}
                </p>
              )}
            </div>
          </div>

          {/* Tags list */}
          {localFinding.tagsList && localFinding.tagsList.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {localFinding.tagsList.map((tag: any, idx: number) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                >
                  <span className="text-slate-400 font-normal">{tag.category}:</span>
                  <span className="font-semibold">{tag.value}</span>
                </span>
              ))}
            </div>
          )}

          {/* Related findings — the findings this idea is linked to
              (assigned in the admin Findings tab). Compact pills in a
              wrapping row, so many linked findings stay one or two
              lines tall instead of a tall card each. Full description
              is in the tooltip. */}
          {relatedIdeas.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Related Findings ({relatedIdeas.length})
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {relatedIdeas.map((idea: any) => (
                  <span
                    key={idea.id}
                    title={idea.description ? `${idea.title} — ${idea.description}` : idea.title}
                    className="inline-flex max-w-full items-baseline gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1"
                  >
                    <span className="truncate text-sm font-semibold text-violet-900">{idea.title}</span>
                    {idea.description && (
                      <span className="max-w-48 truncate text-xs text-violet-700">· {idea.description}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Group selector — sits above the three tabs and scopes the
              whole page (score strip, tab badges, matrix, board) to the
              selected group. A group that did not select this finding
              shows N/A on every value. The DVF Score sits on this row
              (not in the finding header) because it belongs to the
              selected group: switching groups changes it. */}
          {groups.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a group to view">
              {groups.map((g: any) => {
                // "Me": ADMIN/FACILITATOR are overseers, not group
                // members — they never get a "Me" on a group chip, even
                // though an "Enzi Lead Admin" participant row exists.
                const isPrivileged = currentUser?.role === "ADMIN" || currentUser?.role === "FACILITATOR";
                const isMe = !isPrivileged && Boolean(meId && myGroupId && g.id === myGroupId);
                const selected = g.id === activeGroupId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`tab-pill ${selected ? "tab-pill-active" : ""}`}
                  >
                    {g.name}
                    {isMe && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                          selected ? "bg-white/25 text-white" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        • Me
                      </span>
                    )}
                  </button>
                );
              })}
              </div>
              <div
                className="shrink-0 rounded-lg border-2 border-amber-500 bg-amber-50 px-3.5 py-2 text-sm font-bold text-amber-700"
                title="DVF Score = (wD × D + wV × V + wF × F) / (wD + wV + wF) — the weighted composite of this group's Desirability, Viability and Feasibility. N/A while any of D, V or F is unscored."
              >
                DVF Score: {groupDVF != null ? groupDVF.toFixed(2) : "N/A"}
              </div>
            </div>
          )}

          {/* Tab Navigation — no horizontal scrolling: the tabs shrink
              and wrap (see .tab-underline) so all three always fit. */}
          <div className="mt-6 flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("desirability")}
              className={`tab-underline ${activeTab === "desirability" ? "tab-underline-active" : ""}`}
            >
              <Target className="hidden sm:block h-4 w-4 shrink-0" />
              <span className="min-w-0">Desirability</span>
              <span className="badge shrink-0 bg-emerald-100 text-emerald-800">
                {groupD != null ? groupD : "N/A"}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("viability")}
              className={`tab-underline ${activeTab === "viability" ? "tab-underline-active" : ""}`}
            >
              <Users2 className="hidden sm:block h-4 w-4 shrink-0" />
              <span className="min-w-0">Viability &amp; Feasibility</span>
              <span className="badge shrink-0 bg-emerald-100 text-emerald-800">
                {groupV != null ? `${groupV} / 3` : "N/A"}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("feasibility")}
              className={`tab-underline ${activeTab === "feasibility" ? "tab-underline-active" : ""}`}
            >
              <Compass className="hidden sm:block h-4 w-4 shrink-0" />
              <span className="min-w-0">Impact vs Effort Matrix</span>
              <span className="badge shrink-0 bg-emerald-100 text-emerald-800">
                {groupQuadrant ? QUADRANT_LABEL[groupQuadrant].title : "N/A"}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-6">
          {/* TAB 1: DESIRABILITY */}
          {activeTab === "desirability" && (
            <div className="space-y-6">
              {groupScoresStrip}

              {/* Research mentions — the only input to D */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <HelpCircle className="h-4 w-4 text-emerald-600" />
                  <span>Research mentions — how many users mentioned this idea</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  D comes from research numbers only. A mention is a user mentioning this finding in that source. Internal is not counted. A source with no count entered does not score D. Both numbers are typed by hand — the mentions for this finding, and the totals for the whole project (changing a total here updates every finding in this project). The system only does the calculation.
                </p>

                {/* Wawancara */}
                <div className="mt-4 rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">Wawancara</span>
                    <span className="text-xs text-slate-500">&ge; 66% &rarr; 3 &middot; &ge; 33% &rarr; 2 &middot; below 33% &rarr; 1</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="field-label">Users who mentioned it</span>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={interviewInput}
                        onChange={(e) => setInterviewInput(e.target.value)}
                        placeholder="e.g. 2"
                        disabled={!isAdmin}
                        title={
                          isAdmin
                            ? "How many interview users mentioned this idea"
                            : "Only an admin can change the research numbers"
                        }
                        className="input w-28"
                      />
                    </label>
                    <span className="text-sm text-slate-600 pb-2">of</span>
                    <label className="block">
                      <span className="field-label">Total interview users</span>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={interviewNInput}
                        onChange={(e) => setInterviewNInput(e.target.value)}
                        placeholder="e.g. 3"
                        disabled={!isAdmin}
                        title={
                          isAdmin
                            ? "Total interview users in this project"
                            : "Only an admin can change the project totals"
                        }
                        className="input w-20"
                      />
                    </label>
                    <span className="text-sm text-slate-600 pb-2">
                      interview users
                      {interviewPreview.percent != null && <> ({interviewPreview.percent}%)</>}
                    </span>
                    <span className="ml-auto pb-2 text-sm font-bold text-emerald-700">
                      {interviewPreview.score != null ? `Score ${interviewPreview.score} / 3` : "—"}
                    </span>
                  </div>
                  {interviewN == null && (
                    <p className="mt-2 text-xs text-amber-700">
                      {isAdmin
                        ? "Total interview users is not set — type it above (it applies to every idea in this project)."
                        : "Total interview users is not set for this project — an admin sets it here or in the dashboard (Framework & Weighting → Research basis)."}
                    </p>
                  )}
                </div>

                {/* Survey */}
                <div className="mt-4 rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">Survey</span>
                    <span className="text-xs text-slate-500">&ge; 30% &rarr; 3 &middot; &ge; 15% &rarr; 2 &middot; below 15% &rarr; 1</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="field-label">Users who mentioned it</span>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={surveyInput}
                        onChange={(e) => setSurveyInput(e.target.value)}
                        placeholder="e.g. 40"
                        disabled={!isAdmin}
                        title={
                          isAdmin
                            ? "How many survey respondents mentioned this idea"
                            : "Only an admin can change the research numbers"
                        }
                        className="input w-28"
                      />
                    </label>
                    <span className="text-sm text-slate-600 pb-2">of</span>
                    <label className="block">
                      <span className="field-label">Total survey respondents</span>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={surveyNInput}
                        onChange={(e) => setSurveyNInput(e.target.value)}
                        placeholder="e.g. 121"
                        disabled={!isAdmin}
                        title={
                          isAdmin
                            ? "Total survey respondents in this project"
                            : "Only an admin can change the project totals"
                        }
                        className="input w-20"
                      />
                    </label>
                    <span className="text-sm text-slate-600 pb-2">
                      survey respondents
                      {surveyPreview.percent != null && <> ({surveyPreview.percent}%)</>}
                    </span>
                    <span className="ml-auto pb-2 text-sm font-bold text-emerald-700">
                      {surveyPreview.score != null ? `Score ${surveyPreview.score} / 3` : "—"}
                    </span>
                  </div>
                  {surveyN == null && (
                    <p className="mt-2 text-xs text-amber-700">
                      {isAdmin
                        ? "Total survey respondents is not set — type it above (it applies to every idea in this project)."
                        : "Total survey respondents is not set for this project — an admin sets it here or in the dashboard (Framework & Weighting → Research basis)."}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    {previewD != null ? (
                      <>Resulting D: <span className="font-extrabold text-emerald-700">{previewD} / 3</span> (round up the average of the source scores; a single source stands alone)</>
                    ) : (
                      "Enter a count for Wawancara and/or Survey to score Desirability."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={handleSaveResearch}
                    disabled={!isAdmin || researchSaving}
                    title={
                      isAdmin ? undefined : "Only an admin can change the research numbers"
                    }
                    className="btn-primary"
                  >
                    {researchSaving ? "Saving\u2026" : "Save research numbers"}
                  </button>
                </div>
                {researchStatus && (
                  <p role="status" className="mt-2 text-sm font-semibold text-emerald-700">
                    {researchStatus}
                  </p>
                )}
              </div>

              {/* How D is built */}
              <div role="note" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <span className="font-bold">How this score is built: </span>
                {desirability.formulaExplanation ||
                  "No research numbers yet \u2014 enter how many users mentioned this idea in Wawancara and/or Survey."}
              </div>
            </div>
          )}

          {/* TAB 2: VIABILITY */}
          {activeTab === "viability" && (
            <div className="space-y-6">
              {groupScoresStrip}

              <ViabilityVoteMatrix
                project={project}
                finding={localFinding}
                currentUser={currentUser}
                selectedGroupId={activeGroupId}
                onVotesChanged={handleVotesChanged}
              />
            </div>
          )}

          {/* TAB 3: FEASIBILITY */}
          {activeTab === "feasibility" && (
            <div className="space-y-6">
              {groupScoresStrip}

              {/* Interactive 2x2 Feasibility Matrix — scoped to the
                  selected group: the card sits at the group's D/V/F
                  position (or N/A / unplaced when the group has no
                  value for this finding). */}
              <FeasibilityMatrix
                finding={localFinding}
                allFindings={allFindings}
                projectSlug={project.slug}
                isAdmin={isAdmin}
                meId={meId}
                groupScores={{ desirability: groupD, viability: groupV, feasibility: groupF }}
                selectedGroupId={activeGroupId}
                groupParticipantIds={groupParticipantIds}
                onPositionSaved={handleFeasibilitySaved}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500">
            D, V and F are all on the 1–3 scale. D = research mentions (Wawancara + Survey, rounded-up average); V = average of your Viability aspect scores; F = 4 − average of your Effort aspect scores. There is no composite score.
          </div>
        </div>
      </div>
    </div>
  );
}
