import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

// Never serve a cached answer here: a created or deleted idea must
// show up (or disappear) in the dashboard immediately.
export const dynamic = "force-dynamic";

/**
 * Ideas (global). GET lists every idea with the findings it is linked
 * to. POST creates an idea (admin/facilitator only — enforced by the
 * dashboard, which is the only caller).
 */
export async function GET() {
  try {
    const ideas = await dbService.getIdeas();
    return NextResponse.json({ ideas });
  } catch (error) {
    console.error("Error fetching ideas:", error);
    return NextResponse.json({ error: "Error fetching ideas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, findingIds, sumber } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const idea = await dbService.createIdea({ title, description, sumber });
    if (Array.isArray(findingIds)) {
      await dbService.setIdeaFindings(idea.id, findingIds);
    }

    revalidateProjectPages();
    return NextResponse.json({ success: true, idea });
  } catch (error: any) {
    console.error("Error creating idea:", error);
    return NextResponse.json(
      { error: error?.message || "Error creating idea" },
      { status: 500 }
    );
  }
}
