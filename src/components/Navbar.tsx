"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, LogOut, LayoutDashboard } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function Navbar({
  projectSlug,
  projectName,
  dark = false,
}: {
  projectSlug?: string;
  projectName?: string;
  dark?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    // Smooth sign-out: go home and refresh server state instead of a
    // full page reload.
    router.push("/");
    router.refresh();
  };

  return (
    <header
      className={
        dark
          ? "sticky top-0 z-50 border-b border-white/10 bg-black"
          : "sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md"
      }
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-aleph-gradient text-lg font-bold text-white shadow-sm">
              B
            </div>
            <div>
              <span
                className={`text-lg font-semibold tracking-tight ${
                  dark ? "text-white" : "text-slate-900"
                }`}
              >
                Bewize Workshop
              </span>
            </div>
          </Link>

          {projectName && projectSlug && (
            <div
              className={`hidden md:flex items-center gap-2 pl-4 border-l ${
                dark ? "border-white/10" : "border-slate-200"
              }`}
            >
              <span
                className={`text-xs font-medium ${
                  dark ? "text-white/50" : "text-slate-500"
                }`}
              >
                Project:
              </span>
              <span
                className={`text-sm font-semibold ${
                  dark ? "text-white" : "text-slate-800"
                }`}
              >
                {projectName}
              </span>
              <span
                className={`text-xs font-mono ${
                  dark ? "text-white/40" : "text-slate-500"
                }`}
              >
                /{projectSlug}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  dark
                    ? "border-white/25 bg-transparent text-white hover:bg-white/10"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <LayoutDashboard
                  className={`h-4 w-4 ${dark ? "text-teal-300" : "text-emerald-600"}`}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <div
                className={`flex items-center gap-2 pl-2 border-l ${
                  dark ? "border-white/10" : "border-slate-200"
                }`}
              >
                <div className="text-right hidden sm:block">
                  <div
                    className={`text-xs font-semibold ${
                      dark ? "text-white" : "text-slate-800"
                    }`}
                  >
                    {user.name}
                  </div>
                  <div
                    className={`text-xs font-mono ${
                      dark ? "text-teal-300" : "text-emerald-600"
                    }`}
                  >
                    {user.role}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  aria-label="Log out"
                  className={`rounded-lg p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    dark
                      ? "text-white/60 hover:bg-white/10 hover:text-white"
                      : "text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  }`}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <Link
              href="/dashboard/login"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                dark
                  ? "bg-white text-black hover:bg-neutral-200"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>Login</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
