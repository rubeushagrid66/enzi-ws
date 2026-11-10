"use client";

import Link from "next/link";
import { X, ExternalLink, FolderGit2, Users2, Sliders, Tag, Shield, ListChecks, LogOut, Lightbulb, Layers } from "lucide-react";
import { ADMIN_NAV, type AdminTab } from "@/lib/admin-nav";

// Icons live here (client-side); the nav data (id/label/href/badge/group)
// lives in @/lib/admin-nav so the server-side [tab] page can use it too.
const NAV_ICONS: Record<AdminTab, React.ComponentType<{ className?: string }>> = {
  findings: Tag,
  ideas: Lightbulb,
  categories: Layers,
  weights: Sliders,
  groups: Users2,
  aspects: ListChecks,
  projects: FolderGit2,
  users: Shield,
};

// Initials for the user-card avatar, e.g. "Tech DVC 1" -> "TD".
function initials(name?: string) {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const second = parts[1]?.[0] || "";
  return (first + second).toUpperCase();
}

export default function AdminSidebar({
  activeTab,
  projects,
  selectedProjectSlug,
  onSelectProject,
  activeProject,
  projectLoading,
  counts,
  isAdmin,
  open,
  onClose,
  currentUser,
  onLogout,
}: {
  activeTab: AdminTab;
  projects: any[];
  selectedProjectSlug: string;
  onSelectProject: (slug: string) => void;
  activeProject: any;
  projectLoading: boolean;
  counts: Record<string, number | undefined>;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
  currentUser: any;
  onLogout: () => void;
}) {
  // Label-role users (Tech / Product / Business & Ops) see a reduced
  // dashboard: only Groups & Participants and Viability Aspects,
  // view-only, and only their assigned project (no switcher).
  const isLabelUser = ["Tech", "Product", "Business & Ops"].includes(currentUser?.role ?? "");
  const items = ADMIN_NAV.filter((i) => {
    if (i.id === "users") return isAdmin;
    if (i.id === "categories") return isAdmin;
    if (isLabelUser) return i.id === "groups" || i.id === "aspects";
    return true;
  });
  const groups: Array<{ label: string; items: typeof ADMIN_NAV }> = [
    { label: "Workshop", items: items.filter((i) => i.group === "Workshop") },
    { label: "Manage", items: items.filter((i) => i.group === "Manage") },
  ];

  const content = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Link href="/" onClick={onClose} className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bsi-600 text-base font-bold text-white shadow-sm">
            B
          </span>
          <span className="truncate text-[15px] font-bold tracking-tight text-slate-900">
            Bewize Workshop
          </span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Project switcher — hidden for label-role users: they only
          ever see their assigned project, so there is nothing to
          switch between. (The dashboard forces their active project
          to the assigned one.) */}
      {!isLabelUser && (
      <div className="px-4 pb-4">
        <label htmlFor="admin-project-switcher" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Active project
        </label>
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
        {selectedProjectSlug && (
          <a
            href={`/${selectedProjectSlug}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View workshop
          </a>
        )}
      </div>
      )}

      {/* Nav */}
      <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.label}>
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {g.label}
                </p>
                <ul className="space-y-0.5">
                  {g.items.map((item) => {
                    const Icon = NAV_ICONS[item.id];
                    const active = activeTab === item.id;
                    const count = counts[item.id];
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bsi-500 ${
                            active
                              ? "bg-bsi-50 font-semibold text-bsi-800"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${active ? "text-bsi-700" : "text-slate-400"}`} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${active ? "bg-bsi-100 text-bsi-800" : "bg-slate-100 text-slate-500"}`}>
                              {item.badge}
                            </span>
                          )}
                          {(count !== undefined || (projectLoading && (item.id === "groups" || item.id === "aspects"))) && (
                            <span className={`text-xs font-medium tabular-nums ${active ? "text-bsi-700" : "text-slate-400"}`}>
                              {count !== undefined ? count : "…"}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
        )}
      </nav>

      {/* Logged-in user */}
      {currentUser && (
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
              {initials(currentUser.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{currentUser.name}</span>
              <span className="block truncate text-xs text-slate-500">{currentUser.role}</span>
            </span>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              title="Sign out"
              className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
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
          <aside className="absolute inset-y-0 left-0 w-[320px] max-w-[85vw] bg-white shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
