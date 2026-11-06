import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
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

    // Helper to parse finding fields (Sumber, Fitur, Platform)
    const parseFindingMeta = (rawTags: any) => {
      let sumber: string[] = [];
      let fitur: string = "";
      let platform: string[] = [];
      let tagsList: Array<{ category: string; value: string }> = [];

      let parsed: any = null;
      try {
        parsed = typeof rawTags === "string" ? JSON.parse(rawTags) : rawTags;
      } catch {
        parsed = [];
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        sumber = Array.isArray(parsed.sumber) ? parsed.sumber : (parsed.sumber ? [parsed.sumber] : []);
        fitur = parsed.fitur || "";
        platform = Array.isArray(parsed.platform) ? parsed.platform : (parsed.platform ? [parsed.platform] : []);
      } else if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const cat = (item.category || "").toLowerCase();
          const val = item.value || "";
          if (cat === "sumber") {
            if (!sumber.includes(val)) sumber.push(val);
          } else if (["fitur", "feature"].includes(cat)) {
            fitur = val;
          } else if (cat === "platform") {
            if (!platform.includes(val)) platform.push(val);
          }
        }
      }

      // Build unified visual tagsList
      sumber.forEach((s) => tagsList.push({ category: "Sumber", value: s }));
      if (fitur) tagsList.push({ category: "Fitur", value: fitur });
      platform.forEach((p) => tagsList.push({ category: "Platform", value: p }));

      return { sumber, fitur, platform, tagsList };
    };

    // Calculate DVF metrics for each finding
    const findingsWithScores = (project.findings || []).map((f: any) => {
      const { sumber, fitur, platform, tagsList } = parseFindingMeta(f.tags);

      // 1. Desirability
      const findingValues = (f.parameterValues || []).map((pv: any) => ({
        l3Id: pv.l3Id,
        l3: pv.segment
          ? {
              l2Id: pv.segment.subCategory?.id,
            }
          : undefined,
      }));
      const desirabilityData = calculateDesirabilityScore(parsedL1, findingValues, {
        sumber,
        platform,
      });

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

      return {
        ...f,
        sumber,
        fitur,
        platform,
        tagsList,
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

    const updated = await dbService.updateProject(slug, {
      name: body.name,
      description: body.description,
      isActive: body.isActive,
    });

    revalidateProjectPages(slug);
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbService.deleteProject(params.slug);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, message: "Project deleted" });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
