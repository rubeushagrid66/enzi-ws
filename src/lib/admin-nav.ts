// Dashboard nav config — a plain module (no "use client") so both the
// client sidebar and the server-side [tab] page can import it. Each
// dashboard menu has its own URL, e.g. /dashboard/user for Users & Roles
// and /dashboard/findings for Findings & Tags.

export type AdminTab =
  | "projects"
  | "findings"
  | "weights"
  | "groups"
  | "aspects"
  | "users";

export interface AdminNavItem {
  id: AdminTab;
  label: string;
  /** The dashboard URL for this menu, e.g. /dashboard/findings. */
  href: string;
  badge?: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
  // "Global" = shared across all projects (findings pool, one D/V/F
  // weighting, one user list). Groups, aspects and the projects
  // themselves stay per-project. The L1–L3 parameter tree was removed
  // 2026-11-09: nothing read it — D/V/F use mention counts + basis N.
  { id: "findings", label: "Findings & Tags", href: "/dashboard/findings", badge: "Global" },
  { id: "weights", label: "Framework & Weighting", href: "/dashboard/framework", badge: "Global" },
  { id: "groups", label: "Groups & Participants", href: "/dashboard/groups" },
  { id: "aspects", label: "Viability Aspects", href: "/dashboard/aspects" },
  { id: "projects", label: "All Projects", href: "/dashboard/projects" },
  { id: "users", label: "Users & Roles", href: "/dashboard/user", badge: "Global" },
];

/** URL slug (the part after /dashboard/) → the tab it opens. */
export const TAB_BY_SLUG: Record<string, AdminTab> = Object.fromEntries(
  ADMIN_NAV.map((item) => [item.href.replace("/dashboard/", ""), item.id])
) as Record<string, AdminTab>;
