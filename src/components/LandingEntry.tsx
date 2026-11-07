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
 * Aleph keynote language: pure black, white Playfair serif, muted grey
 * description, one outlined action, and a giant teal-to-blue gradient
 * "DVF" bleeding off the bottom edge, like the keynote's "Agenda" slide.
 * The footer sits above the giant word so the two never collide.
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
      className="flex flex-1 flex-col bg-black text-white overflow-hidden"
    >
      {/* Top block: number, title, description, action */}
      <div className="px-5 pt-10 sm:px-10 sm:pt-14 lg:px-16">
        <div className="flex items-baseline gap-4">
          <span className="text-sm text-white/50">01</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/50">
            Phase DVF
          </span>
        </div>

        <h1 className="mt-6 font-display text-4xl leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
          <span className="block text-white">Welcome to</span>
          <span className="block italic text-aleph-gradient pr-2">
            Bewize Workshop
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-400 sm:text-lg">
          Experience the digital collaborative platform to help shaping the
          roadmap
        </p>

        <button
          onClick={() => setOpen(true)}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/60 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-auto"
        >
          Select Platform
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Bottom block: credit line, then the giant word */}
      <div className="mt-auto">
        <div className="flex items-center justify-between px-5 pb-4 pt-12 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40 sm:px-10 lg:px-16">
          <span>Bank BSI &times; Aleph</span>
          <span className="hidden sm:inline">Bewize Workshop — Phase DVF</span>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none select-none overflow-hidden"
        >
          <div className="text-aleph-gradient text-center font-display text-[clamp(160px,36vw,560px)] font-semibold leading-[0.72] tracking-tight -mb-[0.09em]">
            DVF
          </div>
        </div>
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
