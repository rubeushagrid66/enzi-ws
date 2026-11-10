"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import FindingDetailView from "@/components/FindingDetailView";
import { useMeParticipantId } from "@/lib/useMeParticipant";
import { slugify } from "@/lib/slugify";
import ProjectResultViewer from "../../page";

export default function FindingDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const { slug, id } = params;
  const [project, setProject] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjectData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`/api/projects/${slug}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Project not found");
      }
      const data = await res.json();
      let proj = data.project;
      // Cross-project finding: when this finding is not in the slug's
      // project (it belongs to the other project but is assigned to one
      // of this project's groups), load it with D/V/F computed in this
      // project's context, so it opens and scores here like a local one.
      if (proj && !(proj.findings || []).some((f: any) => f.id === id)) {
        const fRes = await fetch(`/api/projects/${slug}/findings/${id}`, { cache: "no-store" });
        if (fRes.ok) {
          const fData = await fRes.json();
          if (fData.finding) {
            proj = { ...proj, findings: [...(proj.findings || []), fData.finding] };
          }
        }
      }
      setProject(proj);

      const userRes = await fetch("/api/auth/me");
      if (userRes.ok) {
        const userData = await userRes.json();
        setCurrentUser(userData.user);
      }
    } catch (err: any) {
      if (!silent) setError(err.message || "Failed to load finding");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadProjectData();
  }, [slug]);

  // Auto-refresh when the tab comes back into view, like the viewer.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") loadProjectData(true);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [slug]);

  const isAdmin =
    currentUser?.role === "ADMIN" || currentUser?.role === "FACILITATOR";
  // "Me": the score cards show this participant's own V/F (1–3).
  const meId = useMeParticipantId(project?.slug, currentUser);
  const finding =
    project?.findings?.find((f: any) => f.id === id) ?? null;
  // Title-slug popup URL (/{slug}/ideas/{idea-title}): the segment is
  // a slugified title, not an idea id. Render the project page
  // instead — it reads the URL and opens that idea's popup. An actual
  // id always wins, so the scoring detail page keeps working for
  // UUIDs and short ids alike.
  const isTitleSlug =
    !finding &&
    !!project?.findings?.some((f: any) => slugify(f.title || "") === id);
  if (isTitleSlug) {
    return <ProjectResultViewer params={{ slug }} />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-bsi-600 border-t-transparent" />
              <p className="text-sm font-semibold text-slate-600">
                Loading finding...
              </p>
            </div>
          </div>
        ) : error || !project || !finding ? (
          <div className="max-w-md w-full mx-auto p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
            <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center font-bold text-xl">
              !
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              Finding Not Found
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This finding does not exist in this project or has been removed.
            </p>
            <Link
              href={`/${slug}`}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-bsi-600 text-white hover:bg-bsi-700 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to {project?.name || "project"}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <Link
              href={`/${slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-bsi-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bsi-500 rounded-lg px-1 py-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to {project.name}
            </Link>

            <FindingDetailView
              finding={finding}
              allFindings={project.findings || []}
              project={project}
              isAdmin={isAdmin}
              currentUser={currentUser}
              meId={meId}
            />
          </div>
        )}
      </main>
    </div>
  );
}
