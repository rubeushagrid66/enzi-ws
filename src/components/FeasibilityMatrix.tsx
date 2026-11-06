"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Move, Check, AlertCircle, ShieldAlert } from "lucide-react";
import { FeasibilityQuadrant } from "@/lib/scoring";

interface FindingItem {
  id: string;
  title: string;
  feasibilityX?: number | null;
  feasibilityY?: number | null;
  feasibilityQuadrant?: string | null;
  feasibilityImpact?: string | null;
  feasibilityEffort?: string | null;
}

interface FeasibilityMatrixProps {
  finding: FindingItem;
  allFindings?: FindingItem[];
  projectSlug: string;
  isAdmin: boolean;
  onPositionSaved?: (updatedFinding: FindingItem) => void;
}

export default function FeasibilityMatrix({
  finding,
  allFindings = [],
  projectSlug,
  isAdmin,
  onPositionSaved,
}: FeasibilityMatrixProps) {
  // Local state for optimistic drag
  const [posX, setPosX] = useState<number>(finding.feasibilityX ?? 50);
  const [posY, setPosY] = useState<number>(finding.feasibilityY ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Latest dragged coordinates. React state updates are async, so reading
  // posX/posY in the pointer-up handler can save the previous position.
  // The ref always holds the newest values from the last pointer move.
  const latestPosRef = useRef({ x: finding.feasibilityX ?? 50, y: finding.feasibilityY ?? 50 });
  const isDraggingRef = useRef(false);

  useEffect(() => {
    // Never snap the card back while a drag is in progress, and never
    // overwrite the just-dropped position with the pre-save prop value.
    if (isDraggingRef.current) return;
    const x = finding.feasibilityX ?? 50;
    const y = finding.feasibilityY ?? 50;
    latestPosRef.current = { x, y };
    setPosX(x);
    setPosY(y);
  }, [finding.id, finding.feasibilityX, finding.feasibilityY]);

  // Compute quadrant from continuous coordinates
  const computeQuadrant = (x: number, y: number): {
    quadrant: FeasibilityQuadrant;
    title: string;
    impact: string;
    effort: string;
    color: string;
    bgBadge: string;
  } => {
    const isHighImpact = y >= 50;
    const isLowEffort = x >= 50; // High X = Low Effort / Easy

    if (isHighImpact && !isLowEffort) {
      return {
        quadrant: "BIG_BETS",
        title: "Big Bets",
        impact: "High Impact",
        effort: "High Effort",
        color: "text-amber-700",
        bgBadge: "bg-amber-100 border-amber-300 text-amber-800",
      };
    } else if (isHighImpact && isLowEffort) {
      return {
        quadrant: "QUICK_WINS",
        title: "Quick Wins",
        impact: "High Impact",
        effort: "Low Effort",
        color: "text-emerald-700",
        bgBadge: "bg-emerald-100 border-emerald-300 text-emerald-800",
      };
    } else if (!isHighImpact && !isLowEffort) {
      return {
        quadrant: "AVOID",
        title: "Avoid",
        impact: "Low Impact",
        effort: "High Effort",
        color: "text-rose-700",
        bgBadge: "bg-rose-100 border-rose-300 text-rose-800",
      };
    } else {
      return {
        quadrant: "FILL_INS",
        title: "Fill-ins",
        impact: "Low Impact",
        effort: "Low Effort",
        color: "text-blue-700",
        bgBadge: "bg-blue-100 border-blue-300 text-blue-800",
      };
    }
  };

  const currentInfo = computeQuadrant(posX, posY);
  // A finding with no stored position has not been placed in the
  // workshop yet. The card still shows at 50/50 as a neutral default so
  // it can be dragged, but it has no quadrant and no score until the
  // group drops it somewhere.
  const isPlaced = finding.feasibilityX != null && finding.feasibilityY != null;

  // Save coordinates to backend. On success the parent updates its own
  // state from the returned finding, so the card stays where it was
  // dropped. On failure the card stays at the dropped position too and
  // an error is shown — it must not silently snap back to the old spot.
  const saveCoordinates = async (finalX: number, finalY: number) => {
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/findings/${finding.id}/feasibility`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: finalX, y: finalY }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      setSaveSuccess(true);
      if (onPositionSaved && data.finding) {
        onPositionSaved(data.finding);
      }
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      console.error("Failed to save feasibility coordinates:", err);
      setSaveError(err?.message || "Failed to save position. Try dragging again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Pointer / Mouse drag handlers for smooth responsive interaction
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isAdmin) return;
    setSaveError(null);
    isDraggingRef.current = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    let newX = ((clientX - rect.left) / rect.width) * 100;
    // For Y: Top is 100 (High Impact), Bottom is 0 (Low Impact)
    let newY = 100 - ((clientY - rect.top) / rect.height) * 100;

    newX = Math.max(3, Math.min(97, newX));
    newY = Math.max(3, Math.min(97, newY));

    const rounded = { x: Number(newX.toFixed(1)), y: Number(newY.toFixed(1)) };
    latestPosRef.current = rounded;
    setPosX(rounded.x);
    setPosY(rounded.y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore capture release errors
    }
    // Save the latest dragged coordinates from the ref, not from state,
    // which may still hold the previous pointer-move value.
    saveCoordinates(latestPosRef.current.x, latestPosRef.current.y);
  };

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Assigned Quadrant:
          </span>
          {isPlaced ? (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs ${currentInfo.bgBadge}`}
            >
              <Sparkles className="h-3 w-3" />
              {currentInfo.title} ({currentInfo.impact}, {currentInfo.effort})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-amber-200 bg-amber-50 text-amber-800">
              Not yet placed — drag the card to the agreed position
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <div className="flex items-center gap-2 text-xs">
              {isSaving && (
                <span className="text-amber-600 font-medium animate-pulse">
                  Saving position...
                </span>
              )}
              {saveSuccess && (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              )}
              {saveError && (
                <span role="alert" className="inline-flex items-center gap-1 text-rose-600 font-medium">
                  <AlertCircle className="h-3.5 w-3.5" /> {saveError}
                </span>
              )}
              <span className="text-slate-400 font-mono">
                X: {posX.toFixed(0)}% | Y: {posY.toFixed(0)}%
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
              <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
              <span>Login as Admin to reposition Post-it</span>
            </div>
          )}
        </div>
      </div>

      {/* 2x2 Matrix Canvas */}
      <div className="relative">
        {/* Y-Axis Label (Impact) — hidden on phones, where it crowds
            the board's left edge. */}
        <div className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-bold uppercase tracking-widest text-slate-500 select-none hidden sm:block">
          Impact (Low → High)
        </div>

        {/* X-Axis Label (Effort) — short form on phones. */}
        <div className="text-center text-xs font-bold uppercase tracking-widest text-slate-500 select-none pb-1">
          <span className="sm:hidden">← Harder ———— Easier →</span>
          <span className="hidden sm:inline">← High Effort (Harder) —————— Low Effort (Easier) →</span>
        </div>

        <div
          ref={containerRef}
          className="relative h-[380px] w-full rounded-2xl border-2 border-slate-300 bg-white overflow-hidden shadow-inner select-none sm:h-[480px]"
        >
          {/* Quadrant Dividers */}
          <div className="absolute inset-x-0 top-1/2 h-0.5 border-t-2 border-dashed border-slate-300 pointer-events-none" />
          <div className="absolute inset-y-0 left-1/2 w-0.5 border-l-2 border-dashed border-slate-300 pointer-events-none" />

          {/* Quadrant 1: Top-Left - Big Bets */}
          <div className="absolute top-0 left-0 w-1/2 h-1/2 p-4 bg-amber-50/40 pointer-events-none flex flex-col justify-start">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800/80">
                Big Bets
              </span>
              <span className="hidden sm:inline text-xs font-medium text-amber-600 bg-amber-100/60 px-2 py-0.5 rounded-full">
                High Impact • High Effort
              </span>
            </div>
          </div>

          {/* Quadrant 2: Top-Right - Quick Wins */}
          <div className="absolute top-0 right-0 w-1/2 h-1/2 p-4 bg-emerald-50/40 pointer-events-none flex flex-col justify-start">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800/80">
                Quick Wins
              </span>
              <span className="hidden sm:inline text-[10px] font-medium text-emerald-600 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                High Impact • Low Effort
              </span>
            </div>
          </div>

          {/* Quadrant 3: Bottom-Left - Avoid */}
          <div className="absolute bottom-0 left-0 w-1/2 h-1/2 p-4 bg-rose-50/40 pointer-events-none flex flex-col justify-end">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800/80">
                Avoid
              </span>
              <span className="hidden sm:inline text-[10px] font-medium text-rose-600 bg-rose-100/60 px-2 py-0.5 rounded-full">
                Low Impact • High Effort
              </span>
            </div>
          </div>

          {/* Quadrant 4: Bottom-Right - Fill-ins */}
          <div className="absolute bottom-0 right-0 w-1/2 h-1/2 p-4 bg-blue-50/40 pointer-events-none flex flex-col justify-end">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800/80">
                Fill-ins
              </span>
              <span className="hidden sm:inline text-[10px] font-medium text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-full">
                Low Impact • Low Effort
              </span>
            </div>
          </div>

          {/* Ghost / Context Markers of Other Findings in the Project */}
          {allFindings
            .filter((f) => f.id !== finding.id && f.feasibilityX != null && f.feasibilityY != null)
            .map((other) => {
              const ox = other.feasibilityX ?? 50;
              const oy = other.feasibilityY ?? 50;
              return (
                <div
                  key={other.id}
                  style={{
                    left: `${ox}%`,
                    bottom: `${oy}%`,
                    transform: "translate(-50%, 50%)",
                  }}
                  title={`${other.title} (${other.feasibilityQuadrant || "Unassigned"})`}
                  className="absolute pointer-events-none z-10 flex items-center gap-1 opacity-45 hover:opacity-100 transition"
                >
                  <div className="h-4 w-4 rounded-full bg-slate-400 border-2 border-white shadow-xs" />
                  <span className="text-xs font-medium text-slate-600 bg-white/90 px-1.5 py-0.5 rounded shadow-xs max-w-[120px] truncate border border-slate-200">
                    {other.title}
                  </span>
                </div>
              );
            })}

          {/* Active Finding Post-It Note */}
          <div
            style={{
              left: `${posX}%`,
              bottom: `${posY}%`,
              transform: "translate(-50%, 50%)",
              touchAction: "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`postit-note absolute z-30 w-40 sm:w-60 rounded-xl p-3.5 shadow-lg border transition-shadow cursor-default ${
              isAdmin ? "cursor-grab active:cursor-grabbing hover:shadow-xl" : ""
            } ${
              currentInfo.quadrant === "QUICK_WINS"
                ? "bg-gradient-to-br from-emerald-100 to-emerald-200 border-emerald-300 text-emerald-950"
                : currentInfo.quadrant === "BIG_BETS"
                ? "bg-gradient-to-br from-amber-100 to-amber-200 border-amber-300 text-amber-950"
                : currentInfo.quadrant === "AVOID"
                ? "bg-gradient-to-br from-rose-100 to-rose-200 border-rose-300 text-rose-950"
                : "bg-gradient-to-br from-blue-100 to-blue-200 border-blue-300 text-blue-950"
            }`}
          >
            {/* Post-it Header with Pin */}
            <div className="flex items-center justify-between pb-1.5 border-b border-black/10">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-xs border border-white" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-black/70">
                  {isPlaced ? currentInfo.title : "Unplaced"}
                </span>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-black/60 bg-white/50 px-1.5 py-0.5 rounded">
                  <Move className="h-2.5 w-2.5" />
                  <span>Drag me</span>
                </div>
              )}
            </div>

            {/* Post-it Title */}
            <p className="mt-2 text-xs font-semibold leading-snug line-clamp-2">
              {finding.title}
            </p>

            {/* Coordinates Footer */}
            <div className="mt-2 pt-1.5 border-t border-black/10 flex items-center justify-between text-[10px] text-black/60 font-mono">
              <span>Imp: {posY.toFixed(0)}%</span>
              <span>Eff: {(100 - posX).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Quick Wins (High Impact, Low Effort)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Big Bets (High Impact, High Effort)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span>Fill-ins (Low Impact, Low Effort)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>Avoid (Low Impact, High Effort)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
