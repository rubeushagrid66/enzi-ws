import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { getSession, hashPassword, USER_ROLES } from "@/lib/auth";

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
    const { name, role, password, groupId, projectId } = await request.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (role !== undefined && !(USER_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json(
        { error: `role must be one of: ${USER_ROLES.join(", ")}` },
        { status: 400 }
      );
    }
    // groupId / projectId: undefined = leave untouched; null/"" = clear;
    // a string must be an existing group / project.
    const groupIdChanged = groupId !== undefined;
    const cleanGroupId = groupIdChanged
      ? (typeof groupId === "string" && groupId.trim() !== "" ? groupId.trim() : null)
      : undefined;
    const projectIdChanged = projectId !== undefined;
    const cleanProjectId = projectIdChanged
      ? (typeof projectId === "string" && projectId.trim() !== "" ? projectId.trim() : null)
      : undefined;
    if (cleanProjectId && !(await dbService.getProjectById(cleanProjectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 400 });
    }
    if (cleanGroupId && !(await dbService.getGroupById(cleanGroupId))) {
      return NextResponse.json({ error: "Group not found" }, { status: 400 });
    }
    // Resolve the effective assignment against the stored user.
    const current = await dbService.getUserById(params.id);
    if (!current) return NextResponse.json({ error: "User not found" }, { status: 404 });
    let effectiveProjectId: string | null = projectIdChanged ? (cleanProjectId ?? null) : (current.projectId ?? null);
    let effectiveGroupId: string | null = groupIdChanged ? (cleanGroupId ?? null) : (current.groupId ?? null);
    // Clearing the project also clears a kept group (a group belongs to
    // a project); an explicitly set group is handled below instead.
    if (projectIdChanged && cleanProjectId === null && !groupIdChanged) effectiveGroupId = null;
    // A group implies its project: a set group with no project takes
    // the group's project.
    if (effectiveGroupId && !effectiveProjectId && (groupIdChanged || !projectIdChanged)) {
      const group = await dbService.getGroupById(effectiveGroupId);
      if (group) effectiveProjectId = group.projectId;
    }
    // When the project changes and the kept (not explicitly set) group
    // does not belong to the new project, clear the group.
    if (projectIdChanged && effectiveProjectId && !groupIdChanged && effectiveGroupId) {
      const group = await dbService.getGroupById(effectiveGroupId);
      if (group && group.projectId !== effectiveProjectId) effectiveGroupId = null;
    }
    // With both set, the group must belong to the project.
    if (effectiveGroupId && effectiveProjectId) {
      const group = await dbService.getGroupById(effectiveGroupId);
      if (group && group.projectId !== effectiveProjectId) {
        return NextResponse.json({ error: "The selected group does not belong to the selected project" }, { status: 400 });
      }
    }
    // Prevent demoting the last active ADMIN (including yourself).
    if (role && role !== "ADMIN") {
      const users = await dbService.getUsers();
      const target = users.find((u: any) => u.id === params.id);
      if (target?.role === "ADMIN" && (await dbService.countAdmins()) <= 1) {
        return NextResponse.json({ error: "Cannot demote the last admin" }, { status: 400 });
      }
    }
    const passwordHash = password ? await hashPassword(password) : undefined;
    const user = await dbService.updateUser(params.id, { name, role, passwordHash, groupId: effectiveGroupId, projectId: effectiveProjectId });
    // Best-effort: when the assigned group changed, move the user's
    // participant in that group's project into the new group so the
    // "Me" chip follows immediately. Never fails the user save.
    if (effectiveGroupId && effectiveGroupId !== current.groupId) {
      try {
        await dbService.moveUserParticipantToGroup(params.id, user.name, effectiveGroupId);
      } catch {
        // The /me flow moves/creates the participant on next use.
      }
    }
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
