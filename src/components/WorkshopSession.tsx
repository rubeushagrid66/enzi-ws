"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import FeasibilityMatrix from "./FeasibilityMatrix";
import ViabilityVoteMatrix from "./ViabilityVoteMatrix";
import { scoresForParticipant, findingBoardPosition } from "@/lib/scoring";
import { useMeParticipantId } from "@/lib/useMeParticipant";
import {
  Target,
  Users2,
  Compass,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Clock,
  Plus,
  Copy,
} from "lucide-react";

type Step = "desirability" | "viability" | "feasibility";

const STEPS: Array<{ id: Step; label: string; hint: string }> = [
  { id: "desirability", label: "1 · Desirability score", hint: "Desirability" },
  { id: "viability", label: "2 · Record votes", hint: "Viability" },
  { id: "feasibility", label: "3 · Consensus placement", hint: "Feasibility" },
];

function StatusChip({ scored, label }: { scored: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
        scored
          ? "border-bsi-200 bg-bsi-50 text-bsi-800"
          : "border-gold-200 bg-gold-50 text-gold-800"
      }`}
    >
      {scored && <CheckCircle2 className="h-3 w-3" />}
      {label}: {scored ? "Scored" : "Pending"}
    </span>
  );
}

export default function WorkshopSession({
  slug,
  currentUser,
}: {
  slug: string;
  currentUser: { name: string; role: string };
}) {
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("desirability");
  const [status, setStatus] = useState<string | null>(null);
  // "Me": the score lines below show this participant's own V/F (1–3).
  const meId = useMeParticipantId(slug, currentUser as any);

  // Step 3 (Feasibility) consensus: last position saved by a drag.
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Step 0 (finding picker): the shared findings pool + creating a new
  // finding in this project. Selecting a pool finding COPIES it into
  // this project — the copy is scored independently, the pool original
  // is untouched and stays Unscored.
  const [poolFindings, setPoolFindings] = useState<any[]>([]);
  const [newFindingTitle, setNewFindingTitle] = useState("");
  const [newFindingDesc, setNewFindingDesc] = useState("");
  const [pickerStatus, setPickerStatus] = useState<string | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);

  const loadPool = useCallback(async () => {
    try {
      const res = await fetch("/api/global/findings", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPoolFindings((data.findings || []).filter((f: any) => !f.projectId));
    } catch {
      // Pool unavailable (e.g. before the global SQL is run): the
      // picker simply stays empty; scoring the project's own findings
      // still works.
    }
  }, []);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  const handleSelectFromPool = async (poolFinding: any) => {
    setPickerBusy(true);
    setPickerStatus(null);
    try {
      const res = await fetch(`/api/projects/${slug}/findings/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId: poolFinding.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Copy failed (${res.status})`);
      await loadProject(true);
      if (data.finding?.id) {
        setSelectedFindingId(data.finding.id);
        setStep("desirability");
      }
      setPickerStatus(`“${poolFinding.title}” copied into this workshop — it starts Unscored.`);
    } catch (e: any) {
      setPickerStatus(e.message || "Failed to copy finding from the pool.");
    } finally {
      setPickerBusy(false);
    }
  };

  const handleCreateFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFindingTitle.trim()) return;
    setPickerBusy(true);
    setPickerStatus(null);
    try {
      const res = await fetch(`/api/projects/${slug}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newFindingTitle.trim(), description: newFindingDesc.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Create failed (${res.status})`);
      setNewFindingTitle("");
      setNewFindingDesc("");
      await loadProject(true);
      if (data.finding?.id) {
        setSelectedFindingId(data.finding.id);
        setStep("desirability");
      }
      setPickerStatus("Finding created in this workshop — it starts Unscored.");
    } catch (err: any) {
      setPickerStatus(err.message || "Failed to create finding.");
    } finally {
      setPickerBusy(false);
    }
  };

  const loadProject = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        const res = await fetch(`/api/projects/${slug}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Project not found");
        const data = await res.json();
        setProject(data.project);
      } catch (err: any) {
        if (!silent) setError(err.message || "Failed to load project");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const findings: any[] = project?.findings || [];
  const selectedFinding =
    findings.find((f) => f.id === selectedFindingId) || findings[0] || null;

  // Reset the consensus state whenever a different finding is selected.
  useEffect(() => {
    if (!selectedFinding) return;
    setConfirmed(false);
    setLastPos(
      selectedFinding.feasibilityX != null && selectedFinding.feasibilityY != null
        ? { x: selectedFinding.feasibilityX, y: selectedFinding.feasibilityY }
        : null
    );
    setStatus(null);
  }, [selectedFinding?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge a freshly saved finding into local state (no full reload, so a
  // dragged card stays where it was dropped).
  const applyUpdatedFinding = (updated: any) => {
    if (!updated?.id) return;
    setProject((prev: any) =>
      prev
        ? {
            ...prev,
            findings: (prev.findings || []).map((f: any) =>
              f.id === updated.id ? { ...f, ...updated } : f
            ),
          }
        : prev
    );
  };

  const scoredCount = findings.filter((f) => f.scoringStatus?.scored).length;
  const nextUnscored = findings.find((f) => !f.scoringStatus?.scored);

  // --- Step 3: confirm the consensus position ---
  const handleConfirmPosition = async () => {
    if (!selectedFinding || !lastPos) return;
    setConfirming(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/projects/${slug}/findings/${selectedFinding.id}/feasibility`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: lastPos.x, y: lastPos.y }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      if (data.finding) applyUpdatedFinding(data.finding);
      setConfirmed(true);
      await loadProject(true);
      setStatus("Consensus position confirmed and saved.");
    } catch (e: any) {
      setStatus(e.message || "Failed to confirm position.");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-bsi-600 border-t-transparent" />
            <p className="text-sm font-semibold text-slate-600">Loading workshop…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Project Not Found</h2>
            <p className="mt-2 text-sm text-slate-600">{error || "This project does not exist."}</p>
            <Link href="/" className="mt-6 inline-flex px-4 py-2 rounded-xl text-xs font-semibold bg-bsi-600 text-white">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const st = selectedFinding?.scoringStatus || {};
  // My V/F on the selected finding (1–3, per participant, no composite).
  const mySelected = selectedFinding
    ? scoresForParticipant(selectedFinding.scores?.participantScores, meId)
    : { viability: null, feasibility: null };
  // Board position of the selected finding for me (pinned or computed).
  const boardPosWorkshop = selectedFinding
    ? findingBoardPosition(selectedFinding, meId)
    : null;
  const stepDone: Record<Step, boolean> = {
    desirability: !!st.desirabilityScored,
    viability: !!st.viabilityScored,
    feasibility: !!st.feasibilityScored,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 flex-1">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-bsi-700 bg-bsi-50 px-2.5 py-0.5 rounded-full border border-bsi-200">
              Workshop Scoring Session
            </span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              Score each finding together with the participants, in three steps.
              Findings stay unscored until the group produces the data — nothing
              is scored at creation.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-700">
              {scoredCount} of {findings.length} findings fully scored
            </p>
          </div>
          <Link
            href={`/${project.slug}`}
            className="btn-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Result Viewer
          </Link>
        </div>

        <div role="note" className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <span className="font-bold text-slate-800">One driver at a time.</span>{" "}
          Several facilitators can be logged in at once ({currentUser.name} is driving
          as {currentUser.role}), but agree who drives this shared screen — two people
          dragging the same card or saving at the same moment will overwrite each
          other (last save wins). Votes are safe: each participant&apos;s vote is
          stored separately.
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Finding list */}
          <section aria-labelledby="workshop-findings-heading" className="card p-4 lg:sticky lg:top-4">
            <h2 id="workshop-findings-heading" className="text-sm font-bold text-slate-900">
              Findings to score
            </h2>
            <ul className="mt-3 space-y-2">
              {findings.map((f) => {
                const active = selectedFinding?.id === f.id;
                const fs = f.scoringStatus || {};
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFindingId(f.id);
                        setStep("desirability");
                      }}
                      aria-current={active ? "true" : undefined}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-bsi-500 bg-bsi-50/60"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span className="block text-sm font-bold text-slate-900 leading-snug">
                        {f.title}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1">
                        <StatusChip scored={!!fs.desirabilityScored} label="D" />
                        <StatusChip scored={!!fs.viabilityScored} label="V" />
                        <StatusChip scored={!!fs.feasibilityScored} label="F" />
                      </span>
                    </button>
                  </li>
                );
              })}
              {findings.length === 0 && (
                <li className="text-sm text-slate-500 italic">
                  No findings in this workshop yet — pick one from the pool or create one below.
                </li>
              )}
            </ul>

            {/* Step 0 — finding picker: pool or new */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-900">Step 0 — Add a finding</h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Select one from the shared pool, or create a new one for this workshop.
                A pool finding is copied in — it starts Unscored and is scored here only.
              </p>
              {pickerStatus && (
                <p role="status" className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                  {pickerStatus}
                </p>
              )}
              {poolFindings.length > 0 && (
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {poolFindings.map((f: any) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">{f.title}</span>
                        {f.description && <span className="block truncate text-xs text-slate-500">{f.description}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectFromPool(f)}
                        disabled={pickerBusy}
                        className="btn-secondary shrink-0 !px-2.5 !py-1.5 text-xs disabled:opacity-50"
                      >
                        <Copy className="h-3.5 w-3.5" /> Select
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={handleCreateFinding} className="mt-3 space-y-2">
                <label htmlFor="workshop-new-finding" className="sr-only">New finding title</label>
                <input
                  id="workshop-new-finding"
                  type="text"
                  required
                  placeholder="New finding title (e.g. Tampilan Membingungkan)"
                  value={newFindingTitle}
                  onChange={(e) => setNewFindingTitle(e.target.value)}
                  className="input w-full"
                />
                <label htmlFor="workshop-new-finding-desc" className="sr-only">New finding description</label>
                <input
                  id="workshop-new-finding-desc"
                  type="text"
                  placeholder="Description (optional)"
                  value={newFindingDesc}
                  onChange={(e) => setNewFindingDesc(e.target.value)}
                  className="input w-full"
                />
                <button type="submit" disabled={pickerBusy} className="btn-primary w-full justify-center disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Create new finding in this workshop
                </button>
              </form>
            </div>
          </section>

          {/* Scoring walkthrough */}
          <section aria-labelledby="workshop-scoring-heading" className="lg:col-span-2 space-y-6">
            {!selectedFinding ? (
              <div className="card p-8 text-center text-sm text-slate-500">
                Select a finding on the left to start scoring it with the group.
              </div>
            ) : (
              <>
                <div className="card p-6">
                  <h2 id="workshop-scoring-heading" className="text-lg font-bold text-slate-900">
                    {selectedFinding.title}
                  </h2>
                  {selectedFinding.description && (
                    <p className="mt-1 text-sm text-slate-600">{selectedFinding.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1">
                    <StatusChip scored={!!st.desirabilityScored} label="Desirability" />
                    <StatusChip scored={!!st.viabilityScored} label="Viability" />
                    <StatusChip scored={!!st.feasibilityScored} label="Feasibility" />
                  </div>
                  {status && (
                    <p role="status" className="mt-3 text-sm font-semibold text-bsi-700">
                      {status}
                    </p>
                  )}
                </div>

                {/* Stepper */}
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Scoring steps">
                  {STEPS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={step === s.id}
                      onClick={() => setStep(s.id)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                        step === s.id
                          ? "bg-bsi-600 text-white border-bsi-600"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {stepDone[s.id] && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* STEP 1 — Desirability (research score, read-only) */}
                {step === "desirability" && (
                  <div className="card p-6 space-y-4">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <Target className="h-4 w-4 text-bsi-600" />
                        Step 1 — Desirability score (from research)
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Desirability comes from research numbers, not from the
                        workshop: how many users mentioned this finding in
                        Wawancara and in Survey. Show the group the evidence
                        first, then score Viability and Feasibility in the
                        next steps. Counts are entered on the finding&apos;s
                        detail page (Desirability tab).
                      </p>
                    </div>

                    {(() => {
                      const d = selectedFinding.scores?.desirabilityDetails || {};
                      const row = (label: string, s: any, threshold: string) => (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-800">{label}</div>
                            <div className="text-xs text-slate-500">{threshold}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-slate-900">
                              {s?.mentions != null && s?.total != null
                                ? `${s.mentions} of ${s.total} (${s.percent}%)`
                                : "No count entered"}
                            </div>
                            <div className="text-xs font-semibold text-bsi-700">
                              {s?.score != null ? `Score ${s.score} / 3` : "\u2014"}
                            </div>
                          </div>
                        </div>
                      );
                      return (
                        <div className="space-y-3">
                          {row("Wawancara", d.interview, "\u2265 66% \u2192 3 \u00b7 \u2265 33% \u2192 2 \u00b7 below 33% \u2192 1")}
                          {row("Survey", d.survey, "\u2265 30% \u2192 3 \u00b7 \u2265 15% \u2192 2 \u00b7 below 15% \u2192 1")}
                        </div>
                      );
                    })()}

                    <p className="text-sm text-slate-600">
                      {st.desirabilityScored ? (
                        <>Desirability score: <span className="font-extrabold text-bsi-700">{selectedFinding.scores?.desirability} / 3</span>
                          {" — "}
                          {selectedFinding.scores?.desirabilityDetails?.formulaExplanation}
                        </>
                      ) : (
                        "Not scored yet — enter the research mentions on the finding's detail page (Desirability tab) and the score appears here."
                      )}
                    </p>
                  </div>
                )}

                {/* STEP 2 — Viability votes */}
                {step === "viability" && (
                  <div className="card p-6 space-y-4">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <Users2 className="h-4 w-4 text-bsi-600" />
                        Step 2 — Record votes (Viability)
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Score each aspect 1–3 as yourself and write your Alasan
                        (reason) per aspect. Your Viability score is the average of
                        your Viability aspect scores; your Feasibility score is
                        4 − the average of your Effort (Feasibility-linked) aspect
                        scores. If your role is Business &amp; Ops, Product or Tech
                        you can only score your own label&apos;s aspects in your own
                        group (marked Me) — every other group and aspect is
                        view-only.
                      </p>
                    </div>
                    <ViabilityVoteMatrix
                      project={project}
                      finding={selectedFinding}
                      currentUser={currentUser}
                      onVotesChanged={(updated) => {
                        applyUpdatedFinding(updated);
                        loadProject(true);
                      }}
                    />
                    <p className="text-sm text-slate-600">
                      {mySelected.viability != null ? (
                        <>Your Viability score: <span className="font-bold text-bsi-700">{mySelected.viability} / 3</span> (average of your Viability aspect scores)</>
                      ) : (
                        "Not scored by you yet — record at least one vote on a Viability aspect to score it."
                      )}
                    </p>
                  </div>
                )}

                {/* STEP 3 — Feasibility consensus */}
                {step === "feasibility" && (
                  <div className="card p-6 space-y-4">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <Compass className="h-4 w-4 text-gold-600" />
                        Step 3 — Consensus placement (Feasibility)
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Discuss impact vs. effort as a group, drag the card to the
                        position everyone agrees on, then confirm it. The board
                        position is visual placement only — your Feasibility score
                        comes from the Feasibility-linked aspects you voted on in
                        Step 2: F = 4 − the average of your Effort scores. The board
                        places the card automatically from your D, V and F scores;
                        dragging it pins it to a manual position instead.
                      </p>
                    </div>
                    <FeasibilityMatrix
                      finding={selectedFinding}
                      allFindings={findings}
                      projectSlug={project.slug}
                      isAdmin={true}
                      meId={meId}
                      onPositionSaved={(updated) => {
                        applyUpdatedFinding(updated);
                        if (updated.feasibilityX != null && updated.feasibilityY != null) {
                          setLastPos({
                            x: updated.feasibilityX,
                            y: updated.feasibilityY,
                          });
                        }
                        setConfirmed(false);
                        loadProject(true);
                      }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-600">
                        {mySelected.feasibility != null ? (
                          <>Placed: <span className="font-bold text-slate-900">{boardPosWorkshop?.quadrant?.replace("_", " ") ?? "—"}</span> — Your Feasibility score: <span className="font-extrabold text-gold-700">{mySelected.feasibility} / 3</span> (4 − average of your Effort scores)</>
                        ) : (
                          "Not scored by you yet — record votes on Feasibility-linked aspects in Step 2. The board places the card once you have D, V and F; dragging it pins it to a manual position."
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={handleConfirmPosition}
                        disabled={!lastPos || confirming}
                        className="btn-primary"
                      >
                        {confirming
                          ? "Confirming…"
                          : confirmed
                            ? "✓ Consensus position confirmed"
                            : "Confirm consensus position"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step navigation */}
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(step === "feasibility" ? "viability" : "desirability")}
                    disabled={step === "desirability"}
                    className="btn-secondary disabled:opacity-50"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  {step !== "feasibility" ? (
                    <button
                      type="button"
                      onClick={() => setStep(step === "desirability" ? "viability" : "feasibility")}
                      className="btn-primary"
                    >
                      Next step <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : nextUnscored && nextUnscored.id !== selectedFinding.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFindingId(nextUnscored.id);
                        setStep("desirability");
                      }}
                      className="btn-primary"
                    >
                      Next unscored finding <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <Link href={`/${project.slug}`} className="btn-primary">
                      {st.scored ? "Done — view results" : "Back to viewer"} <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>

                {st.scored && (
                  <div role="status" className="flex items-start gap-2 rounded-xl border border-bsi-200 bg-bsi-50 p-4 text-sm text-bsi-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="font-bold">Fully scored.</span> This finding now
                      appears in the scored list. Scores can still be changed by a
                      facilitator — there is no lock yet; locking is part of the
                      planned Phase 2 session design.
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Scores save as you go — you can leave and come back; anything already
          scored stays scored.
        </p>
      </main>
    </div>
  );
}
