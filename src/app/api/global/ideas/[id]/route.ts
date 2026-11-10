import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

// Fresh reads only — see src/lib/supabase.ts for why the
// Supabase fetch is no-store (stale cache kept returning deleted rows).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Update or delete one idea. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, findingIds, sumber, imageUrl, categoryId, verbatimEvidence } = body;

    const idea = await dbService.updateIdea(params.id, { title, description, sumber, imageUrl, categoryId, verbatimEvidence });
    if (Array.isArray(findingIds)) {
      await dbService.setIdeaFindings(params.id, findingIds);
    }

    revalidateProjectPages();
    return NextResponse.json({ success: true, idea });
  } catch (error: any) {
    console.error("Error updating idea:", error);
    return NextResponse.json(
      { error: error?.message || "Error updating idea" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbService.deleteIdea(params.id);
    revalidateProjectPages();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting idea:", error);
    return NextResponse.json(
      { error: error?.message || "Error deleting idea" },
      { status: 500 }
    );
  }
}
