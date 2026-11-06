"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Users2 } from "lucide-react";
import { normalizeFramework } from "@/lib/scoring";

/**
 * "My scoring" — viability scoring per aspect (1-3) with an Alasan
 * (reason) per aspect. Replaces the old participant voting matrix:
 * there is no Group/Participant column and no per-participant rows.
 * Each logged-in user scores the aspects visible to them as
 * themselves (their "me" participant row); everyone can read all
 * scores and reasons.
 *
 * Visibility: a user whose role is an aspect label ("Business & Ops",
 * "Product", "Tech") sees ONLY aspects carrying that label. ADMIN,
 * FACILITATOR and logged-out (public) viewers see all aspects.
 * Public viewers are read-only.
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

const LABEL_ROLES = ["Business & Ops", "Product", "Tech"];

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
  // Aspects visible to the viewer (label-role: only their label).
  const visibleAspects = (project.viabilityAspects || []).filter((a: any) =>
    myLabel ? a.label === myLabel : true
  );
  const groupedAspects = FRAMEWORK_ORDER.map((fw) => ({
    framework: fw,
    aspects: visibleAspects.filter((a: any) => normalizeFramework(a.framework) === fw),
  })).filter((g) => g.aspects.length > 0);
  const orderedAspects = groupedAspects.flatMap((g) => g.aspects);

  // Participant id -> name, for showing other voters.
  const participantNames: Record<string, string> = {};
  for (const g of project.groups || []) {
    for (const p of g.participants || []) participantNames[p.id] = p.name;
  }

  // "Me": the participant row the viewer votes as. Resolved on mount;
  // a failed lookup leaves the table read-only (never crashes it).
  const [meId, setMeId] = useState<string | null>(null);
  const [meFailed, setMeFailed] = useState(false);
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
          participantNames[data.participant.id] = data.participant.name;
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

  const canVote = Boolean(currentUser) && meId !== null;

  // My scores / reasons, keyed by aspect id. Synced from the finding
  // only when a different finding is shown (or "me" resolves) — never
  // while typing, so a background refresh cannot clobber the Alasan
  // input mid-keystroke.
  const [myScores, setMyScores] = useState<Record<string, number | null>>({});
  const [myReasons, setMyReasons] = useState<Record<string, string>>({});
  useEffect(() => {
    const scores: Record<string, number | null> = {};
    const reasons: Record<string, string> = {};
    for (const v of finding.viabilityVotes || []) {
      if (v.participantId !== meId) continue;
      scores[v.aspectId] = v.score != null ? Number(v.score) : null;
      reasons[v.aspectId] = v.reason || "";
    }
    setMyScores(scores);
    setMyReasons(reasons);
  }, [finding.id, meId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    async (aspectId: string, score: number | null, reason: string) => {
      setSaving((s) => ({ ...s, [aspectId]: true }));
      setSaveError(null);
      try {
        const res = await fetch(
          `/api/projects/${project.slug}/findings/${finding.id}/viability-vote`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aspectId, score, reason }),
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
        const mine = (finding.viabilityVotes || []).find(
          (v: any) => v.participantId === meId && v.aspectId === aspectId
        );
        setMyScores((prev) => ({ ...prev, [aspectId]: mine?.score != null ? Number(mine.score) : null }));
        setMyReasons((prev) => ({ ...prev, [aspectId]: mine?.reason || "" }));
      } finally {
        setSaving((s) => ({ ...s, [aspectId]: false }));
      }
    },
    [project.slug, finding, meId, refreshFinding]
  );

  const handleScoreClick = (aspectId: string, score: number) => {
    if (!canVote || saving[aspectId]) return;
    const next = myScores[aspectId] === score ? null : score;
    setMyScores((prev) => ({ ...prev, [aspectId]: next }));
    postVote(aspectId, next, myReasons[aspectId] || "");
  };

  const handleReasonChange = (aspectId: string, value: string) => {
    setMyReasons((prev) => ({ ...prev, [aspectId]: value }));
    if (reasonTimers.current[aspectId]) clearTimeout(reasonTimers.current[aspectId]);
    reasonTimers.current[aspectId] = setTimeout(() => {
      postVote(aspectId, myScores[aspectId] ?? null, value);
    }, 700);
  };

  const handleReasonBlur = (aspectId: string) => {
    if (reasonTimers.current[aspectId]) {
      clearTimeout(reasonTimers.current[aspectId]);
      delete reasonTimers.current[aspectId];
    }
    // Save on blur only if a score exists (a reason without a score
    // has nothing to attach to yet).
    if (myScores[aspectId] != null) {
      postVote(aspectId, myScores[aspectId], myReasons[aspectId] || "");
    }
  };

  // Other voters' votes on an aspect (everyone can read them).
  const othersFor = (aspectId: string) =>
    (finding.viabilityVotes || []).filter(
      (v: any) => v.aspectId === aspectId && v.participantId !== meId
    );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Users2 className="h-4 w-4 text-blue-600" />
            <span>
              My Scoring (Viability Aspects)
              {myLabel ? ` — ${myLabel} only` : ""}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Score each aspect 1–3 and write your Alasan (reason) for the
            score. A scored aspect counts as validated for the Viability
            score until the new 1–3 formula is defined. Scores and reasons
            are visible to everyone.
            {myLabel
              ? ` You are signed in as ${myLabel}, so you only see ${myLabel} aspects.`
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

      {orderedAspects.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th scope="col" className="py-2.5 px-3 font-bold text-slate-700">Aspect</th>
                <th scope="col" className="py-2.5 px-3 font-bold text-slate-700 text-center">My score (1–3)</th>
                <th scope="col" className="py-2.5 px-3 font-bold text-slate-700">Alasan</th>
                <th scope="col" className="py-2.5 px-3 font-bold text-slate-700">Others&apos; scores &amp; reasons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedAspects.map((g) => (
                <React.Fragment key={g.framework}>
                  <tr className={`${FRAMEWORK_HEADER_CLASS[g.framework]}`}>
                    <td colSpan={4} className="py-1.5 px-3 text-[10px] font-bold uppercase tracking-wider">
                      {g.framework} aspects
                    </td>
                  </tr>
                  {g.aspects.map((aspect: any) => {
                    const myScore = myScores[aspect.id] ?? null;
                    const myReason = myReasons[aspect.id] || "";
                    const others = othersFor(aspect.id);
                    const fw = normalizeFramework(aspect.framework);
                    return (
                      <tr key={aspect.id} className="hover:bg-slate-50/80 transition align-top">
                        <td className="py-2.5 px-3">
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
                          </div>
                          {aspect.description && (
                            <div className="mt-1 text-[11px] text-slate-500">{aspect.description}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {canVote ? (
                            <div className="inline-flex items-center gap-1" role="group" aria-label={`Score for ${aspect.name}`}>
                              {[1, 2, 3].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  disabled={saving[aspect.id]}
                                  aria-pressed={myScore === n}
                                  aria-label={`Score ${n} for ${aspect.name}`}
                                  onClick={() => handleScoreClick(aspect.id, n)}
                                  className={`h-8 w-8 rounded-lg border text-sm font-extrabold transition disabled:opacity-60 ${
                                    myScore === n
                                      ? "border-blue-600 bg-blue-600 text-white"
                                      : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                              {myScore != null && (
                                <button
                                  type="button"
                                  disabled={saving[aspect.id]}
                                  aria-label={`Clear score for ${aspect.name}`}
                                  onClick={() => handleScoreClick(aspect.id, myScore)}
                                  className="ml-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-60"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 font-bold">
                              {myScore != null ? myScore : "—"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 min-w-[180px]">
                          {canVote ? (
                            <input
                              type="text"
                              value={myReason}
                              maxLength={500}
                              placeholder="Alasan untuk skor ini…"
                              aria-label={`Alasan for ${aspect.name}`}
                              onChange={(e) => handleReasonChange(aspect.id, e.target.value)}
                              onBlur={() => handleReasonBlur(aspect.id)}
                              className="input w-full !py-1.5 !text-xs"
                            />
                          ) : (
                            <span className="text-slate-600">{myReason || "—"}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {others.length > 0 ? (
                            <ul className="space-y-1.5">
                              {others.map((v: any) => (
                                <li key={v.id || `${v.participantId}:${v.aspectId}`} className="text-[11px] leading-snug">
                                  <span className="font-bold text-slate-800">
                                    {participantNames[v.participantId] || "Participant"}
                                  </span>
                                  {": "}
                                  {v.score != null ? (
                                    <span className="font-extrabold text-blue-700">Score {v.score}</span>
                                  ) : (
                                    <span className="font-semibold text-emerald-700">✓ validated</span>
                                  )}
                                  {v.reason ? (
                                    <span className="text-slate-600"> — “{v.reason}”</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400 italic">No other scores yet</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic py-4">
          {myLabel
            ? `No ${myLabel} aspects in this project yet.`
            : "No aspects configured for this project."}
        </p>
      )}
    </div>
  );
}
