"use client";

import Link from "next/link";
import { X, Plus, ExternalLink, FolderGit2, Layers, Users2, Sliders, Tag, Shield, ListChecks } from "lucide-react";
import { ADMIN_NAV, type AdminTab } from "@/lib/admin-nav";

// Icons live here (client-side); the nav data (id/label/href/badge)
// lives in @/lib/admin-nav so the server-side [tab] page can use it too.
const NAV_ICONS: Record<AdminTab, React.ComponentType<{ className?: string }>> = {
  findings: Tag,
  weights: Sliders,
  groups: Users2,
  parameters: Layers,
  aspects: ListChecks,
  projects: FolderGit2,
  users: Shield,
};

export default function AdminSidebar({
  activeTab,
  projects,
  selectedProjectSlug,
  onSelectProject,
  onNewProject,
  activeProject,
  counts,
  isAdmin,
  open,
  onClose,
}: {
  activeTab: AdminTab;
  projects: any[];
  selectedProjectSlug: string;
  onSelectProject: (slug: string) => void;
  onNewProject: () => void;
  activeProject: any;
  counts: Record<string, number | undefined>;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const items = ADMIN_NAV.filter((i) => i.id !== "users" || isAdmin);

  const content = (
    <div className="flex h-full flex-col">
      {/* Project switcher */}
      <div className="border-b border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="admin-project-switcher" className="field-label mb-0">
            Active project
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <select
          id="admin-project-switcher"
          value={selectedProjectSlug}
          onChange={(e) => onSelectProject(e.target.value)}
          className="input w-full text-sm font-semibold"
        >
          {projects.map((p: any) => (
            <option key={p.id} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        {activeProject && (
          <p className="mt-2 truncate text-xs text-slate-500" title={activeProject.description || ""}>
            {activeProject.description || "No description"}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {isAdmin && (
            <button type="button" onClick={onNewProject} className="btn-secondary btn-sm w-full">
              <Plus className="h-4 w-4" /> New Project
            </button>
          )}
          {selectedProjectSlug && (
            <a
              href={`/${selectedProjectSlug}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm w-full justify-center"
            >
              <ExternalLink className="h-4 w-4" /> Open Landing Page
            </a>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav aria-label="Admin" className="flex-1 overflow-y-auto p-3">
        <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          Configuration
        </p>
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const active = activeTab === item.id;
            const count = counts[item.id];
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    active
                      ? "bg-emerald-50 font-semibold text-emerald-800"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-emerald-700" : "text-slate-400"}`} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-800" : "bg-emerald-50 text-emerald-700"}`}>
                      {item.badge}
                    </span>
                  )}
                  {count !== undefined && (
                    <span className={`text-xs font-mono font-medium ${active ? "text-emerald-700" : "text-slate-400"}`}>
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
        <span className="block truncate">Project: {activeProject?.name || "—"}</span>
        <span className="block truncate font-mono">/{selectedProjectSlug || "—"}</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[328px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {content}
      </aside>

      {/* Mobile: off-canvas drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-[336px] max-w-[85vw] bg-white shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
