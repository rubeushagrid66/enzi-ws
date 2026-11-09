"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Users2 } from "lucide-react";
import { normalizeFramework } from "@/lib/scoring";

/**
 * Group-aware viability scoring (1-3) with an Alasan (reason) per aspect.
 *
 * - One chip per group in the project; the chip for the group containing
 *   the viewer's own ("me") participant is marked "• Me". Default
 *   selected group is my group when logged in, otherwise the first group.
 * - Rows show ALL aspects of the project (all labels, grouped under the
 *   D/V/F framework headers). Anyone can read every group's scores
 *   and reasons.
 * - Each aspect lists the participants who may score it. A regular
 *   user only ever sees their OWN row (score + reason) — the rest of
 *   the team is not listed, since every user inputs data for their own
 *   group. ADMIN / FACILITATOR see (and may edit) every participant's
 *   row in any group. The admin account is not a scorer, so it never
 *   appears under any aspect.
 * - Editing: only in MY group, on any aspect. Other groups are
 *   read-only for every role — except ADMIN, who can edit any
 *   participant's score and Alasan in any group (an admin is never
 *   blocked by not belonging to a group). The server enforces
 *   vote-as-yourself on the vote API, and lets ADMIN / FACILITATOR
 *   vote for a named participant, so the UI rules below mirror it
 *   and never widen it.
 * - Public (logged-out) viewers are read-only.
 *
 * A score counts toward the participant's own V or F (1–3, defined
 * 2026-11-07): V = average of the participant's Viability aspect
 * scores; F = 4 − average of the participant's Effort (Feasibility
 * aspect) scores. Unscored aspects are skipped, never 0. There is no
 * composite score and no averaging across participants — each
 * participant's V and F are shown in the strip below the group chips.
 */
