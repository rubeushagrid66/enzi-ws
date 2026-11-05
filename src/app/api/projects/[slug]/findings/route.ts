import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const project = await dbService.getProjectBySlug(params.slug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ findings: project.findings });
  } catch (error) {
    console.error("Error fetching findings:", error);
    return NextResponse.json({ error: "Error fetching findings" }, { status: 500 });
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
    const { title, description, sumber, fitur, platform } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const projectId = await dbService.getProjectIdBySlug(params.slug);
    if (!projectId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const finding = await dbService.createFinding(projectId, {
      title,
      description,
      sumber,
      fitur,
      platform,
    });

    return NextResponse.json({ success: true, finding });
  } catch (error) {
    console.error("Error creating finding:", error);
    return NextResponse.json({ error: "Error creating finding" }, { status: 500 });
  }
}
