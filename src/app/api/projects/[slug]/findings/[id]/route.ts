import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import {
  calculateAutoInterviewMentions,
  calculateAutoSurveyMentions,
  calculateAutoInterviewMentionsSheetD,
  calculateAutoSurveyMentionsSheetD,
  calculateDesirabilityFromResearch,
  calculateAllParticipantScores,
  getFindingScoringStatus,
  normalizeFramework,
  usesSheetDModel,
} from "@/lib/scoring";

/**
 * One finding, with D/V/F computed in THIS project's context.
 * GET /api/projects/[slug]/findings/[id]
 * The detail page uses it as a fallback when the finding is not in the
 * slug's project — a finding from the other project assigned to one of
 * this project's groups. Its D/V/F are computed from this project's
 * aspects and research basis, the same way the project page computes
 * them for its own findings.
 */
export async function GET(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const project = await dbService.getProjectBySlug(params.slug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const surveyBracket = await dbService.getSurveyBracket(params.slug).catch(() => null);
    const found = await dbService.getFindingsByIds([params.id]);
    const f = found[0];
    if (!f) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }
    // Auto D from linked findings (same rule as the project page):
    // stored mentions win (manual override); when null, the auto
    // values from linked findings apply. Without this, a CMS idea's
    // D was null here (its stored mentions are null) even though the
    // project page shows D=3 from the same links.
    const researchN = {
      interviewN:
        (project as any).interview_n != null
          ? Number((project as any).interview_n)
          : (project as any).interviewN != null
            ? Number((project as any).interviewN)
            : null,
      surveyN:
        (project as any).survey_n != null
          ? Number((project as any).survey_n)
          : (project as any).surveyN != null
            ? Number((project as any).surveyN)
            : null,
    };
    const aspectIdsFor = (dim: string) =>
      (project.viabilityAspects || [])
        .filter((a: any) => normalizeFramework(a.framework) === dim)
        .map((a: any) => a.id);
    const vAspectIds = aspectIdsFor("Viability");
    const fAspectIds = aspectIdsFor("Feasibility");
    const linkedIdeas = await dbService.getIdeasForFinding(f.id).catch(() => []);
    // Sheet-model D needs the whole project's findings (kartu
    // unions + tema totals) for the per-kartu / per-tema math.
    const isSheetD = usesSheetDModel(params.slug);
    const projectIdeas = isSheetD
      ? (await dbService.getIdeas().catch(() => [])).filter((i: any) => i.projectId === project.id)
      : [];
    const autoInterviewMentions = isSheetD
      ? calculateAutoInterviewMentionsSheetD(linkedIdeas || [], projectIdeas, params.slug)
      : calculateAutoInterviewMentions(linkedIdeas || []);
    const effectiveInterviewMentions = f.interviewMentions ?? autoInterviewMentions;
    const autoSurveyMentions = isSheetD
      ? calculateAutoSurveyMentionsSheetD(linkedIdeas || [], projectIdeas, params.slug)
      : calculateAutoSurveyMentions(linkedIdeas || []);
    const effectiveSurveyMentions = f.surveyMentions ?? autoSurveyMentions;
    const scoringStatus = getFindingScoringStatus(
      { ...f, interviewMentions: effectiveInterviewMentions, surveyMentions: effectiveSurveyMentions },
      project.viabilityAspects,
      researchN,
      surveyBracket
    );
    const desirabilityData = calculateDesirabilityFromResearch(
      effectiveInterviewMentions,
      researchN.interviewN,
      effectiveSurveyMentions,
      researchN.surveyN,
      surveyBracket,
      { surveyOnlyRaises: isSheetD }
    );
    const participantScores = calculateAllParticipantScores(f.viabilityVotes, vAspectIds, fAspectIds);
    // Finding meta (Sumber / Fitur / Platform) for the detail view.
    let sumber: string[] = [];
    let fitur = "";
    let platform: string[] = [];
    let tagsList: Array<{ category: string; value: string }> = [];
    try {
      const parsed = typeof f.tags === "string" ? JSON.parse(f.tags) : f.tags;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        sumber = Array.isArray(parsed.sumber) ? parsed.sumber : parsed.sumber ? [parsed.sumber] : [];
        fitur = parsed.fitur || "";
        platform = Array.isArray(parsed.platform) ? parsed.platform : parsed.platform ? [parsed.platform] : [];
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
    } catch {
      // Unparseable tags — leave the meta empty.
    }
    // Visual tagsList — only the fields that exist on the create/edit
    // form (Fitur, Platform). "Sumber" is not a form field anymore, so
    // it is not shown as a tag (the raw `sumber` value is still
    // returned, so editing never wipes it).
    if (fitur) tagsList.push({ category: "Fitur", value: fitur });
    platform.forEach((p) => tagsList.push({ category: "Platform", value: p }));
    return NextResponse.json({
      finding: {
        ...f,
        sumber,
        fitur,
        platform,
        tagsList,
        scoringStatus,
        interviewMentionsAuto: autoInterviewMentions,
        surveyMentionsAuto: autoSurveyMentions,
        scores: {
          desirability: desirabilityData?.score ?? null,
          desirabilityDetails: desirabilityData,
          participantScores,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching finding:", error);
    return NextResponse.json({ error: "Failed to fetch finding" }, { status: 500 });
  }
}

export async function PUT(
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
    const { title, description, sumber, fitur, platform, tujuan, scopeTermasuk, scopeTidakTermasuk, roleUsers, roleUsersTidakTermasuk, stepFeatureScreen, stepTidakTermasuk, apaYangBerubah, apaYangBerubahTidakTermasuk, outputKeberhasilan, tujuanBisnis } = body;

    const finding = await dbService.updateFinding(id, {
      title,
      description,
      sumber,
      fitur,
      platform,
      tujuan,
      scopeTermasuk,
      scopeTidakTermasuk,
      roleUsers,
      roleUsersTidakTermasuk,
      stepFeatureScreen,
      stepTidakTermasuk,
      apaYangBerubah,
      apaYangBerubahTidakTermasuk,
      outputKeberhasilan,
      tujuanBisnis,
    });

    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, finding });
  } catch (error) {
    console.error("Error updating finding:", error);
    return NextResponse.json({ error: "Failed to update finding" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbService.deleteFinding(params.id);
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, message: "Finding deleted" });
  } catch (error) {
    console.error("Error deleting finding:", error);
    return NextResponse.json({ error: "Failed to delete finding" }, { status: 500 });
  }
}
