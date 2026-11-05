"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogIn, LogOut, Shield, LayoutGrid, ExternalLink } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function Navbar({
  projectSlug,
  projectName,
}: {
  projectSlug?: string;
  projectName?: string;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-lg shadow-sm group-hover:bg-emerald-700 transition">
              E
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight text-lg">
                Enzi
              </span>
              <span className="ml-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Workshop DVF
              </span>
            </div>
          </Link>

          {projectName && projectSlug && (
            <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-200">
              <span className="text-xs text-slate-400 font-medium">Project:</span>
              <span className="text-sm font-semibold text-slate-800">
                {projectName}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                /{projectSlug}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {projectSlug && (
            <Link
              href={`/${projectSlug}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-slate-500" />
              <span>Result Viewer</span>
            </Link>
          )}

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-xs"
          >
            <Shield className="h-3.5 w-3.5 text-emerald-600" />
            <span>Admin Dashboard</span>
          </Link>

          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-800">
                  {user.name}
                </div>
                <div className="text-[10px] text-emerald-600 font-mono">
                  {user.role}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Log Out"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Admin Login</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
