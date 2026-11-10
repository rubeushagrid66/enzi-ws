import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/**
 * Global findings pool. GET lists every finding — pool findings
 * (projectId null) plus each project's findings — labelled with their
 * origin. POST creates a POOL finding (belongs to no project yet).
 */
export async function GET() {
  try {
    const findings = await dbService.getAllFindings();
    return NextResponse.json({ findings });
  } catch (error) {
    console.error("Error fetching findings pool:", error);
    return NextResponse.json({ error: "Error fetching findings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, sumber, fitur, platform, tujuan, scopeTermasuk, scopeTidakTermasuk, roleUsers, roleUsersTidakTermasuk, stepFeatureScreen, stepTidakTermasuk, apaYangBerubah, apaYangBerubahTidakTermasuk, outputKeberhasilan, tujuanBisnis } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const finding = await dbService.createFinding(null, {
      title,
      description,
      sumber,
      fitur,
      platform,
      tujuan,
      scopeTermasuk,
      scopeTidakTermasuk,
      roleUsers,
      roleUsersTidakTermasuk,
      stepFeatureScreen,
      stepTidakTermasuk,
      apaYangBerubah,
      apaYangBerubahTidakTermasuk,
      outputKeberhasilan,
      tujuanBisnis,
    });

    revalidateProjectPages();
    return NextResponse.json({ success: true, finding });
  } catch (error: any) {
    console.error("Error creating pool finding:", error);
    return NextResponse.json(
      { error: error?.message || "Error creating finding" },
      { status: 500 }
    );
  }
}
