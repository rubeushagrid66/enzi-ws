"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";

export interface PlatformEntry {
  id: string;
  name: string;
  slug: string;
  findings: number;
  groups: number;
}

/**
 * Exhibition entry for the Bewize Workshop — Phase DVF.
 * Option 1, exactly: pure centered Aleph keynote title slide — pure
 * black, white Playfair serif, "Bewize Workshop" in the teal-to-blue
 * gradient italic, muted grey description, one outlined action, and the
 * credit footer. No giant word, no "01" / "Phase DVF" labels.
 */
export default function LandingEntry({
  projects,
}: {
  projects: PlatformEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close on Escape and lock the page scroll while the popup is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open ]);

  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col bg-black text-white"
    >
      {/* Centered hero — option 1 exactly */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center sm:px-10">
        <h1 className="font-display text-5xl leading-[1.08] tracking-tight sm:text-7xl lg:text-8xl">
          <span className="block text-white">Welcome to</span>
          <span className="block italic text-aleph-gradient pr-2">
            Bewize Workshop
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-400 sm:text-lg">
          Experience the digital collaborative platform to help shaping the
          roadmap
        </p>

        <button
          onClick={() => setOpen(true)}
          className="mt-9 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/60 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-auto"
        >
          Select Platform
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Credit footer */}
      <div className="flex items-center justify-between px-5 pb-6 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40 sm:px-10 lg:px-16">
        <span>Bank BSI &times; Aleph</span>
        <span>&copy; Enzi 2026</span>
      </div>

      {/* Select Platform popup */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select Platform"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-[#018788]/40 bg-[#0b0f0f] p-6 shadow-2xl sm:p-8">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close dialog"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="font-display text-2xl font-semibold text-white">
              Select Platform
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Choose a platform to open its workshop page.
            </p>

            <div className="mt-6 space-y-3">
              {projects.map((project, i) => (
                <button
                  key={project.id}
                  onClick={() => router.push(`/${project.slug}`)}
                  className="group flex w-full items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:border-[#018788] hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span className="text-aleph-gradient font-display text-3xl font-semibold leading-none">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-medium text-white">
                      {project.name}
                    </span>
                    <span className="mt-0.5 block text-xs uppercase tracking-[0.14em] text-neutral-400">
                      {project.findings} findings &middot; {project.groups}{" "}
                      groups
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>

            {projects.length === 0 && (
              <p className="mt-6 text-sm text-neutral-400">
                No platforms yet. Create one in the dashboard to get started.
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
