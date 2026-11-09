import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

// Never serve a cached answer here: a deleted idea must stop showing
// on the finding's detail page immediately.
export const dynamic = "force-dynamic";

/** Ideas linked to one finding — shown on that finding's detail page. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ideas = await dbService.getIdeasForFinding(params.id);
    return NextResponse.json({ ideas });
  } catch (error) {
    console.error("Error fetching finding ideas:", error);
    return NextResponse.json({ error: "Error fetching finding ideas" }, { status: 500 });
  }
}
