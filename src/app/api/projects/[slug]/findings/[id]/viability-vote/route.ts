import { NextResponse } from "next/server";
import { dbService, normalizeAspectLabel } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";
import { calculateAllParticipantScores, normalizeFramework } from "@/lib/scoring";

/**
 * Save a viability vote: a 1-3 score + an Alasan (reason) per aspect.
 * Body: { participantId?, aspectId, score, reason? }.
 * - `score` must be 1, 2 or 3, or null to clear the vote (clearing also
 *   clears the reason). `reason` is free text (max 500 chars).
 * - When `participantId` is omitted the vote is recorded as the session
 *   user (their "me" participant row). Any non-admin, non-facilitator
 *   user (label roles, Group and Participant accounts) may only vote
 *   as themselves — naming their own participant is allowed, naming
 *   anyone else is rejected.
 * - ADMIN / FACILITATOR may vote as themselves or as a participant
 *   they name.
 * - LABEL GATE: ideas are no longer assigned to groups — every group
 *   scores every idea — but a voter may only score aspects whose label
 *   matches the role assigned to their group (Product / Tech /
 *   Business & Ops). ADMIN / FACILITATOR voting as themselves are
 *   exempt and score every aspect. An aspect or group without a label
 *   stays open (backward compatible until labels are assigned).
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
    // The project is loaded once here and passed to resolveMeParticipant
    // so the vote does not pay for two full project loads per save.
    const me = await dbService.resolveMeParticipant(params.slug, session, project);
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
    // Only ADMIN / FACILITATOR may vote for a named participant. Every
    // other user (label roles, Group and Participant accounts) records
    // only their own scores — voting as themselves (participantId ===
    // their own "me" row) or omitting participantId (defaults to me)
    // is allowed; voting for anyone else is not. The label gate below
    // then restricts which aspects they may score, by their group's
    // assigned role.
    const isPrivileged = session.role === "ADMIN" || session.role === "FACILITATOR";
    if (participantId && participantId !== me.id && !isPrivileged) {
      return NextResponse.json({ error: "You can only record your own scores" }, { status: 400 });
    }
    if (participantId && isPrivileged) {
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

    // LABEL GATE: ideas are no longer assigned to groups, so there is
    // no assignment check anymore — every group scores every idea. But
    // a voter may only score aspects whose label matches the role
    // assigned to their group (Product / Tech / Business & Ops). The
    // check is on the voter (the participant being scored for), so an
    // admin editing another participant's score is judged by that
    // participant's group, not the admin's own. ADMIN / FACILITATOR
    // scoring as themselves are exempt: they score every aspect.
    // An aspect or group without a label stays open (backward
    // compatible until labels are assigned).
    const aspectLabel = normalizeAspectLabel((aspect as any).label);
    if (aspectLabel && !(isPrivileged && voterId === me.id)) {
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
      const voterGroup = (project.groups || []).find((g: any) => g.id === voterGroupId);
      const voterLabel = normalizeAspectLabel((voterGroup as any)?.label);
      if (voterLabel && voterLabel !== aspectLabel) {
        return NextResponse.json(
          { error: `This aspect is for ${aspectLabel} — your group is assigned ${voterLabel}` },
          { status: 403 }
        );
      }
    }

    // A reason-only update (score omitted) keeps the existing score;
    // an explicit null clears the vote. Look the single vote up
    // directly instead of scanning the project's findings.
    let effectiveScore = score;
    if (score === undefined) {
      const existing = await dbService.getViabilityVote(findingId, voterId, aspectId);
      effectiveScore = (existing as any)?.score ?? null;
    }

    const vote = await dbService.upsertViabilityVote(
      findingId,
      voterId,
      aspectId,
      effectiveScore,
      reason
    );

    // Return the finding's current votes + recomputed participant scores,
    // so the client can update the display from this save response
    // instead of re-fetching the whole project (5-7s) just to read back
    // the vote that was just saved. This is the authoritative state
    // (read from the database after the upsert), so no vote is lost
    // when two saves land close together. Desirability does not change
    // on a vote (it comes from research mentions), so only the
    // participant scores are recomputed here.
    const aspectIdsFor = (dim: string) =>
      (project.viabilityAspects || [])
        .filter((a: any) => normalizeFramework(a.framework) === dim)
        .map((a: any) => a.id);
    const refreshed = await dbService.getFindingsByIds([findingId]);
    const refreshedVotes = refreshed[0]?.viabilityVotes || [];
    const participantScores = calculateAllParticipantScores(
      refreshedVotes,
      aspectIdsFor("Viability"),
      aspectIdsFor("Feasibility")
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
      viabilityVotes: refreshedVotes,
      participantScores,
    });
  } catch (error) {
    console.error("Error saving viability vote:", error);
    return NextResponse.json({ error: "Failed to save viability vote" }, { status: 500 });
  }
}
