import { NextResponse } from "next/server";
import { dbService, ASPECT_LABELS } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import { FRAMEWORKS } from "@/lib/scoring";

export async function PUT(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { name, description, framework, label } = await request.json();
    if (!name) return NextResponse.json({ error: "Aspect name is required" }, { status: 400 });
    if (framework !== undefined && !FRAMEWORKS.includes(framework)) {
      return NextResponse.json(
        { error: "framework must be Desirability, Viability or Feasibility" },
        { status: 400 }
      );
    }
    if (label !== undefined && label !== null && label !== "" && !(ASPECT_LABELS as readonly string[]).includes(label)) {
      return NextResponse.json(
        { error: "label must be Business & Ops, Product or Tech" },
        { status: 400 }
      );
    }
    const aspect = await dbService.updateAspect(params.id, { name, description, framework, label });
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, aspect });
  } catch (error) {
    console.error("Error updating aspect:", error);
    return NextResponse.json({ error: "Failed to update aspect" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbService.deleteAspect(params.id);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, message: "Aspect deleted" });
  } catch (error) {
    console.error("Error deleting aspect:", error);
    return NextResponse.json({ error: "Failed to delete aspect" }, { status: 500 });
  }
}
