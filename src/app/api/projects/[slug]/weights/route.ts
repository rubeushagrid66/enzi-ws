import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { normalizeWeights, WeightInput } from "@/lib/scoring";

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

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Auto-calibrate weights to equal 100%
    const normalized = normalizeWeights(rawWeights);

    // Upsert each weight
    for (const nw of normalized) {
      await prisma.frameworkWeight.upsert({
        where: {
          projectId_name: {
            projectId: project.id,
            name: nw.name,
          },
        },
        update: {
          weight: nw.weight,
        },
        create: {
          projectId: project.id,
          name: nw.name,
          weight: nw.weight,
        },
      });
    }

    const updatedWeights = await prisma.frameworkWeight.findMany({
      where: { projectId: project.id },
    });

    return NextResponse.json({
      success: true,
      weights: updatedWeights,
      normalized,
      message: "Weights auto-calibrated and saved successfully",
    });
  } catch (error) {
    console.error("Failed to update weights:", error);
    return NextResponse.json(
      { error: "Failed to update weights" },
      { status: 500 }
    );
  }
}
