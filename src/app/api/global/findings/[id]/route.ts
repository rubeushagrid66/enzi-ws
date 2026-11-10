import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession } from "@/lib/auth";
import { revalidateProjectPages } from "@/lib/revalidate";

/** Edit / delete a finding by id (used by the admin pool tab for pool
 *  findings; project findings keep using their project route). */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const finding = await dbService.updateFinding(params.id, {
      title: body.title,
      description: body.description,
      sumber: body.sumber,
      fitur: body.fitur,
      platform: body.platform,
      tujuan: body.tujuan,
      scopeTermasuk: body.scopeTermasuk,
      scopeTidakTermasuk: body.scopeTidakTermasuk,
      roleUsers: body.roleUsers,
      stepFeatureScreen: body.stepFeatureScreen,
      apaYangBerubah: body.apaYangBerubah,
      outputKeberhasilan: body.outputKeberhasilan,
      tujuanBisnis: body.tujuanBisnis,
    });
    revalidateProjectPages();
    return NextResponse.json({ success: true, finding });
  } catch (error) {
    console.error("Failed to update finding:", error);
    return NextResponse.json({ error: "Failed to update finding" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbService.deleteFinding(params.id);
    revalidateProjectPages();
    return NextResponse.json({ success: true, message: "Finding deleted" });
  } catch (error) {
    console.error("Failed to delete finding:", error);
    return NextResponse.json({ error: "Failed to delete finding" }, { status: 500 });
  }
}
