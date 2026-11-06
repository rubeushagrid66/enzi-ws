import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/**
 * Global L1–L3 parameter tree — one tree for the whole platform.
 * GET returns the global tree when it exists; otherwise the B2B
 * project's tree as a read-only preview (source: project:...), so the
 * admin can see what will become global once the SQL is run.
 */
export async function GET() {
  try {
    const global = await dbService.getGlobalParameters();
    if (global.length > 0) {
      return NextResponse.json({ parameters: global, source: "global" });
    }
    const projects = await dbService.getProjects();
    const fallback =
      projects.find((p: any) => p.slug === "cash-management-system") || projects[0];
    if (fallback) {
      const project = await dbService.getProjectBySlug(fallback.slug);
      return NextResponse.json({
        parameters: project?.parametersL1 || [],
        source: `project:${fallback.slug}`,
        note: "Global setup is not enabled yet — run docs/global-setup-sql.md in the Supabase SQL editor to make this tree global.",
      });
    }
    return NextResponse.json({ parameters: [], source: "none" });
  } catch (error) {
    console.error("Error fetching global parameters:", error);
    return NextResponse.json({ error: "Failed to fetch parameters" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { level, name, parentId, scoringRules } = body;

    if (level === "L1") {
      if (!name) return NextResponse.json({ error: "L1 Name is required" }, { status: 400 });
      // Global L1: projectId null (needs docs/global-setup-sql.md).
      const item = await dbService.createParameterL1(null, name, scoringRules);
      revalidateProjectPages();
      return NextResponse.json({ success: true, item });
    } else if (level === "L2") {
      if (!name || !parentId) {
        return NextResponse.json({ error: "Name and parent L1 id required" }, { status: 400 });
      }
      const item = await dbService.createParameterL2(parentId, name);
      revalidateProjectPages();
      return NextResponse.json({ success: true, item });
    } else if (level === "L3") {
      if (!name || !parentId) {
        return NextResponse.json({ error: "Name and parent L2 id required" }, { status: 400 });
      }
      const item = await dbService.createParameterL3(parentId, name);
      revalidateProjectPages();
      return NextResponse.json({ success: true, item });
    }

    return NextResponse.json({ error: "Invalid level (must be L1, L2, or L3)" }, { status: 400 });
  } catch (error: any) {
    console.error("Error creating global parameter:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create parameter" },
      { status: 500 }
    );
  }
}
