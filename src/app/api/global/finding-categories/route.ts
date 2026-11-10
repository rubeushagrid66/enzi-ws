import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, requireAdmin } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/** List all finding categories (global, newest first). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const categories = await dbService.getFindingCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Failed to list finding categories:", error);
    return NextResponse.json({ error: "Failed to list finding categories" }, { status: 500 });
  }
}

/** Create a finding category (admin only). */
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
    const category = await dbService.createFindingCategory(name);
    revalidateProjectPages();
    return NextResponse.json({ success: true, category });
  } catch (error) {
    console.error("Failed to create finding category:", error);
    return NextResponse.json({ error: "Failed to create finding category" }, { status: 500 });
  }
}
