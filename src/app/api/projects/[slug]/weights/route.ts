import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import { WeightInput } from "@/lib/scoring";

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = params;
    const body = await request.json();
    const rawWeights: WeightInput[] = body.weights;

    if (!Array.isArray(rawWeights) || rawWeights.length === 0) {
      return NextResponse.json(
        { error: "Invalid weights array" },
        { status: 400 }
      );
    }

    // Weights are saved exactly as entered — no auto-calibration,
    // no normalization to 100. Any non-negative number is allowed.
    const invalid = rawWeights.some(
      (w) =>
        typeof w?.name !== "string" ||
        typeof w?.weight !== "number" ||
        !Number.isFinite(w.weight) ||
        w.weight < 0
    );
    if (invalid) {
      return NextResponse.json(
        { error: "Each weight must be a non-negative number" },
        { status: 400 }
      );
    }

    const project = await dbService.getProjectBySlug(slug);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const updatedWeights = await dbService.updateWeights(project.id, rawWeights);

    revalidateProjectPages(slug);
    return NextResponse.json({
      success: true,
      weights: updatedWeights,
      message: "Weights saved successfully",
    });
  } catch (error) {
    console.error("Failed to update weights:", error);
    return NextResponse.json(
      { error: "Failed to update weights" },
      { status: 500 }
    );
  }
}
