import { redirect } from "next/navigation";

// /dashboard has no content of its own — each menu has its own URL.
export default function DashboardIndexPage() {
  redirect("/dashboard/findings");
}
