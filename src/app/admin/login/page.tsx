import { redirect } from "next/navigation";

/** Legacy URL: the login page moved to /dashboard/login. */
export default function AdminLoginRedirect() {
  redirect("/dashboard/login");
}
