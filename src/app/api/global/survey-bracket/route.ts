import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import { DEFAULT_SURVEY_BRACKET, normalizeSurveyBracket } from "@/lib/scoring";

/**
 * Survey D bracket — the "Helper (bracket)" thresholds from the
 * Scoring DVF - D sheet, configurable from the admin (Framework tab).
 * GET returns the stored bracket, or the sheet's agreed defaults when
 * nothing is stored yet. POST (admin only) saves a new bracket.
 */
export async function GET() {
  try {
    const stored = await dbService.getSurveyBracket();
    const bracket = normalizeSurveyBracket(stored ?? DEFAULT_SURVEY_BRACKET);
    return NextResponse.json({
      bracket,
      source: stored ? "global" : "default",
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

    const bracket = await dbService.updateSurveyBracket({
      score2Min: Math.floor(score2Min),
      score3Min: Math.floor(score3Min),
      zeroBehavior: zeroBehavior as 1 | 2,
    });

    revalidateProjectPages();
    return NextResponse.json({
      success: true,
      bracket,
      message: "Survey bracket saved — it now applies to all projects",
    });
  } catch (error: any) {
    console.error("Failed to update survey bracket:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update survey bracket" },
      { status: 500 }
    );
  }
}
