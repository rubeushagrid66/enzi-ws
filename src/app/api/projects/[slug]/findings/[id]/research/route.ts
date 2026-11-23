import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdminOrFacilitator } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import {
  calculateDesirabilityFromResearch,
  calculateAutoInterviewMentions,
  calculateAutoSurveyMentions,
  calculateAutoInterviewMentionsCMS,
  calculateAutoSurveyMentionsCMS,
  getFindingScoringStatus,
  usesSheetDModel,
} from "@/lib/scoring";

/**
 * Save a finding's research mentions (how many users mentioned it in
 * Wawancara and/or Survey). Admin/facilitator only — regular users and
 * guests can view the numbers but cannot change them. D is computed
 * from these counts against the project's basis N (interview N /
 * survey N) — the counts are the only thing stored. Pass null to clear
 * a count. Returns the finding with its recomputed Desirability score
 * and scoring status, so the detail page can update without a reload.
 */
export async function PUT(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    const forbidden = requireAdminOrFacilitator(session);
    if (forbidden) return forbidden;

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
    const [project, surveyBracket] = await Promise.all([
      dbService.getProjectBySlug(slug),
      dbService.getSurveyBracket(slug).catch(() => null),
    ]);
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
    // Re-read the finding by ID, not from this slug's project list.
    // The detail page loads a finding by ID even when it belongs to
    // the other project (cross-project fallback in the GET route), so
    // a save from that page must not 404 just because the finding is
    // not in this slug's findings list. D is still computed against
    // this slug's project basis N, matching how the page displays it.
    const found = await dbService.getFindingsByIds([id]);
    const finding = found[0];
    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }
    // Interview mentions are the stored value when set, otherwise the
    // auto value from linked interview findings (same rule as the
    // project GET route) — so saving with the field cleared (null)
    // keeps the auto D instead of dropping it to unscored. Same for
    // survey mentions (stored, otherwise the auto distinct count of
    // linked findings' survey respondents).
    const linkedIdeas = await dbService.getIdeasForFinding(id).catch(() => []);
    // CMS sheet-model D needs the whole project's findings (kartu
    // unions + tema totals); DVC uses the old per-finding logic.
    const isSheetD = usesSheetDModel(slug);
    const projectIdeas = isSheetD
      ? (await dbService.getIdeas().catch(() => [])).filter((i: any) => i.projectId === project?.id)
      : [];
    const autoInterviewMentions = isSheetD
      ? calculateAutoInterviewMentionsCMS(linkedIdeas || [], projectIdeas)
      : calculateAutoInterviewMentions(linkedIdeas || []);
    const effectiveInterviewMentions = finding.interviewMentions ?? autoInterviewMentions;
    const autoSurveyMentions = isSheetD
      ? calculateAutoSurveyMentionsCMS(linkedIdeas || [], projectIdeas)
      : calculateAutoSurveyMentions(linkedIdeas || []);
    const effectiveSurveyMentions = finding.surveyMentions ?? autoSurveyMentions;
    const desirabilityData = calculateDesirabilityFromResearch(
      effectiveInterviewMentions,
      researchN.interviewN,
      effectiveSurveyMentions,
      researchN.surveyN,
      surveyBracket,
      { surveyOnlyRaises: isSheetD }
    );
    const scoringStatus = getFindingScoringStatus(
      { ...finding, interviewMentions: effectiveInterviewMentions, surveyMentions: effectiveSurveyMentions },
      project?.viabilityAspects,
      researchN,
      surveyBracket
    );

    revalidateProjectPages(slug);
    return NextResponse.json({
      success: true,
      finding: {
        ...finding,
        interviewMentionsAuto: autoInterviewMentions,
        surveyMentionsAuto: autoSurveyMentions,
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
