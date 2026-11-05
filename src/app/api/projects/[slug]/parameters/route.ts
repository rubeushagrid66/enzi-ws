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
        parametersL1: {
          include: {
            subCategories: {
              include: {
                segments: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

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

    const { slug } = params;
    const body = await request.json();
    const { level, name, parentId, scoringRules } = body;

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (level === "L1") {
      if (!name) return NextResponse.json({ error: "L1 Name is required" }, { status: 400 });

      const l1 = await prisma.parameterL1.create({
        data: {
          projectId: project.id,
          name,
          scoringRules: scoringRules
            ? JSON.stringify(scoringRules)
            : JSON.stringify([
                { minPercent: 66, score: 3 },
                { minPercent: 33, score: 2 },
                { minPercent: 0, score: 1 },
              ]),
        },
      });
      return NextResponse.json({ success: true, item: l1 });
    } else if (level === "L2") {
      if (!name || !parentId) {
        return NextResponse.json({ error: "Name and parent L1 id required" }, { status: 400 });
      }
      const l2 = await prisma.parameterL2.create({
        data: {
          l1Id: parentId,
          name,
        },
      });
      return NextResponse.json({ success: true, item: l2 });
    } else if (level === "L3") {
      if (!name || !parentId) {
        return NextResponse.json({ error: "Name and parent L2 id required" }, { status: 400 });
      }
      const l3 = await prisma.parameterL3.create({
        data: {
          l2Id: parentId,
          name,
        },
      });
      return NextResponse.json({ success: true, item: l3 });
    }

    return NextResponse.json({ error: "Invalid level (must be L1, L2, or L3)" }, { status: 400 });
  } catch (error) {
    console.error("Error creating parameter:", error);
    return NextResponse.json({ error: "Failed to create parameter" }, { status: 500 });
  }
}
