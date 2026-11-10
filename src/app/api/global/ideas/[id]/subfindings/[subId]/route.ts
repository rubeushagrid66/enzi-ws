import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

// Fresh reads only — see src/lib/supabase.ts for why the Supabase
// fetch is no-store (stale cache kept returning deleted rows).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Update or delete one sub finding. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string; subId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { fitur, description, images } = body || {};
    const patch: any = {};
    if (typeof fitur === "string") patch.fitur = fitur;
    if (typeof description === "string") patch.description = description;
    if (Array.isArray(images)) {
      patch.images = images
        .filter((im: any) => im && typeof im.image_url === "string" && im.image_url !== "")
        .map((im: any) => ({ image_url: im.image_url, description: typeof im.description === "string" ? im.description : "" }));
    }
    const subFinding = await dbService.updateSubFinding(params.subId, patch);
    revalidateProjectPages();
    return NextResponse.json({ success: true, subFinding });
  } catch (error: any) {
    console.error("Error updating sub finding:", error);
    return NextResponse.json(
      { error: error?.message || "Error updating sub finding" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; subId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbService.deleteSubFinding(params.subId);
    revalidateProjectPages();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting sub finding:", error);
    return NextResponse.json(
      { error: error?.message || "Error deleting sub finding" },
      { status: 500 }
    );
  }
}
