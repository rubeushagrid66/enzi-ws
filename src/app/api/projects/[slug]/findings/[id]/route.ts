import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { title, description, tags, isActive, parameterL3Ids } = body;

    const updated = await prisma.finding.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        tags: tags !== undefined ? (typeof tags === "string" ? tags : JSON.stringify(tags)) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
    });

    if (Array.isArray(parameterL3Ids)) {
      // Re-map parameter values
      await prisma.findingParameterValue.deleteMany({
        where: { findingId: id },
      });
      for (const l3Id of parameterL3Ids) {
        await prisma.findingParameterValue.create({
          data: {
            findingId: id,
            l3Id,
            value: updated.title,
          },
        });
      }
    }

    return NextResponse.json({ success: true, finding: updated });
  } catch (error) {
    console.error("Error updating finding:", error);
    return NextResponse.json(
      { error: "Failed to update finding" },
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

    const { id } = params;
    await prisma.finding.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Finding deleted" });
  } catch (error) {
    console.error("Error deleting finding:", error);
    return NextResponse.json(
      { error: "Failed to delete finding" },
      { status: 500 }
    );
  }
}
