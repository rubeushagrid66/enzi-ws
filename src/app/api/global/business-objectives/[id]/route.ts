import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/** Rename a business objective (admin only). Findings that selected it
 *  keep the id, so the new name shows everywhere automatically. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const objective = await dbService.updateBusinessObjective(params.id, name);
    revalidateProjectPages();
    return NextResponse.json({ success: true, objective });
  } catch (error) {
    console.error("Failed to update business objective:", error);
    return NextResponse.json({ error: "Failed to update business objective" }, { status: 500 });
  }
}

/** Delete a business objective (admin only). Findings that selected it
 *  keep the stale id in tujuan_bisnis_ids; it resolves to nothing, so
 *  the pill simply stops rendering. */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;
    await dbService.deleteBusinessObjective(params.id);
    revalidateProjectPages();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete business objective:", error);
    return NextResponse.json({ error: "Failed to delete business objective" }, { status: 500 });
  }
}
