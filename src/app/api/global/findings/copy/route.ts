import { NextResponse } from "next/server";
import { dbService, NotFoundError } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/**
 * Copy a finding INTO the global pool (from any project). Only the
 * listing is copied — title, description, tags. Votes, L3 mappings
 * and matrix position are not copied; the pool copy starts Unscored.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    if (!body.findingId) {
      return NextResponse.json({ error: "findingId is required" }, { status: 400 });
    }
    const finding = await dbService.copyFinding(body.findingId, null);
    revalidateProjectPages();
    return NextResponse.json({ success: true, finding });
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }
    console.error("Error copying finding to pool:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to copy finding to pool" },
      { status: 500 }
    );
  }
}
