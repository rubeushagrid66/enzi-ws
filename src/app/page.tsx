import { dbService } from "@/lib/db-service";
import Navbar from "@/components/Navbar";
import AutoRefreshOnFocus from "@/components/AutoRefreshOnFocus";
import LandingEntry, { PlatformEntry } from "@/components/LandingEntry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
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
    <div className="min-h-screen bg-black flex flex-col">
      <AutoRefreshOnFocus />
      <Navbar dark />
      <LandingEntry projects={entries} />
    </div>
  );
}
