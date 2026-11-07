"use client";

import { useState, useEffect } from "react";

/**
 * The viewer's own participant id in a project ("Me"), resolved via the
 * existing POST /participants/me endpoint (find-or-create). Returns null
 * when logged out or when the lookup fails — callers then show the
 * read-only state (no per-participant V/F). The matrix resolves the
 * same id internally for its group chips; this hook is for pages that
 * need "me" outside the matrix (finding cards, detail score cards).
 */
export function useMeParticipantId(
  projectSlug: string | undefined,
  currentUser: { id?: string } | null | undefined
): string | null {
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUser || !projectSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectSlug}/participants/me`,
          { method: "POST" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.participant?.id) setMeId(data.participant.id);
      } catch {
        // Read-only if the lookup fails — never crash the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectSlug, currentUser?.id]);
  return meId;
}
