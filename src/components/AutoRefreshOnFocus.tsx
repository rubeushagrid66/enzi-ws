"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current server-rendered page when the tab comes back
 * into view, so changes made in the admin dashboard (in this tab or
 * another one) show up without a manual reload.
 *
 * Next.js also caches client-side navigation for a short while, so a
 * plain link back to this page can show stale data — refreshing on
 * focus fixes that too.
 *
 * Throttled to at most once per 30s: without this, every alt-tab back
 * re-ran the whole page load, so many people switching tabs at once
 * hammered the database for no new data.
 */
export default function AutoRefreshOnFocus() {
  const router = useRouter();
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshRef.current < 30_000) return;
      lastRefreshRef.current = now;
      router.refresh();
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
