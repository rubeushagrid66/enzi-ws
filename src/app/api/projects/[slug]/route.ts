import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  calculateDesirabilityScore,
  calculateViabilityScore,
  getFeasibilityFromCoordinates,
  calculateCompositeDVF,
  ScoringRule,
} from "@/lib/scoring";

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    const project = await dbService.getProjectBySlug(slug);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Parse weights
    const weightsMap = {
      desirability: 33.34,
      viability: 33.33,
      feasibility: 33.33,
    };
    for (const fw of project.frameworkWeights) {
      const lower = fw.name.toLowerCase();
      if (lower.includes("desir")) weightsMap.desirability = fw.weight;
      if (lower.includes("viab")) weightsMap.viability = fw.weight;
      if (lower.includes("feas")) weightsMap.feasibility = fw.weight;
    }

    // Format L1 parameters for calculation
    const parsedL1 = (project.parametersL1 || []).map((l1: any) => {
      let rules: ScoringRule[] = [];
      try {
        rules = JSON.parse(l1.scoringRules);
      } catch {
        rules = [];
      }
      return {
        id: l1.id,
        name: l1.name,
        scoringRules: rules,
        subCategories: (l1.subCategories || []).map((sc: any) => ({
          id: sc.id,
          name: sc.name,
        })),
      };
    });

    // Calculate DVF metrics for each finding
    const findingsWithScores = (project.findings || []).map((f: any) => {
      // 1. Desirability
      const findingValues = (f.parameterValues || []).map((pv: any) => ({
        l3Id: pv.l3Id,
        l3: pv.segment
          ? {
              l2Id: pv.segment.subCategory?.id,
            }
          : undefined,
      }));
      const desirabilityData = calculateDesirabilityScore(parsedL1, findingValues);

      // 2. Viability
      const viabilityData = calculateViabilityScore(
        project.viabilityAspects.length,
        project.groups,
        f.viabilityVotes
      );

      // 3. Feasibility
      const feasibilityData = getFeasibilityFromCoordinates(
        f.feasibilityX ?? 50,
        f.feasibilityY ?? 50
      );

      // 4. Composite DVF
      const compositeData = calculateCompositeDVF(weightsMap, {
        desirability: desirabilityData.score,
        viability: viabilityData.score,
        feasibility: feasibilityData.score,
      });

      let parsedTags: Array<{ category: string; value: string }> = [];
      try {
        parsedTags = JSON.parse(f.tags);
      } catch {
        parsedTags = [];
      }

      return {
        ...f,
        tagsList: parsedTags,
        scores: {
          desirability: desirabilityData.score,
          desirabilityDetails: desirabilityData,
          viability: viabilityData.score,
          viabilityDetails: viabilityData,
          feasibility: feasibilityData.score,
          feasibilityDetails: feasibilityData,
          composite: compositeData.compositeScore,
          compositeFormula: compositeData.formula,
        },
      };
    });

    return NextResponse.json({
      project: {
        ...project,
        findings: findingsWithScores,
        weightsMap,
      },
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const updated = await prisma.project.update({
      where: { slug },
      data: {
        name: body.name,
        description: body.description,
        isActive: body.isActive,
      },
    });

    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}
