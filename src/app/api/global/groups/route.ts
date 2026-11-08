import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";

/**
 * All groups across all projects (id, name, project) — for the
 * dashboard's finding → group assignment picker. Assignment is
 * cross-project, so the picker lists every group's project alongside
 * its name. Any logged-in user can read it; writing goes through the
 * per-finding groups route (admin + facilitator only).
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const groups = await dbService.getAllGroups();
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("Error fetching all groups:", error);
    return NextResponse.json({ error: "Error fetching groups" }, { status: 500 });
  }
}
