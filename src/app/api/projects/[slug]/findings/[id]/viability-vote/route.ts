import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, isLabelRole } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/**
 * Save a viability vote: a 1-3 score + an Alasan (reason) per aspect.
 * Body: { participantId?, aspectId, score, reason? }.
 * - `score` must be 1, 2 or 3, or null to clear the vote (clearing also
 *   clears the reason). `reason` is free text (max 500 chars).
 * - When `participantId` is omitted the vote is recorded as the session
 *   user (their "me" participant row). A label-role user may only vote
 *   as themselves, and only on aspects whose label equals their role.
 * - ADMIN / FACILITATOR may vote on any aspect (as themselves, or as a
 *   participant they name).
 * `isValidated` stays in sync with the score (true exactly when a score
 * is set), so the current Viability formula keeps working unchanged.
 */
export async function POST(
  request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: findingId } = params;
    const body = await request.json();
    const { participantId, aspectId, score, reason } = body;

    if (!aspectId) {
      return NextResponse.json({ error: "Aspect ID is required" }, { status: 400 });
    }
    if (score !== undefined && score !== null && score !== 1 && score !== 2 && score !== 3) {
      return NextResponse.json({ error: "score must be 1, 2, 3 or null to clear the vote" }, { status: 400 });
    }
    if (reason !== undefined && reason !== null && (typeof reason !== "string" || reason.length > 500)) {
      return NextResponse.json({ error: "reason must be text of at most 500 characters" }, { status: 400 });
    }

    const project = await dbService.getProjectBySlug(params.slug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const aspect = (project.viabilityAspects || []).find((a: any) => a.id === aspectId);
    if (!aspect) {
      return NextResponse.json({ error: "Aspect not found" }, { status: 404 });
    }

    // Resolve who is voting. Label-role users always vote as themselves.
    const me = await dbService.resolveMeParticipant(params.slug, session);
    if (!me) {
      // Label-role user assigned to another project: no participant row
      // exists for them here, so they cannot vote in this project.
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
    let voterId = participantId || me.id;
    if (participantId && !isLabelRole(session.role)) {
      // ADMIN / FACILITATOR voting for a named participant: that
      // participant must belong to this project, so a vote can never
      // land on a participant from another project.
      const inProject = (project.groups || []).some((g: any) =>
        (g.participants || []).some((p: any) => p.id === participantId)
      );
      if (!inProject) {
        return NextResponse.json({ error: "That participant does not belong to this project" }, { status: 400 });
      }
    }
    if (isLabelRole(session.role)) {
      if (voterId !== me.id) {
        return NextResponse.json({ error: "You can only record your own scores" }, { status: 400 });
      }
      // A label-role user only scores aspects carrying their label.
      if (aspect.label !== session.role) {
        return NextResponse.json(
          { error: `Your role (${session.role}) can only score aspects labelled ${session.role}` },
          { status: 400 }
        );
      }
    }

    // Group-scoped scoring: a finding assigned to one or more groups
    // may only be scored by participants in those groups. The check is
    // on the voter (the participant being scored for), so an admin
    // editing another participant's score is judged by that
    // participant's group, not the admin's own. A finding with no group
    // assignment yet stays open to anyone in the project, as before.
    const assignedGroupIds = await dbService.getFindingGroupIds(findingId);
    if (assignedGroupIds.length > 0) {
      let voterGroupId: string | null = null;
      if (voterId === me.id) {
        voterGroupId = (me as any).groupId ?? null;
      } else {
        for (const g of project.groups || []) {
          if ((g.participants || []).some((p: any) => p.id === voterId)) {
            voterGroupId = g.id;
            break;
          }
        }
      }
      if (!voterGroupId || !assignedGroupIds.includes(voterGroupId)) {
        return NextResponse.json(
          { error: "This finding is assigned to other groups — only participants in its assigned groups can score it" },
          { status: 403 }
        );
      }
    }

    // A reason-only update (score omitted) keeps the existing score;
    // an explicit null clears the vote.
    let effectiveScore = score;
    if (score === undefined) {
      const f = (project.findings || []).find((x: any) => x.id === findingId);
      const existing = (f?.viabilityVotes || []).find(
        (v: any) => v.participantId === voterId && v.aspectId === aspectId
      );
      effectiveScore = existing?.score ?? null;
    }

    const vote = await dbService.upsertViabilityVote(
      findingId,
      voterId,
      aspectId,
      effectiveScore,
      reason
    );

    revalidateProjectPages(params.slug);
    return NextResponse.json({
      success: true,
      vote: {
        id: vote.id,
        findingId,
        participantId: voterId,
        aspectId,
        isValidated: vote.isValidated ?? vote.is_validated ?? effectiveScore !== null,
        score: vote.score != null ? Number(vote.score) : null,
        reason: vote.reason ?? null,
      },
    });
  } catch (error) {
    console.error("Error saving viability vote:", error);
    return NextResponse.json({ error: "Failed to save viability vote" }, { status: 500 });
  }
}
