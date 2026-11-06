import { NextResponse } from "next/server";
import { dbService, NotFoundError } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/** A missing project is a 404 with a clear message (e.g. the admin tab
 *  was open before a rename moved the slug), never a generic 500. */
function notFoundResponse() {
  return NextResponse.json(
    { error: "Project not found (it may have been renamed — refresh the project list and try again)" },
    { status: 404 }
  );
}
import {
  calculateDesirabilityScore,
  calculateViabilityScore,
  calculateAspectValidation,
  getFeasibilityFromCoordinates,
  calculateCompositeDVF,
  getFindingScoringStatus,
  normalizeFramework,
  ScoringRule,
} from "@/lib/scoring";
import { slugify } from "@/lib/slugify";

export async function GET(
  _request: Request,
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

    // Aspect → framework linkage: each aspect feeds the dimension it is
    // linked to. Aspects without a framework (created before the linkage
    // existed) count as Viability, so existing behaviour is unchanged
    // until an aspect is re-linked.
    const aspectIdsFor = (dim: string) =>
      (project.viabilityAspects || [])
        .filter((a: any) => normalizeFramework(a.framework) === dim)
        .map((a: any) => a.id);
    const dAspectIds = aspectIdsFor("Desirability");
    const vAspectIds = aspectIdsFor("Viability");
    const fAspectIds = aspectIdsFor("Feasibility");

    // Calculate DVF metrics for each finding. Scores are workshop-made:
    // a dimension only has a number once the workshop produced data for
    // it. Otherwise the dimension (and the composite) is null — "Pending
    // scoring" — never a 0 that looks like a real score.
    // Blend rule: within a dimension, the score is the average of the
    // inputs available for it (L3 mapping and/or linked-aspect
    // validation for D, V-linked votes for V, quadrant and/or
    // linked-aspect validation for F).
    const findingsWithScores = (project.findings || []).map((f: any) => {
      const { sumber, fitur, platform, tagsList } = parseFindingMeta(f.tags);
      const scoringStatus = getFindingScoringStatus(
        f,
        project.viabilityAspects
      );

      // 1. Desirability — explicit L3 mappings, blended with validation
      // of Desirability-linked aspects when the workshop voted on them.
      const findingValues = (f.parameterValues || []).map((pv: any) => ({
        l3Id: pv.l3Id,
        l3: pv.segment
          ? {
              l2Id: pv.segment.subCategory?.id,
            }
          : undefined,
      }));
      const dAspectValidation = calculateAspectValidation(
        dAspectIds,
        project.groups,
        f.viabilityVotes
      );
      const desirabilityData = scoringStatus.desirabilityScored
        ? calculateDesirabilityScore(
            parsedL1,
            findingValues,
            dAspectValidation?.score ?? null
          )
        : null;

      // 2. Viability — participant votes on Viability-linked aspects only.
      const viabilityData = scoringStatus.viabilityScored
        ? calculateViabilityScore(
            vAspectIds.length,
            project.groups,
            f.viabilityVotes,
            vAspectIds
          )
        : null;

      // 3. Feasibility — placed matrix position, blended with validation
      // of Feasibility-linked aspects when the workshop voted on them.
      const fAspectValidation = calculateAspectValidation(
        fAspectIds,
        project.groups,
        f.viabilityVotes
      );
      const feasibilityData = scoringStatus.feasibilityScored
        ? getFeasibilityFromCoordinates(
            f.feasibilityX,
            f.feasibilityY,
            fAspectValidation?.score ?? null
          )
        : null;

      // 4. Composite DVF — only when all three dimensions are scored.
      const compositeData = scoringStatus.scored
        ? calculateCompositeDVF(weightsMap, {
            desirability: desirabilityData!.score,
            viability: viabilityData!.score,
            feasibility: feasibilityData!.score,
          })
        : null;

      return {
        ...f,
        sumber,
        fitur,
        platform,
        tagsList,
        scoringStatus,
        scores: {
          desirability: desirabilityData?.score ?? null,
          desirabilityDetails: desirabilityData,
          viability: viabilityData?.score ?? null,
          viabilityDetails: viabilityData,
          feasibility: feasibilityData?.score ?? null,
          feasibilityDetails: feasibilityData,
          composite: compositeData?.compositeScore ?? null,
          compositeFormula:
            compositeData?.formula ??
            "Pending scoring — complete Desirability, Viability and Feasibility in the workshop.",
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
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;

    const { slug } = params;
    const body = await request.json();

    // Renaming a project moves its URL: the slug is recomputed from the
    // new name. If another project already uses that slug, append -2,
    // -3, ... until it is unique. A name that slugifies to nothing keeps
    // the current slug. There is no slug history, so the old URL 404s
    // after a rename.
    let newSlug: string | undefined;
    if (body.name) {
      const current = await dbService.findProjectBySlug(slug);
      const candidate = slugify(body.name) || slug;
      if (candidate !== slug) {
        newSlug = candidate;
        let n = 2;
        while (true) {
          const clash = await dbService.findProjectBySlug(newSlug);
          if (!clash || (current && clash.id === current.id)) break;
          newSlug = `${candidate}-${n++}`;
        }
      }
    }

    const updated = await dbService.updateProject(slug, {
      name: body.name,
      description: body.description,
      isActive: body.isActive,
      ...(newSlug !== undefined && { slug: newSlug }),
    });

    revalidateProjectPages(slug);
    if (newSlug) revalidateProjectPages(newSlug);
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    if (error instanceof NotFoundError) return notFoundResponse();
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
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;
    await dbService.deleteProject(params.slug);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, message: "Project deleted" });
  } catch (error) {
    if (error instanceof NotFoundError) return notFoundResponse();
    console.error("Failed to delete project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
