import { redirect } from "next/navigation";
import { TAB_BY_SLUG } from "@/lib/admin-nav";

// Each dashboard menu has its own URL, e.g. /dashboard/user for
// Users & Roles and /dashboard/findings for Findings & Tags. This page
// renders nothing itself — the dashboard shell lives in the (main)
// layout and reads the tab from the URL, so switching menus swaps the
// content instantly with no reload and no data refetch. This page only
// validates the slug (unknown slugs redirect to Findings).
export default function DashboardTabPage({ params }: { params: { tab: string } }) {
  if (!TAB_BY_SLUG[params.tab]) redirect("/dashboard/findings");
  return null;
}
