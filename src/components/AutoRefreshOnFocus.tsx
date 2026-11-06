"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current server-rendered page when the tab comes back
 * into view, so changes made in the admin dashboard (in this tab or
 * another one) show up without a manual reload.
 *
 * Next.js also caches client-side navigation for a short while, so a
 * plain link back to this page can show stale data — refreshing on
 * focus fixes that too.
 */
export default function AutoRefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
