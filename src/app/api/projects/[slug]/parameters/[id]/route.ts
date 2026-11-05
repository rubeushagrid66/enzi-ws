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
    const { level, name } = await request.json();
    if (!name || !["L1", "L2", "L3"].includes(level)) {
      return NextResponse.json({ error: "Name and a valid level (L1, L2 or L3) are required" }, { status: 400 });
    }
    const item =
      level === "L1" ? await dbService.updateParameterL1(params.id, name)
      : level === "L2" ? await dbService.updateParameterL2(params.id, name)
      : await dbService.updateParameterL3(params.id, name);
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("Error updating parameter:", error);
    return NextResponse.json({ error: "Failed to update parameter" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const level = new URL(request.url).searchParams.get("level");
    if (!["L1", "L2", "L3"].includes(level || "")) {
      return NextResponse.json({ error: "A valid level query param (L1, L2 or L3) is required" }, { status: 400 });
    }
    if (level === "L1") await dbService.deleteParameterL1(params.id);
    else if (level === "L2") await dbService.deleteParameterL2(params.id);
    else await dbService.deleteParameterL3(params.id);
    return NextResponse.json({ success: true, message: "Parameter deleted" });
  } catch (error) {
    console.error("Error deleting parameter:", error);
    return NextResponse.json({ error: "Failed to delete parameter" }, { status: 500 });
  }
}
