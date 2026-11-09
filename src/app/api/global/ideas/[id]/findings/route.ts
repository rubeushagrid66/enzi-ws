import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

// Fresh reads only — see src/lib/supabase.ts for why the
// Supabase fetch is no-store (stale cache kept returning deleted rows).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * An idea's finding links. GET returns the linked finding ids.
 * PUT replaces them (admin only at the dashboard).
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const findingIds = await dbService.getIdeaFindingIds(params.id);
    return NextResponse.json({ findingIds });
  } catch (error) {
    console.error("Error fetching idea findings:", error);
    return NextResponse.json({ error: "Error fetching idea findings" }, { status: 500 });
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
    const findingIds = await dbService.setIdeaFindings(params.id, body.findingIds || []);
    revalidateProjectPages();
    return NextResponse.json({ success: true, findingIds });
  } catch (error: any) {
    console.error("Error saving idea findings:", error);
    return NextResponse.json(
      { error: error?.message || "Error saving idea findings" },
      { status: 500 }
    );
  }
}
