import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

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
    const { participantId, aspectId, isValidated } = body;

    if (!participantId || !aspectId) {
      return NextResponse.json(
        { error: "Participant ID and Aspect ID are required" },
        { status: 400 }
      );
    }

    const vote = await dbService.upsertViabilityVote(
      findingId,
      participantId,
      aspectId,
      Boolean(isValidated)
    );

    revalidateProjectPages(params.slug);
    return NextResponse.json({ success: true, vote });
  } catch (error) {
    console.error("Error saving viability vote:", error);
    return NextResponse.json(
      { error: "Failed to save viability vote" },
      { status: 500 }
    );
  }
}
