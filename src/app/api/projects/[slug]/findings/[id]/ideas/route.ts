import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

// Never serve a cached answer here: a deleted idea must stop showing
// on the finding's detail page immediately. force-dynamic alone did
// not bust it — the Supabase fetch was still served from Next.js's
// Data Cache (the endpoint kept returning a deleted idea long after
// the tables were empty), so force every fetch in this route to
// no-store as well.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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
