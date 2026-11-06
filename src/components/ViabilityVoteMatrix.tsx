"use client";

import React, { useState, useEffect } from "react";
import { Users2 } from "lucide-react";
import { normalizeFramework } from "@/lib/scoring";

/**
 * Participant voting matrix (aspects validation), shared by the finding
 * detail modal and the workshop scoring walkthrough.
 *
 * Workshop framing: the facilitator records each participant's own
 * validate / not-validated answer as that participant — votes are
 * stored per participantId, never as the facilitator. Toggling is
 * last-write-wins per (finding, participant, aspect).
 *
 * Aspect → framework linkage: aspects are grouped under the framework
 * their votes feed (Desirability, Viability, Feasibility), so it is
 * obvious which dimension each vote scores. Aspects without a framework
 * count as Viability.
 */
const FRAMEWORK_ORDER = ["Desirability", "Viability", "Feasibility"] as const;
const FRAMEWORK_HEADER_CLASS: Record<string, string> = {
  Desirability: "bg-emerald-100 text-emerald-800",
  Viability: "bg-blue-100 text-blue-800",
  Feasibility: "bg-amber-100 text-amber-800",
};
export default function ViabilityVoteMatrix({
  project,
  finding,
  isAdmin,
  onVotesChanged,
}: {
  project: any;
  finding: any;
  isAdmin: boolean;
  onVotesChanged?: (updatedFinding: any) => void;
}) {
  // Aspects grouped by the framework their votes feed, in D/V/F order
  // (creation order within a group). The score for a dimension only
  // counts votes on its own linked aspects.
  const groupedAspects = FRAMEWORK_ORDER.map((fw) => ({
    framework: fw,
    aspects: (project.viabilityAspects || []).filter(
      (a: any) => normalizeFramework(a.framework) === fw
    ),
  })).filter((g) => g.aspects.length > 0);
  const orderedAspects = groupedAspects.flatMap((g) => g.aspects);

  const [votingState, setVotingState] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const v of finding.viabilityVotes || []) {
      map[`${v.participantId}:${v.aspectId}`] = v.isValidated;
    }
    return map;
  });
  const [isUpdatingVote, setIsUpdatingVote] = useState(false);

  // Re-sync when a different finding is shown (e.g. workshop steps
  // through the list) — otherwise stale checkboxes from the previous
  // finding would show.
  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const v of finding.viabilityVotes || []) {
      map[`${v.participantId}:${v.aspectId}`] = v.isValidated;
    }
    setVotingState(map);
  }, [finding.id, finding.viabilityVotes]);

  const handleToggleVote = async (participantId: string, aspectId: string) => {
    if (!isAdmin) return;
    const key = `${participantId}:${aspectId}`;
    const nextVal = !votingState[key];

    // Optimistic local update
    setVotingState((prev) => ({ ...prev, [key]: nextVal }));
    setIsUpdatingVote(true);

    try {
      const res = await fetch(
        `/api/projects/${project.slug}/findings/${finding.id}/viability-vote`,
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
            (f: any) => f.id === finding.id
          );
          if (updatedF && onVotesChanged) onVotesChanged(updatedF);
        }
      }
    } catch (e) {
      console.error("Failed to update vote:", e);
    } finally {
      setIsUpdatingVote(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Users2 className="h-4 w-4 text-blue-600" />
            <span>Participant Voting Matrix (Aspects Validation)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Record each participant&apos;s own answer per aspect — check the
            box when they validate it, leave it empty when they don&apos;t.
            Votes feed the framework their aspect is linked to
            (Desirability, Viability, or Feasibility).
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
                <th scope="col" rowSpan={2} className="py-2.5 px-3 font-bold text-slate-700 align-bottom">Group / Participant</th>
                {groupedAspects.map((g) => (
                  <th
                    key={g.framework}
                    scope="colgroup"
                    colSpan={g.aspects.length}
                    className={`py-1.5 px-3 text-center text-[10px] font-bold uppercase tracking-wider ${FRAMEWORK_HEADER_CLASS[g.framework]}`}
                  >
                    {g.framework} aspects
                  </th>
                ))}
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                {orderedAspects.map((aspect: any) => (
                  <th
                    key={aspect.id}
                    scope="col"
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
                      colSpan={1 + (orderedAspects.length || 0)}
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
                      {orderedAspects.map((aspect: any) => {
                        const voteKey = `${participant.id}:${aspect.id}`;
                        const isChecked = Boolean(votingState[voteKey]);
                        return (
                          <td key={aspect.id} className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!isAdmin}
                              aria-label={`${participant.name} validates ${aspect.name} (feeds ${normalizeFramework(aspect.framework)})`}
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
  );
}
