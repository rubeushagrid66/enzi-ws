import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

// Fresh reads only — see src/lib/supabase.ts for why the Supabase
// fetch is no-store (stale cache kept returning deleted rows).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Sub findings of one finding (idea). GET lists them; POST creates one. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const subFindings = await dbService.getSubFindings(params.id);
    return NextResponse.json({ subFindings });
  } catch (error: any) {
    console.error("Error fetching sub findings:", error);
    return NextResponse.json(
      { error: error?.message || "Error fetching sub findings" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { fitur, description, images } = body || {};
    const cleanImages = Array.isArray(images)
      ? images
          .filter((im: any) => im && typeof im.image_url === "string" && im.image_url !== "")
          .map((im: any) => ({ image_url: im.image_url, description: typeof im.description === "string" ? im.description : "" }))
      : [];
    const subFinding = await dbService.createSubFinding(params.id, {
      fitur: typeof fitur === "string" ? fitur : "",
      description: typeof description === "string" ? description : "",
      images: cleanImages,
    });
    revalidateProjectPages();
    return NextResponse.json({ success: true, subFinding });
  } catch (error: any) {
    console.error("Error creating sub finding:", error);
    return NextResponse.json(
      { error: error?.message || "Error creating sub finding" },
      { status: 500 }
    );
  }
}
