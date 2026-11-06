import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import { WeightInput } from "@/lib/scoring";

const DEFAULT_WEIGHTS = [
  { name: "Desirability", weight: 40 },
  { name: "Viability", weight: 30 },
  { name: "Feasibility", weight: 30 },
];

/**
 * Global DVF weights — one weighting for the whole platform.
 * GET returns the global weights when the global setup exists;
 * otherwise the first project's weights (today's per-project
 * behaviour), so scoring never breaks before the SQL is run.
 */
export async function GET() {
  try {
    const global = await dbService.getGlobalWeights();
    if (global) {
      return NextResponse.json({ weights: global, source: "global" });
    }
    // Fallback before the SQL in docs/global-setup-sql.md is run: use
    // the B2B project's weights (the migration source of truth).
    const projects = await dbService.getProjects();
    const fallback =
      projects.find((p: any) => p.slug === "cash-management-system") || projects[0];
    const weights =
      fallback?.frameworkWeights?.length > 0
        ? fallback.frameworkWeights.map((w: any) => ({ name: w.name, weight: Number(w.weight) }))
        : DEFAULT_WEIGHTS;
    return NextResponse.json({
      weights,
      source: fallback ? `project:${fallback.slug}` : "default",
      note: "Global setup is not enabled yet — run docs/global-setup-sql.md in the Supabase SQL editor to make weights global.",
    });
  } catch (error) {
    console.error("Failed to fetch global weights:", error);
    return NextResponse.json({ error: "Failed to fetch weights" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const rawWeights: WeightInput[] = body.weights;

    if (!Array.isArray(rawWeights) || rawWeights.length === 0) {
      return NextResponse.json({ error: "Invalid weights array" }, { status: 400 });
    }

    // Weights are saved exactly as entered — no auto-calibration,
    // no normalization to 100. Any non-negative number is allowed.
    const invalid = rawWeights.some(
      (w) =>
        typeof w?.name !== "string" ||
        typeof w?.weight !== "number" ||
        !Number.isFinite(w.weight) ||
        w.weight < 0
    );
    if (invalid) {
      return NextResponse.json(
        { error: "Each weight must be a non-negative number" },
        { status: 400 }
      );
    }

    const weights = await dbService.updateGlobalWeights(rawWeights);

    revalidateProjectPages();
    return NextResponse.json({
      success: true,
      weights,
      message: "Global weights saved successfully — they now apply to all projects",
    });
  } catch (error: any) {
    console.error("Failed to update global weights:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update weights" },
      { status: 500 }
    );
  }
}
