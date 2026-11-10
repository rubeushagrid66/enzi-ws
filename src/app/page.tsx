import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import AutoRefreshOnFocus from "@/components/AutoRefreshOnFocus";
import LandingEntry, { PlatformEntry } from "@/components/LandingEntry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  // A project user (CMS / DVC) goes straight to their project page —
  // no manual navigation through the platform picker, on login or on
  // a returning visit. ADMIN / FACILITATOR have no single project, so
  // they stay on the homepage where the picker chooses one. The slug
  // comes from the session token; if an older token lacks it, resolve
  // it from the session's project id instead.
  const session = await getSession();
  let projectSlug = session?.projectSlug ?? null;
  if (!projectSlug && session?.projectId) {
    const proj = await dbService.getProjectById(session.projectId).catch(() => null);
    projectSlug = proj?.slug ?? null;
  }
  if (projectSlug) {
    redirect(`/${projectSlug}`);
  }

  const projects = await dbService.getProjects();

  // Plain, serializable entries for the client-side popup — the raw
  // project rows may carry Date fields that cannot cross the
  // server/client boundary.
  const entries: PlatformEntry[] = projects.map((project: any) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    groups: project._count?.groups ?? 0,
  }));

  return (
    <div className="font-poppins min-h-screen bg-black flex flex-col">
      <AutoRefreshOnFocus />
      <Navbar dark />
      <LandingEntry projects={entries} />
    </div>
  );
}
