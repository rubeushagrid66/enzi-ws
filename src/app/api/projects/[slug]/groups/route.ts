import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
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
    return NextResponse.json({ groups: project.groups });
  } catch (error) {
    console.error("Error fetching groups:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { type, name, groupId, roleTitle } = body;

    const projectId = await dbService.getProjectIdBySlug(params.slug);
    if (!projectId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (type === "GROUP") {
      if (!name) {
        return NextResponse.json({ error: "Group name is required" }, { status: 400 });
      }
      const group = await dbService.createGroup(projectId, name);
      revalidateProjectPages(params.slug);
      return NextResponse.json({ success: true, group });
    } else if (type === "PARTICIPANT") {
      if (!name || !groupId) {
        return NextResponse.json(
          { error: "Participant name and groupId are required" },
          { status: 400 }
        );
      }
      const participant = await dbService.createParticipant(groupId, name, roleTitle);
      revalidateProjectPages(params.slug);
      return NextResponse.json({ success: true, participant });
    }

    return NextResponse.json({ error: "Invalid type (must be GROUP or PARTICIPANT)" }, { status: 400 });
  } catch (error) {
    console.error("Error creating group/participant:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
