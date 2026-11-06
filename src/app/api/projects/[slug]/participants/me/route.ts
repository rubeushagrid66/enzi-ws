import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";

/**
 * Resolve the participant row the session user votes as ("me") in this
 * project: the row already linked to their login id, else a row with
 * their name (linked on the spot), else a newly created row. Never
 * creates a duplicate for the same user.
 */
export async function POST(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const participant = await dbService.resolveMeParticipant(params.slug, session);
    if (!participant) {
      // Label-role user assigned to another project: they can look but
      // cannot score here (no participant row was created or linked).
      // The assignment may come from their project, or from their
      // group (whose project implies it).
      const user = await dbService.getUserById(session.id).catch(() => null);
      let assigned: { name: string } | null = null;
      if (user?.projectId) {
        assigned = await dbService.getProjectById(user.projectId).catch(() => null);
      } else if (user?.groupId) {
        const g = await dbService.getGroupById(user.groupId).catch(() => null);
        if (g) assigned = await dbService.getProjectById(g.projectId).catch(() => null);
      }
      return NextResponse.json(
        { error: `This user is assigned to ${assigned?.name ?? "another project"} and cannot score in this project` },
        { status: 403 }
      );
    }
    return NextResponse.json({ success: true, participant });
  } catch (error: any) {
    console.error("Error resolving voter participant:", error);
    if (error?.name === "NotFoundError") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to resolve voter participant" }, { status: 500 });
  }
}
