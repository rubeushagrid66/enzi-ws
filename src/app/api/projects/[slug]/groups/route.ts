import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const project = await prisma.project.findUnique({
      where: { slug },
      include: {
        groups: {
          include: {
            participants: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = params;
    const body = await request.json();
    const { type, name, groupId, roleTitle } = body;

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (type === "GROUP") {
      if (!name) {
        return NextResponse.json({ error: "Group name is required" }, { status: 400 });
      }
      const group = await prisma.group.create({
        data: {
          projectId: project.id,
          name,
          isActive: true,
        },
      });
      return NextResponse.json({ success: true, group });
    } else if (type === "PARTICIPANT") {
      if (!name || !groupId) {
        return NextResponse.json(
          { error: "Participant name and groupId are required" },
          { status: 400 }
        );
      }
      const participant = await prisma.participant.create({
        data: {
          groupId,
          name,
          roleTitle: roleTitle || "",
          isActive: true,
        },
      });
      return NextResponse.json({ success: true, participant });
    }

    return NextResponse.json({ error: "Invalid type (must be GROUP or PARTICIPANT)" }, { status: 400 });
  } catch (error) {
    console.error("Error creating group/participant:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
