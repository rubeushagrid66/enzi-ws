import { redirect } from "next/navigation";

/** Legacy URL: the dashboard moved to /dashboard. */
export default function AdminRedirect() {
  redirect("/dashboard");
}
