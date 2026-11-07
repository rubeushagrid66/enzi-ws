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
    const { x, y, manual } = body;

    // Reset to computed position: clear the manual pin without moving
    // the card. The board then places it from the viewer's D/V/F scores.
    if (manual === false && x === undefined && y === undefined) {
      const updated = await dbService.setFindingFeasibilityManual(id, false);
      revalidateProjectPages(params.slug);
      return NextResponse.json({
        success: true,
        finding: updated,
        feasibility: {
          x: updated.feasibilityX,
          y: updated.feasibilityY,
          quadrant: updated.feasibilityQuadrant,
          impactLabel: updated.feasibilityImpact,
          effortLabel: updated.feasibilityEffort,
          manual: false,
        },
      });
    }

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

    // A drag pins the card: the stored position wins over the computed
    // one until it is reset.
    const updated = await dbService.updateFindingFeasibility(
      id,
      Number(x),
      Number(y),
      quadrant,
      impactLabel,
      effortLabel,
      true
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
        manual: true,
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
