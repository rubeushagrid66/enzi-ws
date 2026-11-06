"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Target,
  Users2,
  Compass,
  CheckCircle2,
  Percent,
  Layers,
  Sparkles,
  HelpCircle,
  BarChart3,
  Check,
} from "lucide-react";
import FeasibilityMatrix from "./FeasibilityMatrix";

interface FindingDetailModalProps {
  finding: any;
  allFindings: any[];
  project: any;
  isAdmin: boolean;
  onClose: () => void;
  onFindingUpdated: (updated: any) => void;
}

export default function FindingDetailModal({
  finding,
  allFindings,
  project,
  isAdmin,
  onClose,
  onFindingUpdated,
}: FindingDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [activeTab, setActiveTab] = useState<"desirability" | "viability" | "feasibility">(
    "desirability"
  );
  const [localFinding, setLocalFinding] = useState(finding);
  const [votingState, setVotingState] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const v of finding.viabilityVotes || []) {
      map[`${v.participantId}:${v.aspectId}`] = v.isValidated;
    }
    return map;
  });
  const [isUpdatingVote, setIsUpdatingVote] = useState(false);

  const scores = localFinding.scores || {};
  const desirability = scores.desirabilityDetails || {};
  const viability = scores.viabilityDetails || {};
  const feasibility = scores.feasibilityDetails || {};

  // Toggle vote handler
  const handleToggleVote = async (participantId: string, aspectId: string) => {
    if (!isAdmin) return;
    const key = `${participantId}:${aspectId}`;
    const nextVal = !votingState[key];

    // Optimistic local update
    setVotingState((prev) => ({ ...prev, [key]: nextVal }));
    setIsUpdatingVote(true);

    try {
      const res = await fetch(
        `/api/projects/${project.slug}/findings/${localFinding.id}/viability-vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId,
            aspectId,
            isValidated: nextVal,
          }),
        }
      );
      if (res.ok) {
        // Refresh project data to recalculate live scores
        const projRes = await fetch(`/api/projects/${project.slug}`);
        if (projRes.ok) {
          const freshData = await projRes.json();
          const updatedF = freshData.project.findings.find(
            (f: any) => f.id === localFinding.id
          );
          if (updatedF) {
            setLocalFinding(updatedF);
            onFindingUpdated(updatedF);
          }
        }
      }
    } catch (e) {
      console.error("Failed to update vote:", e);
    } finally {
      setIsUpdatingVote(false);
    }
  };

  const handleFeasibilitySaved = (updatedData: any) => {
    setLocalFinding((prev: any) => ({
      ...prev,
      ...updatedData,
    }));
    onFindingUpdated({
      ...localFinding,
      ...updatedData,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="finding-detail-title" className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 my-8" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Finding Detail
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  DVF Score: {scores.composite ?? 0} / 100
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
            <button
              onClick={onClose}
              aria-label="Close finding detail"
              className="rounded-xl p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <X className="h-5 w-5" />
            </button>
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
          <div className="mt-6 flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("desirability")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition -mb-px ${
                activeTab === "desirability"
                  ? "border-emerald-600 text-emerald-700 bg-emerald-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <Target className="h-4 w-4" />
              <span>Tab 1: Desirability</span>
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800">
                {scores.desirability ?? 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("viability")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition -mb-px ${
                activeTab === "viability"
                  ? "border-blue-600 text-blue-700 bg-blue-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <Users2 className="h-4 w-4" />
              <span>Tab 2: Viability</span>
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800">
                {scores.viability ?? 0}%
              </span>
            </button>

            <button
              onClick={() => setActiveTab("feasibility")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition -mb-px ${
                activeTab === "feasibility"
                  ? "border-amber-600 text-amber-700 bg-amber-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <Compass className="h-4 w-4" />
              <span>Tab 3: Feasibility (2x2 Matrix)</span>
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
                {feasibility.quadrant?.replace("_", " ") ?? "Matrix"}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* TAB 1: DESIRABILITY */}
          {activeTab === "desirability" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
                    Desirability Score
                  </div>
                  <div className="mt-1 text-3xl font-extrabold text-emerald-900">
                    {scores.desirability ?? 0}
                    <span className="text-sm font-normal text-emerald-600"> / 100</span>
                  </div>
                  <p className="mt-1 text-xs text-emerald-700">
                    Evaluated from L1-L3 occurrence & custom scoring rules
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
                    {(
                      ((scores.desirability ?? 0) *
                        (project.weightsMap?.desirability ?? 33.3)) /
                      100
                    ).toFixed(1)}
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
                    {scores.viability ?? 0}%
                  </div>
                  <p className="mt-1 text-xs text-blue-700">
                    {viability.totalValidatedVotes ?? 0} of {viability.totalPossibleVotes ?? 0} total possible votes
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
                    {(
                      ((scores.viability ?? 0) *
                        (project.weightsMap?.viability ?? 33.3)) /
                      100
                    ).toFixed(1)}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Points added to total DVF composite score
                  </p>
                </div>
              </div>

              {/* Participant Voting Matrix */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Users2 className="h-4 w-4 text-blue-600" />
                      <span>Participant Voting Matrix (Aspects Validation)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Checkboxes represent individual participant validation per aspect.
                      {isAdmin ? " Click to toggle votes live." : " Read-only view."}
                    </p>
                  </div>
                  {isUpdatingVote && (
                    <span className="text-xs text-blue-600 font-semibold animate-pulse">
                      Updating vote...
                    </span>
                  )}
                </div>

                {project.groups && project.groups.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70">
                          <th className="py-2.5 px-3 font-bold text-slate-700">Group / Participant</th>
                          {project.viabilityAspects?.map((aspect: any) => (
                            <th
                              key={aspect.id}
                              className="py-2.5 px-3 font-bold text-slate-700 text-center"
                              title={aspect.description || aspect.name}
                            >
                              <div>{aspect.name}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {project.groups.map((group: any) => (
                          <React.Fragment key={group.id}>
                            <tr className="bg-slate-100/60 font-semibold text-slate-800">
                              <td
                                colSpan={1 + (project.viabilityAspects?.length || 0)}
                                className="py-2 px-3 text-xs uppercase tracking-wider text-slate-600"
                              >
                                {group.name}
                              </td>
                            </tr>
                            {group.participants?.map((participant: any) => (
                              <tr key={participant.id} className="hover:bg-slate-50/80 transition">
                                <td className="py-2 px-3 pl-6">
                                  <div className="font-medium text-slate-800">
                                    {participant.name}
                                  </div>
                                  {participant.roleTitle && (
                                    <div className="text-[10px] text-slate-400">
                                      {participant.roleTitle}
                                    </div>
                                  )}
                                </td>
                                {project.viabilityAspects?.map((aspect: any) => {
                                  const voteKey = `${participant.id}:${aspect.id}`;
                                  const isChecked = Boolean(votingState[voteKey]);
                                  return (
                                    <td key={aspect.id} className="py-2 px-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!isAdmin}
                                        onChange={() =>
                                          handleToggleVote(participant.id, aspect.id)
                                        }
                                        className={`h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition ${
                                          isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-80"
                                        }`}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-4">
                    No participant groups configured for this project.
                  </p>
                )}
              </div>
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
                    {feasibility.quadrant?.replace("_", " ") ?? "QUICK WINS"}
                  </div>
                  <p className="mt-1 text-xs text-amber-700">
                    Score: {scores.feasibility ?? 50} / 100
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
                    {(
                      ((scores.feasibility ?? 50) *
                        (project.weightsMap?.feasibility ?? 33.3)) /
                      100
                    ).toFixed(1)}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Points added to total DVF composite score
                  </p>
                </div>
              </div>

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

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono">
            Composite Formula: {scores.compositeFormula || ""}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
