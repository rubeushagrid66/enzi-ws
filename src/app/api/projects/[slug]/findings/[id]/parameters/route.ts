import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/**
 * Workshop Desirability mapping: the facilitator records which L3
 * segments the group agrees apply to a finding, each with a free-text
 * value (the specific note for that segment). These explicit mappings
 * are the ONLY input to the Desirability score.
 */

export async function POST(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug, id: findingId } = params;
    const body = await request.json();
    const values: Array<{ l3Id: string; value: string }> = body.values;

    if (!Array.isArray(values)) {
      return NextResponse.json(
        { error: "values must be an array of { l3Id, value }" },
        { status: 400 }
      );
    }

    const project = await dbService.getProjectBySlug(slug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const finding = (project.findings || []).find((f: any) => f.id === findingId);
    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }

    // Every mapped L3 must belong to this project's parameter tree.
    const validL3Ids = new Set<string>();
    for (const l1 of project.parametersL1 || []) {
      for (const l2 of l1.subCategories || []) {
        for (const l3 of l2.segments || []) validL3Ids.add(l3.id);
      }
    }
    const invalid = values.some((v) => !v.l3Id || !validL3Ids.has(v.l3Id) || !v.value || !String(v.value).trim());
    if (invalid) {
      return NextResponse.json(
        { error: "Each mapping needs a valid L3 segment of this project and a non-empty value" },
        { status: 400 }
      );
    }

    const saved = await dbService.setFindingParameterValues(findingId, values);

    revalidateProjectPages(slug);
    return NextResponse.json({ success: true, values: saved });
  } catch (error) {
    console.error("Failed to save parameter mappings:", error);
    return NextResponse.json(
      { error: "Failed to save parameter mappings" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug, id: findingId } = params;
    const body = await request.json().catch(() => ({}));
    const l3Id: string | undefined = body.l3Id || new URL(request.url).searchParams.get("l3Id") || undefined;
    if (!l3Id) {
      return NextResponse.json({ error: "l3Id is required" }, { status: 400 });
    }

    await dbService.deleteFindingParameterValue(findingId, l3Id);

    revalidateProjectPages(slug);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete parameter mapping:", error);
    return NextResponse.json(
      { error: "Failed to delete parameter mapping" },
      { status: 500 }
    );
  }
}
