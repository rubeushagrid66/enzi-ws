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
        viabilityAspects: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

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

    const { slug } = params;
    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Aspect name is required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const aspect = await prisma.viabilityAspect.create({
      data: {
        projectId: project.id,
        name,
        description: description || "",
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, aspect });
  } catch (error) {
    console.error("Error creating aspect:", error);
    return NextResponse.json({ error: "Failed to create aspect" }, { status: 500 });
  }
}
