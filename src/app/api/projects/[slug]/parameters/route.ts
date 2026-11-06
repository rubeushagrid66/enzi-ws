import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const project = await dbService.getProjectBySlug(params.slug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ parameters: project.parametersL1 });
  } catch (error) {
    console.error("Error fetching parameters:", error);
    return NextResponse.json({ error: "Failed to fetch parameters" }, { status: 500 });
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

    const body = await request.json();
    const { level, name, parentId, scoringRules } = body;

    if (level === "L1") {
      if (!name) return NextResponse.json({ error: "L1 Name is required" }, { status: 400 });
      const projectId = await dbService.getProjectIdBySlug(params.slug);
      if (!projectId) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      const item = await dbService.createParameterL1(projectId, name, scoringRules);
      revalidateProjectPages(params.slug);
      return NextResponse.json({ success: true, item });
    } else if (level === "L2") {
      if (!name || !parentId) {
        return NextResponse.json({ error: "Name and parent L1 id required" }, { status: 400 });
      }
      const item = await dbService.createParameterL2(parentId, name);
      revalidateProjectPages(params.slug);
      return NextResponse.json({ success: true, item });
    } else if (level === "L3") {
      if (!name || !parentId) {
        return NextResponse.json({ error: "Name and parent L2 id required" }, { status: 400 });
      }
      const item = await dbService.createParameterL3(parentId, name);
      revalidateProjectPages(params.slug);
      return NextResponse.json({ success: true, item });
    }

    return NextResponse.json({ error: "Invalid level (must be L1, L2, or L3)" }, { status: 400 });
  } catch (error) {
    console.error("Error creating parameter:", error);
    return NextResponse.json({ error: "Failed to create parameter" }, { status: 500 });
  }
}
