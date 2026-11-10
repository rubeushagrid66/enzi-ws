import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

export async function PUT(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;
    const { name, label } = await request.json();
    if (!name) return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    const group = await dbService.updateGroup(params.id, name, label);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, group });
  } catch (error) {
    console.error("Error updating group:", error);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;
    await dbService.deleteGroup(params.id);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, message: "Group deleted" });
  } catch (error) {
    console.error("Error deleting group:", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
