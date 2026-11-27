import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/** List all business objectives (global, newest first). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const objectives = await dbService.getBusinessObjectives();
    return NextResponse.json({ objectives });
  } catch (error) {
    console.error("Failed to list business objectives:", error);
    return NextResponse.json({ error: "Failed to list business objectives" }, { status: 500 });
  }
}

/** Create a business objective (admin only). */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const forbidden = requireAdmin(session);
    if (forbidden) return forbidden;
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const objective = await dbService.createBusinessObjective(name);
    revalidateProjectPages();
    return NextResponse.json({ success: true, objective });
  } catch (error) {
    console.error("Failed to create business objective:", error);
    return NextResponse.json({ error: "Failed to create business objective" }, { status: 500 });
  }
}
