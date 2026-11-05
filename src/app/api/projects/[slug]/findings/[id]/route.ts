import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { title, description, sumber, fitur, platform } = body;

    const finding = await dbService.updateFinding(id, {
      title,
      description,
      sumber,
      fitur,
      platform,
    });

    return NextResponse.json({ success: true, finding });
  } catch (error) {
    console.error("Error updating finding:", error);
    return NextResponse.json({ error: "Failed to update finding" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbService.deleteFinding(params.id);
    return NextResponse.json({ success: true, message: "Finding deleted" });
  } catch (error) {
    console.error("Error deleting finding:", error);
    return NextResponse.json({ error: "Failed to delete finding" }, { status: 500 });
  }
}
