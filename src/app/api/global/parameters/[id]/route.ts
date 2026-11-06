import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/** Rename / delete a global parameter (L1/L2/L3). Same db-service
 *  calls as the per-project routes — only the scope differs. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;
    const body = await request.json();
    const { level, name } = body;
    if (!name || !["L1", "L2", "L3"].includes(level)) {
      return NextResponse.json({ error: "Name and a valid level (L1, L2 or L3) are required" }, { status: 400 });
    }
    const item =
      level === "L1"
        ? await dbService.updateParameterL1(params.id, name)
        : level === "L2"
          ? await dbService.updateParameterL2(params.id, name)
          : await dbService.updateParameterL3(params.id, name);
    revalidateProjectPages();
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("Failed to update global parameter:", error);
    return NextResponse.json({ error: "Failed to update parameter" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;
    const level = new URL(request.url).searchParams.get("level");
    if (level === "L1") await dbService.deleteParameterL1(params.id);
    else if (level === "L2") await dbService.deleteParameterL2(params.id);
    else if (level === "L3") await dbService.deleteParameterL3(params.id);
    else {
      return NextResponse.json({ error: "A valid level query param (L1, L2 or L3) is required" }, { status: 400 });
    }
    revalidateProjectPages();
    return NextResponse.json({ success: true, message: "Parameter deleted" });
  } catch (error) {
    console.error("Failed to delete global parameter:", error);
    return NextResponse.json({ error: "Failed to delete parameter" }, { status: 500 });
  }
}
