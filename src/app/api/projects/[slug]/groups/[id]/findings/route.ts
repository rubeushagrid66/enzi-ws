import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import {
  calculateDesirabilityFromResearch,
  calculateAllParticipantScores,
  getFindingScoringStatus,
  normalizeFramework,
} from "@/lib/scoring";

/**
 * Findings assigned to one group, with D/V/F computed in this project's
 * context (this project's aspects + research basis N).
 * GET /api/projects/[slug]/groups/[id]/findings
 * Any logged-in user can read it — the group view on the project page
 * is for everyone. A finding assigned to this group shows here even
 * when its home project is the other one (assignment is cross-project);
 * its D/V/F are computed from this project's aspects, the same way the
 * project page computes them for its own findings.
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
    const group = (project.groups || []).find((g: any) => g.id === params.id);
    if (!group) {
      return NextResponse.json({ error: "Group not found in this project" }, { status: 404 });
    }

    const findingIds = await dbService.getGroupFindingIds(params.id);
    const findings = await dbService.getFindingsByIds(findingIds);

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
      sumber.forEach((s) => tagsList.push({ category: "Sumber", value: s }));
      if (fitur) tagsList.push({ category: "Fitur", value: fitur });
      platform.forEach((p) => tagsList.push({ category: "Platform", value: p }));
      return { sumber, fitur, platform, tagsList };
    };

    const findingsWithScores = findings.map((f: any) => {
      const { sumber, fitur, platform, tagsList } = parseFindingMeta(f.tags);
      const scoringStatus = getFindingScoringStatus(f, project.viabilityAspects, researchN);
      const desirabilityData = calculateDesirabilityFromResearch(
        f.interviewMentions ?? null,
        researchN.interviewN,
        f.surveyMentions ?? null,
        researchN.surveyN
      );
      const participantScores = calculateAllParticipantScores(
        f.viabilityVotes,
        vAspectIds,
        fAspectIds
      );
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
