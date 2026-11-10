import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "enzi-workshop-platform-secret-key-super-secure-change-in-production-2026";
const COOKIE_NAME = "enzi_auth_token";

/** All login roles. "Group" and "Participant" are per-group scorer
 *  accounts (one login per group). A login is identified by its role +
 *  group assignment, not by a participant name: the participant names
 *  in a group are informational only. Each group is assigned one of
 *  the three label roles (Product / Tech / Business & Ops), and a
 *  group user may only score the aspects whose label matches their
 *  group's role (the label gate, enforced in the vote API and the
 *  V&F table). ADMIN and FACILITATOR see everything and score every
 *  aspect. */
export const USER_ROLES = ["ADMIN", "FACILITATOR", "Group", "Participant", "Business & Ops", "Product", "Tech"] as const;
export type UserRole = (typeof USER_ROLES)[number];
/** The roles that are also aspect labels (role === aspect label). */
export const LABEL_ROLES = ["Business & Ops", "Product", "Tech"] as const;

export function isLabelRole(role: string | null | undefined): role is (typeof LABEL_ROLES)[number] {
  return role === "Business & Ops" || role === "Product" || role === "Tech";
}

/**
 * Admin gate for config mutation routes: returns a 401 response when
 * logged out, a 403 when the session role is not ADMIN, and null when
 * the caller is an admin. Usage at the top of a mutation handler:
 *   const forbidden = requireAdmin(session);
 *   if (forbidden) return forbidden;
 * Findings edits stay open to any logged-in user, so findings routes,
 * the workshop scoring routes, and participants/me must NOT use this.
 */
export function requireAdmin(session: SessionUser | null): NextResponse | null {
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}

/**
 * Admin-or-facilitator gate: finding → group assignment is done by the
 * people running the workshop (admin and facilitator), not by the
 * participants scoring in it. Returns 401 logged out, 403 for any
 * other role, null when the caller may assign.
 */
export function requireAdminOrFacilitator(session: SessionUser | null): NextResponse | null {
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "FACILITATOR") {
    return NextResponse.json({ error: "Admin or facilitator access required" }, { status: 403 });
  }
  return null;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** The user's assigned project (label-role users), if any. ADMIN /
   *  FACILITATOR work across projects and have none. Drives the
   *  post-login redirect to that project's viewer page. */
  projectId?: string | null;
  projectSlug?: string | null;
}

/**
 * Hash plain password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Compare plain password with hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Sign payload to generate a secure token
 */
export function signToken(payload: SessionUser): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 7 * 24 * 60 * 60; // 7 days
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp })).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode token
 */
export function verifyToken(token: string): SessionUser | null {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;

    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null;
    }

    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      projectId: payload.projectId ?? null,
      projectSlug: payload.projectSlug ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Get current session user from cookies
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
