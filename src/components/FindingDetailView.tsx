"use client";

import React, { useState } from "react";
import {
  Target,
  Users2,
  Compass,
  HelpCircle,
} from "lucide-react";
import FeasibilityMatrix from "./FeasibilityMatrix";
import ViabilityVoteMatrix from "./ViabilityVoteMatrix";
import { scoresForParticipant, normalizeFramework, findingBoardPosition } from "@/lib/scoring";

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

  // Research basis N for this project (admin sets it in the dashboard;
  // null = not set yet, so that source cannot score D).
  const interviewN = project.interviewN ?? null;
  const surveyN = project.surveyN ?? null;
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
  // Scoring status is derived from workshop data (see lib/scoring).
  // A null score means "not yet scored in the workshop", never a 0.
  const status = localFinding.scoringStatus || {};
  const showNum = (v: number | null | undefined) => (v ?? null) === null ? "—" : v;

  // V and F are per participant (1–3, no composite, no cross-participant
  // average). These cards show the logged-in participant's own values.
  const my = scoresForParticipant(scores.participantScores, meId);
  const myPending: string[] = [];
  if (!status.desirabilityScored) myPending.push("Desirability");
  if (my.viability == null) myPending.push("Viability");
  if (my.feasibility == null) myPending.push("Feasibility");
  // My aspect scores, for the V/F formula breakdowns below: the aspects
  // I scored, with the score I gave (unscored aspects are skipped).
  const myAspectScores = (framework: string) =>
    (project.viabilityAspects || [])
      .filter((a: any) => normalizeFramework(a.framework) === framework)
      .map((a: any) => {
        const vote = (localFinding.viabilityVotes || []).find(
          (v: any) => v.participantId === meId && v.aspectId === a.id
        );
        return { name: a.name, score: vote?.score != null ? Number(vote.score) : null };
      });
  const myViabilityAspects = myAspectScores("Viability");
  const myFeasibilityAspects = myAspectScores("Feasibility");
  const myViabilityScored = myViabilityAspects.filter((a: any) => a.score != null);
  const myFeasibilityScored = myFeasibilityAspects.filter((a: any) => a.score != null);
  // Board position for this viewer (pinned, or computed from my D/V/F).
  const boardPos = findingBoardPosition(localFinding, meId);

  // Your scores (D is shared from the workshop mappings; V and F are
  // the logged-in participant's own 1–3 values). Shown on every tab.
  const myScoresStrip = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
        <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
          Desirability Score
        </div>
        <div className="mt-1 text-3xl font-extrabold text-emerald-900">
          {showNum(scores.desirability)}
          {scores.desirability != null && (
            <span className="text-sm font-normal text-emerald-600"> / 3</span>
          )}
        </div>
        <p className="mt-1 text-xs text-emerald-700">
          From research mentions (Wawancara + Survey)
        </p>
      </div>

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
        <div className="text-xs font-medium text-blue-700 uppercase tracking-wider">
          Viability Score (yours)
        </div>
        <div className="mt-1 text-3xl font-extrabold text-blue-900">
          {my.viability != null ? my.viability : "—"}
          {my.viability != null && (
            <span className="text-sm font-normal text-blue-600"> / 3</span>
          )}
        </div>
        <p className="mt-1 text-xs text-blue-700">
          Average of your Viability aspect scores
        </p>
      </div>

      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
        <div className="text-xs font-medium text-amber-700 uppercase tracking-wider">
          Feasibility Score (yours)
        </div>
        <div className="mt-1 text-3xl font-extrabold text-amber-900">
          {my.feasibility != null ? my.feasibility : "—"}
          {my.feasibility != null && (
            <span className="text-sm font-normal text-amber-600"> / 3</span>
          )}
        </div>
        <p className="mt-1 text-xs text-amber-700">
          4 − average of your Effort aspect scores
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

  // Save the research mentions; the server recomputes D and the status,
  // and the response merges into local state like a vote save.
  const handleSaveResearch = async () => {
    setResearchSaving(true);
    setResearchStatus(null);
    try {
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
      setResearchStatus("Research mentions saved — Desirability updated.");
    } catch (e: any) {
      setResearchStatus(e.message || "Failed to save research mentions.");
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
                  Finding Detail
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {myPending.length === 0
                    ? `Your scores — D ${showNum(scores.desirability)}${scores.desirability != null ? " / 3" : ""} · V ${showNum(my.viability)} / 3 · F ${showNum(my.feasibility)} / 3`
                    : `Pending scoring${myPending.length ? ` — needs: ${myPending.join(", ")}` : ""}`}
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

          {/* Tab Navigation */}
          <div className="mt-6 flex border-b border-slate-200 overflow-x-auto">
            <button
              onClick={() => setActiveTab("desirability")}
              className={`flex shrink-0 items-center gap-2 px-3 sm:px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition -mb-px ${
                activeTab === "desirability"
                  ? "border-emerald-600 text-emerald-700 bg-emerald-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <Target className="hidden sm:block h-4 w-4" />
              <span><span className="hidden sm:inline">Tab 1: </span>Desirability</span>
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800">
                {showNum(scores.desirability)}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("viability")}
              className={`flex shrink-0 items-center gap-2 px-3 sm:px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition -mb-px ${
                activeTab === "viability"
                  ? "border-blue-600 text-blue-700 bg-blue-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <Users2 className="hidden sm:block h-4 w-4" />
              <span><span className="hidden sm:inline">Tab 2: </span>Viability</span>
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800">
                {my.viability != null ? `${my.viability} / 3` : "—"}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("feasibility")}
              className={`flex shrink-0 items-center gap-2 px-3 sm:px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition -mb-px ${
                activeTab === "feasibility"
                  ? "border-amber-600 text-amber-700 bg-amber-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <Compass className="hidden sm:block h-4 w-4" />
              <span><span className="hidden sm:inline">Tab 3: </span>Feasibility<span className="hidden sm:inline"> (2x2 Matrix)</span></span>
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
                {boardPos.quadrant?.replace("_", " ") ?? "Not placed"}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-6">
          {/* TAB 1: DESIRABILITY */}
          {activeTab === "desirability" && (
            <div className="space-y-6">
              {myScoresStrip}

              {/* Research mentions — the only input to D */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <HelpCircle className="h-4 w-4 text-emerald-600" />
                  <span>Research mentions — how many users mentioned this finding</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  D comes from research numbers only. A mention is a user mentioning this finding in that source. Internal is not counted. A source with no count entered does not score D.
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
                        className="input w-28"
                      />
                    </label>
                    <span className="text-sm text-slate-600 pb-2">
                      of {interviewN != null ? interviewN : "&mdash;"} interview users
                      {interviewPreview.percent != null && <> ({interviewPreview.percent}%)</>}
                    </span>
                    <span className="ml-auto pb-2 text-sm font-bold text-emerald-700">
                      {interviewPreview.score != null ? `Score ${interviewPreview.score} / 3` : "&mdash;"}
                    </span>
                  </div>
                  {interviewN == null && (
                    <p className="mt-2 text-xs text-amber-700">
                      Interview basis (N) is not set for this project — an admin sets it in the dashboard (Framework &amp; Weighting &rarr; Research basis).
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
                        className="input w-28"
                      />
                    </label>
                    <span className="text-sm text-slate-600 pb-2">
                      of {surveyN != null ? surveyN : "&mdash;"} survey respondents
                      {surveyPreview.percent != null && <> ({surveyPreview.percent}%)</>}
                    </span>
                    <span className="ml-auto pb-2 text-sm font-bold text-emerald-700">
                      {surveyPreview.score != null ? `Score ${surveyPreview.score} / 3` : "&mdash;"}
                    </span>
                  </div>
                  {surveyN == null && (
                    <p className="mt-2 text-xs text-amber-700">
                      Survey basis (N) is not set for this project — an admin sets it in the dashboard (Framework &amp; Weighting &rarr; Research basis).
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
                    disabled={researchSaving}
                    className="btn-primary"
                  >
                    {researchSaving ? "Saving\u2026" : "Save research mentions"}
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
                  "No research numbers yet \u2014 enter how many users mentioned this finding in Wawancara and/or Survey."}
              </div>
            </div>
          )}

          {/* TAB 2: VIABILITY */}
          {activeTab === "viability" && (
            <div className="space-y-6">
              {myScoresStrip}

              {/* How YOUR Viability score is built */}
              <div role="note" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <span className="font-bold">Your Viability score = average of your Viability aspect scores (1–3).</span>{" "}
                {myViabilityScored.length > 0 ? (
                  <>
                    {myViabilityScored.map((a: any) => `${a.name} ${a.score}`).join("  ·  ")}
                    {" → ("}
                    {myViabilityScored.reduce((s: number, a: any) => s + (a.score ?? 0), 0)}
                    {" / "}
                    {myViabilityScored.length}
                    {") = "}
                    <span className="font-extrabold">{my.viability}</span>
                  </>
                ) : (
                  "You have not scored a Viability aspect on this finding yet."
                )}
                {myViabilityAspects.length > myViabilityScored.length && (
                  <> Unscored aspects are skipped, never counted as 0.</>
                )}
              </div>

              {my.viability == null && (
                <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <span className="font-bold">Not yet scored by you.</span>{" "}
                  Score each aspect 1–3 below (workshop Step 2) with your Alasan
                  per aspect — your Viability score is the average of the
                  Viability aspects you scored.
                </div>
              )}

              <ViabilityVoteMatrix
                project={project}
                finding={localFinding}
                currentUser={currentUser}
                onVotesChanged={handleVotesChanged}
              />
            </div>
          )}

          {/* TAB 3: FEASIBILITY */}
          {activeTab === "feasibility" && (
            <div className="space-y-6">
              {myScoresStrip}

              {/* How YOUR Feasibility score is built */}
              <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <span className="font-bold">Your Feasibility score = 4 − average of your Effort aspect scores (1–3).</span>{" "}
                {myFeasibilityScored.length > 0 ? (
                  <>
                    {myFeasibilityScored.map((a: any) => `${a.name} ${a.score}`).join("  ·  ")}
                    {" → 4 − ("}
                    {myFeasibilityScored.reduce((s: number, a: any) => s + (a.score ?? 0), 0)}
                    {" / "}
                    {myFeasibilityScored.length}
                    {") = "}
                    <span className="font-extrabold">{my.feasibility}</span>
                  </>
                ) : (
                  "You have not scored a Feasibility aspect on this finding yet."
                )}
                {myFeasibilityAspects.length > myFeasibilityScored.length && (
                  <> Unscored aspects are skipped, never counted as 0.</>
                )}
                <br />
                <span className="text-amber-700">
                  Board position ({boardPos.quadrant?.replace("_", " ") ?? "Not placed"}) is {boardPos.pinned ? "a manual pin — dragging the card does not change your Feasibility score" : "computed from your scores — dragging the card pins it to a manual position"}.
                </span>
              </div>

              {my.feasibility == null && (
                <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <span className="font-bold">Not yet scored by you.</span>{" "}
                  Record votes on Feasibility-linked aspects (workshop Step 2) — your
                  Feasibility score comes from those votes, not from the board position.
                </div>
              )}

              {/* Interactive 2x2 Feasibility Matrix */}
              <FeasibilityMatrix
                finding={localFinding}
                allFindings={allFindings}
                projectSlug={project.slug}
                isAdmin={isAdmin}
                meId={meId}
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
