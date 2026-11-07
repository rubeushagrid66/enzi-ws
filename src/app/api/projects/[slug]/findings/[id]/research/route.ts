import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import {
  calculateDesirabilityFromResearch,
  getFindingScoringStatus,
} from "@/lib/scoring";

/**
 * Save a finding's research mentions (how many users mentioned it in
 * Wawancara and/or Survey). Open to any logged-in user, like editing a
 * finding. D is computed from these counts against the project's basis
 * N (interview N / survey N) — the counts are the only thing stored.
 * Pass null to clear a count. Returns the finding with its recomputed
 * Desirability score and scoring status, so the detail page can update
 * without a reload.
 */
export async function PUT(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug, id } = params;
    const body = await request.json().catch(() => ({}));
    const clean = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const interviewMentions = clean(body.interviewMentions);
    const surveyMentions = clean(body.surveyMentions);

    await dbService.updateFindingResearch(id, {
      ...(interviewMentions !== undefined && { interviewMentions }),
      ...(surveyMentions !== undefined && { surveyMentions }),
    });

    // Recompute D + status for this finding (same formula as the
    // project GET route) so the client can update in place.
    const project = await dbService.getProjectBySlug(slug);
    const researchN = {
      interviewN:
        (project as any)?.interview_n != null
          ? Number((project as any).interview_n)
          : (project as any)?.interviewN != null
            ? Number((project as any).interviewN)
            : null,
      surveyN:
        (project as any)?.survey_n != null
          ? Number((project as any).survey_n)
          : (project as any)?.surveyN != null
            ? Number((project as any).surveyN)
            : null,
    };
    const finding = (project?.findings || []).find((f: any) => f.id === id);
    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }
    const desirabilityData = calculateDesirabilityFromResearch(
      finding.interviewMentions ?? null,
      researchN.interviewN,
      finding.surveyMentions ?? null,
      researchN.surveyN
    );
    const scoringStatus = getFindingScoringStatus(
      finding,
      project?.viabilityAspects,
      researchN
    );

    revalidateProjectPages(slug);
    return NextResponse.json({
      success: true,
      finding: {
        ...finding,
        scoringStatus,
        scores: {
          desirability: desirabilityData.score,
          desirabilityDetails: desirabilityData,
        },
      },
    });
  } catch (error: any) {
    console.error("Error saving research mentions:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save research mentions" },
      { status: 500 }
    );
  }
}
