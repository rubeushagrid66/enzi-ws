import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import { getFeasibilityFromCoordinates } from "@/lib/scoring";

export async function PATCH(
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
    const { x, y } = body;

    if (x === undefined || y === undefined) {
      return NextResponse.json(
        { error: "Coordinates x and y are required" },
        { status: 400 }
      );
    }

    const { quadrant, impactLabel, effortLabel } = getFeasibilityFromCoordinates(
      Number(x),
      Number(y)
    );

    const updated = await dbService.updateFindingFeasibility(
      id,
      Number(x),
      Number(y),
      quadrant,
      impactLabel,
      effortLabel
    );

    revalidateProjectPages(params.slug);
    return NextResponse.json({
      success: true,
      finding: updated,
      feasibility: {
        x: updated.feasibilityX,
        y: updated.feasibilityY,
        quadrant,
        impactLabel,
        effortLabel,
      },
    });
  } catch (error) {
    console.error("Error updating feasibility:", error);
    return NextResponse.json(
      { error: "Failed to update feasibility position" },
      { status: 500 }
    );
  }
}
