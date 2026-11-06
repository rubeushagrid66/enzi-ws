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
    const { name, roleTitle, groupId } = await request.json();
    if (!name) return NextResponse.json({ error: "Participant name is required" }, { status: 400 });
    const participant = await dbService.updateParticipant(params.id, { name, roleTitle, groupId });
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, participant });
  } catch (error) {
    console.error("Error updating participant:", error);
    return NextResponse.json({ error: "Failed to update participant" }, { status: 500 });
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
    await dbService.deleteParticipant(params.id);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, message: "Participant deleted" });
  } catch (error) {
    console.error("Error deleting participant:", error);
    return NextResponse.json({ error: "Failed to delete participant" }, { status: 500 });
  }
}
