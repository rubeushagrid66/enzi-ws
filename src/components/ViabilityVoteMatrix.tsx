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
 *   D/V/F framework headers). The label filter is lifted for viewing:
 *   anyone can read every group's scores and reasons.
 * - Each aspect lists the selected group's participants and their votes
 *   (score + Alasan, or "Not scored yet"). Empty groups show a note.
 * - Editing: only in MY group, and only on aspects my role may score
 *   (label-role users: aspects whose label equals their role;
 *   FACILITATOR: any aspect, in their own group). Other groups are
 *   read-only for every role — except ADMIN, who can edit any
 *   participant's score and Alasan in any group (an admin is never
 *   blocked by not belonging to a group). The server enforces
 *   vote-as-yourself + label match on the vote API, and lets ADMIN /
 *   FACILITATOR vote for a named participant, so the UI rules below
 *   mirror it and never widen it.
 * - Public (logged-out) viewers are read-only.
 *
 * A score counts as validated for the current Viability formula
 * (share of validated votes) until the user defines the new 1-3
 * formula — the scoring math itself is untouched here.
 */
const FRAMEWORK_ORDER = ["Desirability", "Viability", "Feasibility"] as const;
const FRAMEWORK_HEADER_CLASS: Record<string, string> = {
  Desirability: "bg-emerald-100 text-emerald-800",
  Viability: "bg-blue-100 text-blue-800",
  Feasibility: "bg-amber-100 text-amber-800",
};
const FRAMEWORK_BADGE_CLASS: Record<string, string> = {
  Desirability: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Viability: "bg-blue-100 text-blue-800 border-blue-200",
  Feasibility: "bg-amber-100 text-amber-800 border-amber-200",
};

function isLabelRole(role: string | null | undefined): boolean {
  return role === "Business & Ops" || role === "Product" || role === "Tech";
}

export default function ViabilityVoteMatrix({
  project,
  finding,
  currentUser,
  onVotesChanged,
}: {
  project: any;
  finding: any;
  currentUser?: { id?: string; name: string; role: string } | null;
  onVotesChanged?: (updatedFinding: any) => void;
}) {
  const myLabel = isLabelRole(currentUser?.role) ? currentUser!.role : null;
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

  // Group selection: null = auto (my group when logged in, else the
  // first group). A new signed-in user re-selects automatically.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedGroupId(null);
  }, [currentUser?.id]);

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

  const canVote = Boolean(currentUser) && meId !== null;
  // Editable only in my own group, and only on aspects my role may
  // score (label roles: matching label only; ADMIN/FACILITATOR: any).
  // ADMIN additionally edits any participant's row in any group.
  const canEditAspect = (aspect: any) =>
    canVote && isMyGroup && (!myLabel || aspect.label === myLabel);

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
          <span className="font-extrabold text-blue-700">Score {vote.score}</span>
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
            Score your aspects 1–3 in your own group (marked Me). Other
            groups are view-only. A scored aspect counts as validated for
            the Viability score until the new 1–3 formula is defined.
            Scores and reasons are visible to everyone.
            {myLabel
              ? ` You are signed in as ${myLabel} — you can only score ${myLabel} aspects, in your own group.`
              : ""}
            {isAdmin
              ? " You are signed in as Admin — you can edit any participant's score and reason in any group."
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

      {/* Group selector chips */}
      {groups.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Choose a group to view">
          {groups.map((g: any) => {
            const isMe = Boolean(meGroupId && g.id === meGroupId);
            const selected = g.id === activeGroupId;
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedGroupId(g.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                    : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"
                }`}
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
      ) : (
        <p className="mt-4 text-xs text-slate-400 italic">No groups in this project yet.</p>
      )}

      {activeGroup && orderedParticipants.length === 0 && (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          No participants in {activeGroup.name} yet — add participants in the
          Dashboard to see their scores here.
        </p>
      )}

      {allAspects.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th scope="col" className="py-2.5 px-3 font-bold text-slate-700">Participant</th>
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
                    return (
                      <React.Fragment key={aspect.id}>
                        <tr className="bg-slate-50/70">
                          <td colSpan={3} className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 text-[13px]">{aspect.name}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${FRAMEWORK_BADGE_CLASS[fw]}`}>
                                {fw === "Desirability" ? "D" : fw === "Feasibility" ? "F" : "V"} · {fw}
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
                              {isMyGroup && !editable && myLabel && aspect.label !== myLabel && (
                                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-400">
                                  Not your label — view only
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
                          </td>
                        </tr>
                        {orderedParticipants.map((p: any) => {
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
                                <span className="font-bold text-slate-800 text-[13px]">{p.name}</span>
                                {p.roleTitle && (
                                  <span className="text-slate-500"> ({p.roleTitle})</span>
                                )}
                                {isMe && (
                                  <span className="ml-1.5 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                                    You
                                  </span>
                                )}
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
                                        className={`h-8 w-8 rounded-lg border text-sm font-extrabold transition disabled:opacity-60 ${
                                          rowScore === n
                                            ? "border-blue-600 bg-blue-600 text-white"
                                            : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"
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
                        })}
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
