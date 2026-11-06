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

interface FindingDetailViewProps {
  finding: any;
  allFindings: any[];
  project: any;
  isAdmin: boolean;
  currentUser?: { id?: string; name: string; role: string } | null;
}

export default function FindingDetailView({
  finding,
  allFindings,
  project,
  isAdmin,
  currentUser,
}: FindingDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"desirability" | "viability" | "feasibility">(
    "desirability"
  );
  const [localFinding, setLocalFinding] = useState(finding);

  const scores = localFinding.scores || {};
  const desirability = scores.desirabilityDetails || {};
  const viability = scores.viabilityDetails || {};
  const feasibility = scores.feasibilityDetails || {};
  // Scoring status is derived from workshop data (see lib/scoring).
  // A null score means "not yet scored in the workshop", never a 0.
  const status = localFinding.scoringStatus || {};
  const showNum = (v: number | null | undefined) => (v ?? null) === null ? "—" : v;

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
    <div className="mx-auto w-full max-w-4xl">
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
                  {scores.composite != null
                    ? `DVF Score: ${scores.composite} / 100`
                    : `Pending scoring${status.pending?.length ? ` — needs: ${status.pending.join(", ")}` : ""}`}
                </span>
              </div>
              <h2 id="finding-detail-title" className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
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
                {scores.viability != null ? `${scores.viability}%` : "—"}
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
                {feasibility.quadrant?.replace("_", " ") ?? "Not placed"}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-6">
          {/* TAB 1: DESIRABILITY */}
          {activeTab === "desirability" && (
            <div className="space-y-6">
              {!status.desirabilityScored && (
                <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <span className="font-bold">Not yet scored in the workshop.</span>{" "}
                  Map this finding to L1–L3 parameters in the workshop (Step 1) or
                  record votes on Desirability-linked aspects — the Desirability
                  score is computed from those, not from the Sumber/Platform tags.
                </div>
              )}
              {desirability.inputs && desirability.inputs.length > 0 && (
                <div role="note" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <span className="font-bold">How this score is built (average of available inputs): </span>
                  {desirability.inputs.map((i: any) => `${i.label} ${i.score}`).join("  ·  ")}
                  {desirability.inputs.length > 1 && (
                    <> = <span className="font-extrabold">{scores.desirability}</span></>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
                    Desirability Score
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-emerald-900">
                    {showNum(scores.desirability)}
                    {scores.desirability != null && (
                      <span className="text-sm font-normal text-emerald-600"> / 100</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-emerald-700">
                    Evaluated from workshop L1-L3 mapping & custom scoring rules
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Weight in Framework
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">
                    {project.weightsMap?.desirability ?? 33.3}%
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Framework allocation
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Weighted Contribution
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">
                    {scores.desirability != null
                      ? (
                          ((scores.desirability ?? 0) *
                            (project.weightsMap?.desirability ?? 33.3)) /
                          100
                        ).toFixed(1)
                      : "—"}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Points added to total DVF composite score
                  </p>
                </div>
              </div>

              {/* Formula Transparency Breakdown */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <HelpCircle className="h-4 w-4 text-emerald-600" />
                  <span>Calculation Transparency & Formula Breakdown</span>
                </div>
                <div className="mt-3 p-3 rounded-lg bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto">
                  {desirability.formulaExplanation || "Calculating formula..."}
                </div>

                <div className="mt-5 space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Category (L1) Evaluation Breakdown:
                  </h4>
                  {desirability.l1Breakdowns && desirability.l1Breakdowns.length > 0 ? (
                    <div className="space-y-3">
                      {desirability.l1Breakdowns.map((b: any) => (
                        <div
                          key={b.l1Id}
                          className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">
                              {b.l1Name}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Subcategories covered: {b.coveredSubcategories} of {b.totalSubcategories} ({b.coveragePercent}%)
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {b.matchedRule && (
                              <span className="text-xs px-2.5 py-1 rounded bg-white border border-slate-200 font-medium text-slate-700">
                                Rule matched: &gt;={b.matchedRule.minPercent}% → Score {b.matchedRule.score}
                              </span>
                            )}
                            <div className="text-right">
                              <span className="text-lg font-bold text-slate-900">
                                {b.score}
                              </span>
                              <span className="text-xs text-slate-400">/100</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No Level 1 parameters configured for this project.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VIABILITY */}
          {activeTab === "viability" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="text-xs font-medium text-blue-700 uppercase tracking-wider">
                    Viability Score
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-blue-900">
                    {scores.viability != null ? `${scores.viability}%` : "—"}
                  </div>
                  <p className="mt-1 text-xs text-blue-700">
                    {viability.totalValidatedVotes ?? 0} of {viability.totalPossibleVotes ?? 0} total possible votes
                    {viability.aspectsCounted != null && (
                      <> · counts Viability-linked aspects only ({viability.aspectsCounted} of {project.viabilityAspects?.length ?? 0})</>
                    )}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Weight in Framework
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">
                    {project.weightsMap?.viability ?? 33.3}%
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Framework allocation
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Weighted Contribution
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">
                    {scores.viability != null
                      ? (
                          ((scores.viability ?? 0) *
                            (project.weightsMap?.viability ?? 33.3)) /
                          100
                        ).toFixed(1)
                      : "—"}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Points added to total DVF composite score
                  </p>
                </div>
              </div>

              {!status.viabilityScored && (
                <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <span className="font-bold">Not yet scored in the workshop.</span>{" "}
                  Score each aspect 1–3 below (workshop Step 2) with your Alasan
                  per aspect — the Viability score is the share of scored
                  (validated) aspects.
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-xs font-medium text-amber-700 uppercase tracking-wider">
                    Feasibility Quadrant
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-amber-900">
                    {feasibility.quadrant?.replace("_", " ") ?? "Not placed"}
                  </div>
                  <p className="mt-1 text-xs text-amber-700">
                    Score: {scores.feasibility != null ? `${scores.feasibility} / 100` : "—"}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Weight in Framework
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">
                    {project.weightsMap?.feasibility ?? 33.3}%
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Framework allocation
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Weighted Contribution
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">
                    {scores.feasibility != null
                      ? (
                          ((scores.feasibility ?? 50) *
                            (project.weightsMap?.feasibility ?? 33.3)) /
                          100
                        ).toFixed(1)
                      : "—"}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Points added to total DVF composite score
                  </p>
                </div>
              </div>

              {!status.feasibilityScored && (
                <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <span className="font-bold">Not yet placed in the workshop.</span>{" "}
                  Drag the card to the position the group agrees on (workshop Step 3)
                  or record votes on Feasibility-linked aspects — the Feasibility
                  score comes from its quadrant and/or those votes.
                </div>
              )}
              {feasibility.inputs && feasibility.inputs.length > 0 && (
                <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <span className="font-bold">How this score is built (average of available inputs): </span>
                  {feasibility.inputs.map((i: any) => `${i.label} ${i.score}`).join("  ·  ")}
                  {feasibility.inputs.length > 1 && (
                    <> = <span className="font-extrabold">{scores.feasibility}</span></>
                  )}
                </div>
              )}

              {/* Interactive 2x2 Feasibility Matrix */}
              <FeasibilityMatrix
                finding={localFinding}
                allFindings={allFindings}
                projectSlug={project.slug}
                isAdmin={isAdmin}
                onPositionSaved={handleFeasibilitySaved}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500 font-mono">
            Composite Formula: {scores.compositeFormula || ""}
          </div>
        </div>
      </div>
    </div>
  );
}
