import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdminOrFacilitator } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/**
 * Assign a finding to groups (admin + facilitator only, set in the
 * dashboard — not on the front-facing viewer).
 * PUT /api/projects/[slug]/findings/[id]/groups
 * Body: { groupIds: string[] } — replaces the finding's assignment.
 * A finding can be assigned to groups in its own project or in the
 * other project; assignment is always to a group, never directly to a
 * project. Unknown group ids are dropped. An empty list unassigns the
 * finding from every group (it stays visible in the global findings).
 * The finding itself is loaded by id (not scoped to the slug's
 * project), so a pool finding or a finding from the other project can
 * be assigned from any project's dashboard.
 */
export async function PUT(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    const forbidden = requireAdminOrFacilitator(session);
    if (forbidden) return forbidden;

    const { id: findingId } = params;
    const body = await request.json().catch(() => ({}));
    const groupIds = Array.isArray(body.groupIds) ? body.groupIds : null;
    if (groupIds === null) {
      return NextResponse.json({ error: "groupIds must be an array" }, { status: 400 });
    }

    const finding = await dbService.getFindingById(findingId);
    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }

    const saved = await dbService.setFindingGroups(findingId, groupIds);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, findingId, groupIds: saved });
  } catch (error) {
    console.error("Error assigning finding to groups:", error);
    return NextResponse.json({ error: "Failed to assign finding to groups" }, { status: 500 });
  }
}

/**
 * Read a finding's group assignment.
 * GET /api/projects/[slug]/findings/[id]/groups
 */
export async function GET(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const finding = await dbService.getFindingById(params.id);
    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }
    const groupIds = await dbService.getFindingGroupIds(params.id);
    return NextResponse.json({ success: true, findingId: params.id, groupIds });
  } catch (error) {
    console.error("Error reading finding groups:", error);
    return NextResponse.json({ error: "Failed to read finding groups" }, { status: 500 });
  }
}
