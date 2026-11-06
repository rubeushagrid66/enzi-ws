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
    let voterId = participantId || me.id;
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