// Only Viability and Feasibility aspects are scored here — Desirability
// comes from research mentions (Wawancara + Survey), so Desirability-
// linked aspects are not shown in this matrix and do not feed any score.
const FRAMEWORK_ORDER = ["Viability", "Feasibility"] as const;
const FRAMEWORK_HEADER_CLASS: Record<string, string> = {
  Viability: "bg-blue-100 text-blue-800",
  Feasibility: "bg-amber-100 text-amber-800",
};
const FRAMEWORK_BADGE_CLASS: Record<string, string> = {
  Viability: "bg-blue-100 text-blue-800 border-blue-200",
  Feasibility: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function ViabilityVoteMatrix({
  project,
  finding,
  currentUser,
  selectedGroupId,
  onVotesChanged,
}: {
  project: any;
  finding: any;
  currentUser?: { id?: string; name: string; role: string } | null;
  /** The group to show, chosen by the parent (the chips sit above the
      detail tabs and scope the whole page). Null = auto (my group). */
  selectedGroupId?: string | null;
  onVotesChanged?: (updatedFinding: any) => void;
}) {
  const isAdmin = currentUser?.role === "ADMIN";
  const groups = (project.groups || []).filter((g: any) => g.isActive !== false);

  // "Me": the participant row the viewer votes as, plus its group.
  // Resolved on mount; a failed lookup leaves the table read-only
  // (never crashes it).
  const [meId, setMeId] = useState<string | null>(null);
  const [meGroupId, setMeGroupId] = useState<string | null>(null);
  const [meFailed, setMeFailed] = useState(false);
  // The "me" participant's display name (only needed when the project
  // data does not list the row yet).
  const [meName, setMeName] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${project.slug}/participants/me`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("me lookup failed");
        const data = await res.json();
        if (!cancelled && data.participant?.id) {
          setMeId(data.participant.id);
          if (data.participant.groupId) setMeGroupId(data.participant.groupId);
          // The project data may predate the "me" row (it is created on
          // first call); keep the name handy for the participant list.
          if (data.participant.groupId && !groups.some((g: any) =>
            (g.participants || []).some((p: any) => p.id === data.participant.id)
          )) {
            setMeName(data.participant.name);
          }
        } else if (!cancelled) {
          setMeFailed(true);
        }
      } catch {
        if (!cancelled) setMeFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.slug, currentUser?.id]);

  // Group selection comes from the parent (the chips above the detail
  // tabs). Fall back to my group, else the first group, when the parent
  // has not chosen one yet.
  const autoGroupId = meGroupId ?? groups[0]?.id ?? null;
  const activeGroupId =
    selectedGroupId && groups.some((g: any) => g.id === selectedGroupId)
      ? selectedGroupId
      : autoGroupId;
  const activeGroup = groups.find((g: any) => g.id === activeGroupId) || null;
  const isMyGroup = Boolean(currentUser && meGroupId && activeGroupId === meGroupId);

  // Participants of the selected group (active only), me first. If the
  // "me" row is not in the project data yet (created on first /me call),
  // synthesize it from the session so my row still shows.
  let groupParticipants: any[] = (activeGroup?.participants || []).filter(
    (p: any) => p.isActive !== false
  );
  if (isMyGroup && meId && !groupParticipants.some((p: any) => p.id === meId)) {
    groupParticipants = [
      ...groupParticipants,
      {
        id: meId,
        name: meName || currentUser!.name,
        roleTitle: currentUser!.role,
        userId: currentUser!.id ?? null,
        isActive: true,
      },
    ];
  }
  const orderedParticipants = [
    ...groupParticipants.filter((p: any) => p.id === meId),
    ...groupParticipants.filter((p: any) => p.id !== meId),
  ];

  // All aspects of the project — the label filter is viewing-only
  // history; everyone can now read every aspect.
  const allAspects = project.viabilityAspects || [];
  const groupedAspects = FRAMEWORK_ORDER.map((fw) => ({
    framework: fw,
    aspects: allAspects.filter((a: any) => normalizeFramework(a.framework) === fw),
  })).filter((g) => g.aspects.length > 0);

  // Votes on this finding, keyed by aspect id then participant id.
  const votesByAspect: Record<string, Record<string, any>> = {};
  for (const v of finding.viabilityVotes || []) {
    if (!votesByAspect[v.aspectId]) votesByAspect[v.aspectId] = {};
    votesByAspect[v.aspectId][v.participantId] = v;
  }

  // Participants shown in this matrix (aspect rows): the admin /
  // facilitator account is not a scorer and is never listed. A login
  // is identified by its role + group, not by a participant name —
  // participant names are informational only, so a regular user never
  // sees any name here, only their own score row.
  const displayParticipants = orderedParticipants.filter(
    (p: any) => p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR"
  );

  // Participants assigned to a given aspect. No names in this tab, for
  // ANY role, in any project: every viewer — regular user, ADMIN,
  // FACILITATOR — sees ONE row per aspect, their own score. ADMIN /
  // FACILITATOR score as themselves (their own participant row) in any
  // group they open, so the row must not depend on their participant
  // row being in the selected group — it is synthesized when needed.
  // (The aspect param is kept so call sites don't change.)
  const isFacilitator = currentUser?.role === "FACILITATOR";
  const meParticipant =
    meId != null
      ? (orderedParticipants.find((p: any) => p.id === meId) || {
          id: meId,
          name: currentUser?.name || "Me",
          roleTitle: currentUser?.role || "",
          userId: currentUser?.id ?? null,
          isActive: true,
        })
      : null;
  const participantsForAspect = (_aspect: any) =>
    meParticipant ? [meParticipant] : [];

  // Group average score for one aspect across the selected group's
  // participants — the read-only, name-free summary a viewer sees for
  // an aspect in a project/group where they have no "me" (e.g. a CMS
  // login viewing Value Chain). Includes the viewer's own vote when
  // they have one (ADMIN/FACILITATOR score as themselves). Null when
  // nobody scored.
  const groupAspectAverage = (aspectId: string): number | null => {
    const ids = new Set((displayParticipants || []).map((p: any) => p.id));
    if (meId) ids.add(meId);
    const vs = Array.from(ids)
      .map((id) => (votesByAspect[aspectId] || {})[id])
      .filter((v: any) => v && v.score != null);
    if (vs.length === 0) return null;
    return Number((vs.reduce((s: number, v: any) => s + Number(v.score), 0) / vs.length).toFixed(1));
  };

  // Non-empty reasons the selected group's participants gave for one
  // aspect — the name-free Alasan shown alongside the group average
  // above. Empty when nobody left a reason.
  const groupAspectReasons = (aspectId: string): string[] => {
    const ids = new Set((displayParticipants || []).map((p: any) => p.id));
    if (meId) ids.add(meId);
    return Array.from(ids)
      .map((id) => (votesByAspect[aspectId] || {})[id])
      .filter((v: any) => v && v.reason && String(v.reason).trim() !== "")
      .map((v: any) => String(v.reason).trim());
  };

  const canVote = Boolean(currentUser) && meId !== null;
  // Editable only in my own group, on any aspect. ADMIN additionally
  // edits any participant's row in any group.
  const canEditAspect = (_aspect: any) => canVote && isMyGroup;

  // Aspect title block (name + framework/label badges + description),
  // shared by the admin/facilitator header row and the regular user's
  // combined score row, where the aspect name sits on the same row as
  // the 1/2/3 buttons and the reason (no separate "Your score" row).
  const renderAspectTitle = (aspect: any, fw: string) => (
    <>
      <div className="font-bold text-slate-900 text-[13px]">{aspect.name}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${FRAMEWORK_BADGE_CLASS[fw]}`}>
          {fw === "Feasibility" ? "F" : "V"} · {fw}
        </span>
        {aspect.label ? (
          <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
            {aspect.label}
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            No label
          </span>
        )}
        {!isMyGroup && currentUser && !isAdmin && (
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-400">
            View only
          </span>
        )}
      </div>
      {aspect.description && (
        <div className="mt-1 text-[11px] text-slate-500">{aspect.description}</div>
      )}
    </>
  );

  // Scores / reasons, keyed by `${aspectId}:${participantId}` — one
  // entry per row in the table. The "me" row uses the viewer's own
  // participant id; an admin editing someone else's row uses that
  // participant's id. Synced from the finding only when a different
  // finding is shown — never while typing, so a background refresh
  // cannot clobber an Alasan input mid-keystroke.
  const voteKey = (aspectId: string, participantId: string) => `${aspectId}:${participantId}`;
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  useEffect(() => {
    const nextScores: Record<string, number | null> = {};
    const nextReasons: Record<string, string> = {};
    for (const v of finding.viabilityVotes || []) {
      nextScores[voteKey(v.aspectId, v.participantId)] = v.score != null ? Number(v.score) : null;
      nextReasons[voteKey(v.aspectId, v.participantId)] = v.reason || "";
    }
    setScores(nextScores);
    setReasons(nextReasons);
  }, [finding.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const reasonTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = reasonTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  const refreshFinding = useCallback(async () => {
    try {
      const projRes = await fetch(`/api/projects/${project.slug}`);
      if (!projRes.ok) return;
      const freshData = await projRes.json();
      const updatedF = freshData.project.findings.find((f: any) => f.id === finding.id);
      if (updatedF && onVotesChanged) onVotesChanged(updatedF);
    } catch {
      // The save already succeeded; a stale list is a cosmetic miss.
    }
  }, [project.slug, finding.id, onVotesChanged]);

  const postVote = useCallback(
    async (aspectId: string, participantId: string, score: number | null, reason: string) => {
      const key = voteKey(aspectId, participantId);
      setSaving((s) => ({ ...s, [key]: true }));
      setSaveError(null);
      try {
        const res = await fetch(
          `/api/projects/${project.slug}/findings/${finding.id}/viability-vote`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aspectId, participantId, score, reason }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Saving failed (${res.status})`);
        }
        await refreshFinding();
      } catch (e: any) {
        setSaveError(e.message || "Failed to save score");
        // Revert the optimistic local state from the finding prop.
        const saved = (finding.viabilityVotes || []).find(
          (v: any) => v.participantId === participantId && v.aspectId === aspectId
        );
        setScores((prev) => ({ ...prev, [key]: saved?.score != null ? Number(saved.score) : null }));
        setReasons((prev) => ({ ...prev, [key]: saved?.reason || "" }));
      } finally {
        setSaving((s) => ({ ...s, [key]: false }));
      }
    },
    [project.slug, finding, refreshFinding]
  );

  const handleScoreClick = (aspectId: string, participantId: string, score: number) => {
    const key = voteKey(aspectId, participantId);
    if (!currentUser || saving[key]) return;
    const next = scores[key] === score ? null : score;
    setScores((prev) => ({ ...prev, [key]: next }));
    postVote(aspectId, participantId, next, reasons[key] || "");
  };

  const handleReasonChange = (aspectId: string, participantId: string, value: string) => {
    const key = voteKey(aspectId, participantId);
    setReasons((prev) => ({ ...prev, [key]: value }));
    if (reasonTimers.current[key]) clearTimeout(reasonTimers.current[key]);
    reasonTimers.current[key] = setTimeout(() => {
      postVote(aspectId, participantId, scores[key] ?? null, value);
    }, 700);
  };

  const handleReasonBlur = (aspectId: string, participantId: string) => {
    const key = voteKey(aspectId, participantId);
    if (reasonTimers.current[key]) {
      clearTimeout(reasonTimers.current[key]);
      delete reasonTimers.current[key];
    }
    // Save on blur only if a score exists (a reason without a score
    // has nothing to attach to yet).
    if (scores[key] != null) {
      postVote(aspectId, participantId, scores[key], reasons[key] || "");
    }
  };

  const renderVote = (vote: any) => {
    if (!vote) return <span className="text-slate-400 italic">Not scored yet</span>;
    return (
      <>
        {vote.score != null ? (
          <span className="font-bold text-emerald-700">Score {vote.score}</span>
        ) : (
          <span className="font-semibold text-emerald-700">✓ validated</span>
        )}
      </>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Users2 className="h-4 w-4 text-blue-600" />
            <span>Viability Scoring</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Score each aspect 1–3 for your own group (marked Me). Other
            groups are view-only. V = average of your Viability aspect
            scores; F = 4 − average of your Effort aspect scores. Unscored
            aspects are skipped. Scores and reasons are visible to
            everyone.
            {isAdmin
              ? " You are signed in as Admin — you score each aspect as yourself, in any group."
              : ""}
            {!currentUser ? " Sign in to score." : ""}
            {meFailed ? " Your voter profile could not be resolved — read-only for now." : ""}
          </p>
        </div>
        {Object.values(saving).some(Boolean) && (
          <span className="text-xs text-blue-600 font-semibold animate-pulse">Saving…</span>
        )}
      </div>

      {saveError && (
        <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">
          {saveError}
        </p>
      )}

      {/* Group chips live in the parent (above the detail tabs) and
          scope the whole page — this matrix only shows the group the
          parent selected. No participant names are shown in this tab:
          participant names are informational only and a login is
          identified by its role + group, so the per-participant V/F
          chips were removed. The group's V/F lives in the summary
          cards above. */}

      {allAspects.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th scope="col" className="py-2.5 px-3 font-bold text-slate-700">Aspect</th>
                <th scope="col" className="py-2.5 px-3 font-bold text-slate-700 text-center">Score (1–3)</th>
                <th scope="col" className="py-2.5 px-3 font-bold text-slate-700">Alasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedAspects.map((g) => (
                <React.Fragment key={g.framework}>
                  <tr className={`${FRAMEWORK_HEADER_CLASS[g.framework]}`}>
                    <td colSpan={3} className="py-1.5 px-3 text-[10px] font-bold uppercase tracking-wider">
                      {g.framework} aspects
                    </td>
                  </tr>
                  {g.aspects.map((aspect: any) => {
                    const editable = canEditAspect(aspect);
                    const fw = normalizeFramework(aspect.framework);
                    const rows = participantsForAspect(aspect);
                    const groupAvg = groupAspectAverage(aspect.id);
                    const groupReasons = groupAspectReasons(aspect.id);
                    return (
                      <React.Fragment key={aspect.id}>
                        {rows.length === 0 ? (
                            // Viewer with no "me" in this project/group
                            // (e.g. a CMS login viewing Value Chain, or a
                            // failed "me" lookup): one read-only row with
                            // the group's average score for the aspect.
                            // No names, no editable controls.
                            <tr key={aspect.id} className="hover:bg-slate-50/80 transition align-top">
                              <td className="py-2.5 px-3">{renderAspectTitle(aspect, fw)}</td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                {groupAvg != null ? (
                                  <span className="font-bold text-emerald-700">Score {groupAvg}</span>
                                ) : (
                                  <span className="text-slate-500">N/A</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 min-w-[180px]">
                                {groupReasons.length > 0 ? (
                                  <span className="text-slate-600">{groupReasons.join(" · ")}</span>
                                ) : (
                                  <span className="text-slate-500">N/A</span>
                                )}
                              </td>
                            </tr>
                        ) : (
                          rows.map((p: any) => {
                          const isMe = p.id === meId;
                          const vote = (votesByAspect[aspect.id] || {})[p.id];
                          // Admin edits any participant's row in any
                          // group; everyone else only their own row, in
                          // their own group, on aspects their role may
                          // score. The vote API enforces the same rule.
                          const rowEditable = isAdmin || (isMe && editable);
                          const key = voteKey(aspect.id, p.id);
                          const rowScore = scores[key] ?? null;
                          const rowReason = reasons[key] || "";
                          return (
                            <tr key={`${aspect.id}:${p.id}`} className="hover:bg-slate-50/80 transition align-top">
                              <td className="py-2.5 px-3">
                                {renderAspectTitle(aspect, fw)}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                {rowEditable ? (
                                  <span className="inline-flex items-center gap-1" role="group" aria-label={`Score for ${aspect.name}`}>
                                    {[1, 2, 3].map((n) => (
                                      <button
                                        key={n}
                                        type="button"
                                        disabled={saving[key]}
                                        aria-pressed={rowScore === n}
                                        aria-label={`Score ${n} for ${aspect.name}`}
                                        onClick={() => handleScoreClick(aspect.id, p.id, n)}
                                        className={`h-8 w-8 rounded-lg border text-sm font-bold transition disabled:opacity-60 ${
                                          rowScore === n
                                            ? "border-emerald-600 bg-emerald-600 text-white"
                                            : "border-slate-300 bg-white text-slate-700 hover:border-emerald-400"
                                        }`}
                                      >
                                        {n}
                                      </button>
                                    ))}
                                    {rowScore != null && (
                                      <button
                                        type="button"
                                        disabled={saving[key]}
                                        aria-label={`Clear score for ${aspect.name}`}
                                        onClick={() => handleScoreClick(aspect.id, p.id, rowScore)}
                                        className="ml-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-60"
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </span>
                                ) : (
                                  renderVote(vote)
                                )}
                              </td>
                              <td className="py-2.5 px-3 min-w-[180px]">
                                {rowEditable ? (
                                  <input
                                    type="text"
                                    value={rowReason}
                                    maxLength={500}
                                    placeholder="Alasan untuk skor ini…"
                                    aria-label={`Alasan for ${aspect.name}`}
                                    onChange={(e) => handleReasonChange(aspect.id, p.id, e.target.value)}
                                    onBlur={() => handleReasonBlur(aspect.id, p.id)}
                                    className="input w-full !py-1.5 !text-xs"
                                  />
                                ) : (
                                  <span className="text-slate-600">
                                    {vote?.reason || "—"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic py-4">
          No aspects configured for this project.
        </p>
      )}
    </div>
  );
}
