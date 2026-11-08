import { redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { TAB_BY_SLUG } from "@/lib/admin-nav";

// Each dashboard menu has its own URL, e.g. /dashboard/user for
// Users & Roles and /dashboard/findings for Findings & Tags. The
// dashboard component stays mounted across tab navigations, so the
// data loaded once on mount is not refetched when switching tabs.
export default function DashboardTabPage({ params }: { params: { tab: string } }) {
  const tab = TAB_BY_SLUG[params.tab];
  if (!tab) redirect("/dashboard/findings");
  return <AdminDashboard initialTab={tab} />;
}
