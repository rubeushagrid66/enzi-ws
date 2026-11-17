import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import { DEFAULT_SURVEY_BRACKET, normalizeSurveyBracket } from "@/lib/scoring";

/**
 * Survey D bracket — the "Helper (bracket)" thresholds from the
 * Scoring DVF - D sheet, configurable from the admin (Framework tab).
 * Brackets are PER-PROJECT (2026-11-17): GET accepts
 * `?project=<slug>` and returns that project's bracket (falling back
 * to the global bracket, then the sheet's defaults); without it, the
 * global bracket is returned. POST (admin only) saves a bracket for
 * the project named in the body's `projectSlug` (or `project`).
 */
export async function GET(request: Request) {
  try {
    const projectSlug = new URL(request.url).searchParams.get("project");
    const stored = await dbService.getSurveyBracket(projectSlug);
    const bracket = normalizeSurveyBracket(stored ?? DEFAULT_SURVEY_BRACKET);
    return NextResponse.json({
      bracket,
      source: stored ? (projectSlug ? "project" : "global") : "default",
      projectSlug: projectSlug ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch survey bracket:", error);
    return NextResponse.json({ error: "Failed to fetch survey bracket" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;

    const body = await request.json();
    const raw = body.bracket ?? body;
    const projectSlug = String(body.projectSlug ?? body.project ?? "").trim();
    if (!projectSlug) {
      return NextResponse.json(
        { error: "projectSlug is required" },
        { status: 400 }
      );
    }

    const score2Min = Number(raw?.score2Min);
    const score3Min = Number(raw?.score3Min);
    const zeroBehavior = Number(raw?.zeroBehavior);
    if (
      !Number.isFinite(score2Min) || score2Min < 1 ||
      !Number.isFinite(score3Min) || score3Min < 1 ||
      (zeroBehavior !== 1 && zeroBehavior !== 2)
    ) {
      return NextResponse.json(
        { error: "score2Min and score3Min must be >= 1; zeroBehavior must be 1 or 2" },
        { status: 400 }
      );
    }
    if (score3Min < score2Min) {
      return NextResponse.json(
        { error: "score3Min must be >= score2Min" },
        { status: 400 }
      );
    }

    const bracket = await dbService.updateSurveyBracket(projectSlug, {
      score2Min: Math.floor(score2Min),
      score3Min: Math.floor(score3Min),
      zeroBehavior: zeroBehavior as 1 | 2,
    });

    revalidateProjectPages();
    return NextResponse.json({
      success: true,
      bracket,
      projectSlug,
      message: `Survey bracket saved for ${projectSlug}`,
    });
  } catch (error: any) {
    console.error("Failed to update survey bracket:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update survey bracket" },
      { status: 500 }
    );
  }
}
