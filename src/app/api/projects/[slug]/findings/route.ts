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
        findings: {
          include: {
            parameterValues: true,
            viabilityVotes: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ findings: project.findings });
  } catch (error) {
    console.error("Error fetching findings:", error);
    return NextResponse.json(
      { error: "Error fetching findings" },
      { status: 500 }
    );
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
    const { title, description, tags, parameterL3Ids } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Default feasibility coordinates in middle (50, 50)
    const finding = await prisma.finding.create({
      data: {
        projectId: project.id,
        title,
        description: description || "",
        tags: typeof tags === "string" ? tags : JSON.stringify(tags || []),
        feasibilityX: 50.0,
        feasibilityY: 50.0,
        feasibilityQuadrant: "QUICK_WINS",
        feasibilityImpact: "HIGH",
        feasibilityEffort: "LOW",
      },
    });

    // If parameter L3 segments are linked
    if (Array.isArray(parameterL3Ids)) {
      for (const l3Id of parameterL3Ids) {
        await prisma.findingParameterValue.create({
          data: {
            findingId: finding.id,
            l3Id,
            value: title,
          },
        });
      }
    }

    return NextResponse.json({ success: true, finding });
  } catch (error) {
    console.error("Error creating finding:", error);
    return NextResponse.json(
      { error: "Error creating finding" },
      { status: 500 }
    );
  }
}
