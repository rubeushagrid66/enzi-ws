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
  calculateDesirabilityFromResearch,
  calculateAllParticipantScores,
  getFindingScoringStatus,
  normalizeFramework,
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

    // Research basis for Desirability (per project, per source):
    // the project's interview/survey totals. The db row is snake_case
    // in production (Supabase) and camelCase locally (Prisma) — read
    // both. Null means "not set": D cannot be computed for that source.
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
    const vAspectIds = aspectIdsFor("Viability");
    const fAspectIds = aspectIdsFor("Feasibility");

    // Calculate DVF metrics for each finding. Scores are workshop-made:
    // a dimension only has a number once the workshop produced data for
    // it. Otherwise the dimension is null — "Pending scoring" — never a
    // 0 that looks like a real score.
    // V and F are PER PARTICIPANT (1–3, no composite, no averaging
    // across participants): V = mean of the participant's Viability
    // aspect scores; F = 4 − mean of the participant's Feasibility
    // ("Effort") aspect scores; unscored aspects are skipped, never 0.
    // The finding shows the logged-in participant's own values, selected
    // client-side from participantScores. Desirability is 1–3 from
    // research mentions (Wawancara + Survey), not L3 mappings.
    // Ideas tab = this project's platform only. The Platform tag is
    // the idea's home: a "CMS" idea never belongs on the Value Chain
    // page (and vice versa), even when it was created in — or assigned
    // to a group of — the other project. Ideas with no Platform tag
    // are kept (nothing to contradict), so they never vanish.
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
    const findingsWithScores = (project.findings || [])
      .map((f: any) => {
      const { sumber, fitur, platform, tagsList } = parseFindingMeta(f.tags);
      const scoringStatus = getFindingScoringStatus(
        f,
        project.viabilityAspects,
        researchN
      );

      // 1. Desirability — research mentions against the project's basis
      // N (Wawancara: ≥66% → 3, ≥33% → 2; Survey: ≥30% → 3, ≥15% → 2;
      // D = round-up average of the two source scores, or the single
      // source's score). Null when no source has data.
      const desirabilityData = calculateDesirabilityFromResearch(
        f.interviewMentions ?? null,
        researchN.interviewN,
        f.surveyMentions ?? null,
        researchN.surveyN
      );

      // 2. Viability + Feasibility — per-participant 1–3 scores.
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
    })
      .filter((f: any) => platformMatches(f.platform || []));

    // Linked findings for the Ideas listing: each idea (pool item)
    // carries the findings linked to it, so the card shows them
    // without opening the detail page. One extra read (all ideas +
    // their finding ids), then a local join — no per-finding query.
    let relatedByFinding: Record<string, Array<{ id: string; title: string; description: string; imageUrl: string | null }>> = {};
    try {
      const allIdeas = await dbService.getIdeas();
      for (const idea of allIdeas) {
        for (const fid of idea.findingIds || []) {
          (relatedByFinding[fid] ||= []).push({
            id: idea.id,
            title: idea.title,
            description: idea.description || "",
            imageUrl: idea.imageUrl || null,
          });
        }
      }
    } catch {
      // Listing still works without the linked findings.
    }
    for (const f of findingsWithScores) {
      f.relatedIdeas = relatedByFinding[f.id] || [];
    }

    return NextResponse.json({
      project: {
        ...project,
        // Camel-case research basis for the client (the raw row is
        // snake_case in production, camelCase locally).
        interviewN: researchN.interviewN,
        surveyN: researchN.surveyN,
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
      // Research basis N for Desirability (admin-only): total users per
      // source in this project. Null clears a basis (D then cannot be
      // computed for that source).
      ...(body.interviewN !== undefined && { interviewN: body.interviewN }),
      ...(body.surveyN !== undefined && { surveyN: body.surveyN }),
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
