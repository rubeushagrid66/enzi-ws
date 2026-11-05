import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, hashPassword } from "@/lib/auth";

function adminOnly(session: Awaited<ReturnType<typeof getSession>>) {
  return session && session.role === "ADMIN";
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!adminOnly(session)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { name, role, password } = await request.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    // Prevent demoting the last active ADMIN (including yourself).
    if (role && role !== "ADMIN") {
      const users = await dbService.getUsers();
      const target = users.find((u: any) => u.id === params.id);
      if (target?.role === "ADMIN" && (await dbService.countAdmins()) <= 1) {
        return NextResponse.json({ error: "Cannot demote the last admin" }, { status: 400 });
      }
    }
    const passwordHash = password ? await hashPassword(password) : undefined;
    const user = await dbService.updateUser(params.id, { name, role, passwordHash });
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!adminOnly(session)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    if (session!.id === params.id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }
    const users = await dbService.getUsers();
    const target = users.find((u: any) => u.id === params.id);
    if (target?.role === "ADMIN" && (await dbService.countAdmins()) <= 1) {
      return NextResponse.json({ error: "Cannot delete the last admin" }, { status: 400 });
    }
    await dbService.deleteUser(params.id);
    return NextResponse.json({ success: true, message: "User deleted" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
