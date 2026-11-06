import { NextResponse } from "next/server";
import { dbService, NotFoundError } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/**
 * Copy a finding INTO this project (usually from the global pool).
 * Only the listing is copied — title, description, tags. Votes, L3
 * mappings and matrix position are not copied; the copy starts
 * Unscored and is scored independently in this project's workshop.
 */
export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    if (!body.findingId) {
      return NextResponse.json({ error: "findingId is required" }, { status: 400 });
    }
    const projectId = await dbService.getProjectIdBySlug(params.slug);
    if (!projectId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const finding = await dbService.copyFinding(body.findingId, projectId);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, finding });
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }
    console.error("Error copying finding into project:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to copy finding into project" },
      { status: 500 }
    );
  }
}
