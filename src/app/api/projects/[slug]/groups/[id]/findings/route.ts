import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import {
  calculateAutoInterviewMentions,
  calculateAutoSurveyMentions,
  calculateAutoInterviewMentionsCMS,
  calculateAutoSurveyMentionsCMS,
  calculateDesirabilityFromResearch,
  calculateAllParticipantScores,
  getFindingScoringStatus,
  normalizeFramework,
  usesSheetDModel,
} from "@/lib/scoring";

/**
 * Findings for one group, with D/V/F computed in this project's
 * context (this project's aspects + research basis N).
 * GET /api/projects/[slug]/groups/[id]/findings
 * Anyone can read it — including guests (view-only). The group view
 * on the project page is for everyone, and this returns the same
 * public data the project page already shows. Ideas are no longer
 * assigned to groups: every group scores every idea in the project,
 * so this returns all of the project's findings (by Platform tag,
 * same as the project page), not just the ones once assigned to the
 * group.
 */
export async function GET(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const project = await dbService.getProjectBySlug(params.slug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const surveyBracket = await dbService.getSurveyBracket(params.slug).catch(() => null);
    // Linked findings for the auto D (D-from-linked-findings,
    // 2026-11-17): the stored mentions are the manual override; when
    // they are null the auto values from linked findings apply — the
    // same rule as the project page. Without this, CMS cards showed
    // "—" (their stored mentions are null) while DVC cards showed D
    // (their stored mentions exist). Best-effort: a failed ideas read
    // leaves the auto values null, exactly as before.
    const allIdeas = await dbService.getIdeas().catch(() => null);
    const group = (project.groups || []).find((g: any) => g.id === params.id);
    if (!group) {
      return NextResponse.json({ error: "Group not found in this project" }, { status: 404 });
    }

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
      // Visual tagsList — only the fields that exist on the create/edit
      // form (Fitur, Platform). "Sumber" is not a form field anymore,
      // so it is not shown as a tag (the raw `sumber` value is still
      // returned, so editing never wipes it).
      if (fitur) tagsList.push({ category: "Fitur", value: fitur });
      platform.forEach((p) => tagsList.push({ category: "Platform", value: p }));
      return { sumber, fitur, platform, tagsList };
    };

    // Every group scores every idea in the project (no assignment), so
    // the group shows all of the project's findings, by Platform tag
    // — the same rule as the project page's Ideas tab.
    const projectPlatform = (project.name || "")
      .split(/\s+/)
      .map((w: string) => (w[0] || "").toUpperCase())
      .join("");
    const platformMatches = (platforms: string[]) => {
      const normalized = (platforms || []).map((p) =>
        (p === "CMS Portal" ? "CMS" : p).toUpperCase()
      );
      if (normalized.length === 0) return true;
      return normalized.includes(projectPlatform);
    };
    const findings = (project.findings || []).filter((f: any) => {
      const { platform } = parseFindingMeta(f.tags);
      return platformMatches(platform || []);
    });

    // Auto interview/survey mentions per pool item, from its linked
    // findings (same as the project page): distinct companies for
    // interview, distinct respondents (union) for survey. Null when
    // nothing is linked. CMS uses the sheet-model D instead (interview
    // per kartu touched, survey porsi-weighted per tema touched).
    const isSheetD = usesSheetDModel(params.slug);
    const projectIdeas = (allIdeas || []).filter((i: any) => i.projectId === project.id);
    const autoInterviewByFindingId = new Map<string, number | null>();
    const autoSurveyByFindingId = new Map<string, number | null>();
    const linkedResearchByFindingId = new Map<string, Array<{ sumber: string[]; baznas: number; wikaGedung: number; ipcTpk: number; sf: number; df: number; bf: number; penyebutanSurvey: number; surveyRespondents: string[]; kartu: string | null; temaCode: string | null }>>();
    for (const idea of (allIdeas || [])) {
      const research = {
        sumber: idea.sumber || [],
        baznas: idea.baznas ?? 0,
        wikaGedung: idea.wikaGedung ?? 0,
        ipcTpk: idea.ipcTpk ?? 0,
        sf: idea.sf ?? 0,
        df: idea.df ?? 0,
        bf: idea.bf ?? 0,
        penyebutanSurvey: idea.penyebutanSurvey ?? 0,
        surveyRespondents: Array.isArray(idea.surveyRespondents) ? idea.surveyRespondents : [],
        kartu: idea.kartu ?? null,
        temaCode: idea.temaCode ?? null,
      };
      for (const fid of (idea.findingIds || [])) {
        if (!linkedResearchByFindingId.has(fid)) linkedResearchByFindingId.set(fid, []);
        linkedResearchByFindingId.get(fid)!.push(research);
      }
    }
    linkedResearchByFindingId.forEach((linked, fid) => {
      if (isSheetD) {
        autoInterviewByFindingId.set(fid, calculateAutoInterviewMentionsCMS(linked, projectIdeas));
        autoSurveyByFindingId.set(fid, calculateAutoSurveyMentionsCMS(linked, projectIdeas));
      } else {
        autoInterviewByFindingId.set(fid, calculateAutoInterviewMentions(linked));
        autoSurveyByFindingId.set(fid, calculateAutoSurveyMentions(linked));
      }
    });

    const findingsWithScores = findings.map((f: any) => {
      const { sumber, fitur, platform, tagsList } = parseFindingMeta(f.tags);
      // Stored mentions win (manual override); otherwise the auto
      // values from linked findings — the same rule as the project
      // page, so group cards show D for linked ideas too.
      const autoInterviewMentions = autoInterviewByFindingId.get(f.id) ?? null;
      const effectiveInterviewMentions = f.interviewMentions ?? autoInterviewMentions;
      const autoSurveyMentions = autoSurveyByFindingId.get(f.id) ?? null;
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
      const participantScores = calculateAllParticipantScores(
        f.viabilityVotes,
        vAspectIds,
        fAspectIds
      );
      return {
        ...f,
        interviewMentionsAuto: autoInterviewMentions,
        surveyMentionsAuto: autoSurveyMentions,
        sumber,
        fitur,
        platform,
        tagsList,
        scoringStatus,
        scores: {
          desirability: desirabilityData?.score ?? null,
          desirabilityDetails: desirabilityData,
          participantScores,
        },
      };
    });

    return NextResponse.json({
      success: true,
      group: { id: group.id, name: group.name, projectId: project.id, projectSlug: project.slug },
      findings: findingsWithScores,
    });
  } catch (error) {
    console.error("Error fetching group findings:", error);
    return NextResponse.json({ error: "Failed to fetch group findings" }, { status: 500 });
  }
}
