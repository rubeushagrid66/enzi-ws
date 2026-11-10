import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/** Rename a finding category (admin only). */
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
    const category = await dbService.updateFindingCategory(params.id, name);
    revalidateProjectPages();
    return NextResponse.json({ success: true, category });
  } catch (error) {
    console.error("Failed to update finding category:", error);
    return NextResponse.json({ error: "Failed to update finding category" }, { status: 500 });
  }
}

/** Delete a finding category (admin only). Findings in it keep
 *  existing — their category link is cleared (ON DELETE SET NULL). */
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
    await dbService.deleteFindingCategory(params.id);
    revalidateProjectPages();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete finding category:", error);
    return NextResponse.json({ error: "Failed to delete finding category" }, { status: 500 });
  }
}
