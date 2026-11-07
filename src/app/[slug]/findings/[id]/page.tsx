"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import FindingDetailView from "@/components/FindingDetailView";

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
      setProject(data.project);

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
  const finding =
    project?.findings?.find((f: any) => f.id === id) ?? null;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar projectSlug={project?.slug} projectName={project?.name} />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
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
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to {project?.name || "project"}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <Link
              href={`/${slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-emerald-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg px-1 py-1"
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
            />
          </div>
        )}
      </main>
    </div>
  );
}
