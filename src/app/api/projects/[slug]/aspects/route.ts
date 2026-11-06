import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import { FRAMEWORKS } from "@/lib/scoring";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const project = await dbService.getProjectBySlug(params.slug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ aspects: project.viabilityAspects });
  } catch (error) {
    console.error("Error fetching aspects:", error);
    return NextResponse.json({ error: "Failed to fetch aspects" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, description, framework } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "Aspect name is required" }, { status: 400 });
    }
    if (framework !== undefined && !FRAMEWORKS.includes(framework)) {
      return NextResponse.json(
        { error: "framework must be Desirability, Viability or Feasibility" },
        { status: 400 }
      );
    }

    const projectId = await dbService.getProjectIdBySlug(params.slug);
    if (!projectId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const aspect = await dbService.createAspect(projectId, name, description, framework ?? "Viability");
    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, aspect });
  } catch (error) {
    console.error("Error creating aspect:", error);
    return NextResponse.json({ error: "Failed to create aspect" }, { status: 500 });
  }
}
