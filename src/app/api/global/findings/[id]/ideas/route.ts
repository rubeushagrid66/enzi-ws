import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";

// Never serve a cached answer here: the Idea popup's linked-findings
// checklist must show the current links.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Findings linked to one pool idea (finding). GET returns the linked
 * finding ids; PUT replaces them. This is the reverse of
 * /api/global/ideas/[id]/findings — it lets the Idea edit popup pick
 * its findings from the idea side.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ideas = await dbService.getIdeasForFinding(params.id);
    return NextResponse.json({ ideaIds: ideas.map((i: any) => i.id) });
  } catch (error) {
    console.error("Error fetching finding ideas:", error);
    return NextResponse.json({ error: "Error fetching finding ideas" }, { status: 500 });
  }
}

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
    const ideaIds = await dbService.setFindingIdeas(params.id, body.ideaIds || []);
    return NextResponse.json({ success: true, ideaIds });
  } catch (error) {
    console.error("Failed to set finding ideas:", error);
    return NextResponse.json({ error: "Failed to set finding ideas" }, { status: 500 });
  }
}
