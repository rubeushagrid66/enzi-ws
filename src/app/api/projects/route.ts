import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const projects = await dbService.getProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, slug, description, isActive } = await request.json();

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    const formattedSlug = slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");

    const existing = await prisma.project.findUnique({
      where: { slug: formattedSlug },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A project with this slug already exists" },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        name,
        slug: formattedSlug,
        description: description || "",
        isActive: isActive !== undefined ? isActive : true,
        frameworkWeights: {
          create: [
            { name: "Desirability", weight: 33.34 },
            { name: "Viability", weight: 33.33 },
            { name: "Feasibility", weight: 33.33 },
          ],
        },
        viabilityAspects: {
          create: [
            { name: "Market Demand", description: "Customer need and adoption" },
            { name: "Revenue / Business Value", description: "Financial viability" },
            { name: "Operational Scalability", description: "Process supportability" },
          ],
        },
      },
      include: {
        frameworkWeights: true,
        viabilityAspects: true,
      },
    });

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
