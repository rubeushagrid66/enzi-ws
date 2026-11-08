"use client";

import AdminDashboard from "@/components/AdminDashboard";

// The dashboard shell (data + sidebar + tab content) lives in this
// layout, so it stays mounted when switching between dashboard menus —
// the tab content swaps instantly with no reload and no data refetch.
// The login page is NOT in this route group, so it never gets this shell.
export default function DashboardMainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminDashboard />
      {children}
    </>
  );
}
