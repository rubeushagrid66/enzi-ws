import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { name, roleTitle, groupId } = await request.json();
    if (!name) return NextResponse.json({ error: "Participant name is required" }, { status: 400 });
    const participant = await dbService.updateParticipant(params.id, { name, roleTitle, groupId });
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
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbService.deleteParticipant(params.id);
    return NextResponse.json({ success: true, message: "Participant deleted" });
  } catch (error) {
    console.error("Error deleting participant:", error);
    return NextResponse.json({ error: "Failed to delete participant" }, { status: 500 });
  }
}
