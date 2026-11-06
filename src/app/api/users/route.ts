import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, hashPassword, USER_ROLES } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const users = await dbService.getUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { name, email, password, role, groupId } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }
    if (role !== undefined && !(USER_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json(
        { error: `role must be one of: ${USER_ROLES.join(", ")}` },
        { status: 400 }
      );
    }
    // groupId: null/empty = no group; otherwise the group must exist.
    const cleanGroupId = typeof groupId === "string" && groupId.trim() !== "" ? groupId.trim() : null;
    if (cleanGroupId && !(await dbService.getGroupById(cleanGroupId))) {
      return NextResponse.json({ error: "Group not found" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const user = await dbService.createUser({ name, email, passwordHash, role, groupId: cleanGroupId });
    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error("Error creating user:", error);
    if (error?.message?.includes("already registered")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
