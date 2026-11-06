import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "enzi-workshop-platform-secret-key-super-secure-change-in-production-2026";
const COOKIE_NAME = "enzi_auth_token";

/** All login roles. The three label roles see only aspects whose label
 *  matches their role; ADMIN and FACILITATOR see everything. */
export const USER_ROLES = ["ADMIN", "FACILITATOR", "Business & Ops", "Product", "Tech"] as const;
export type UserRole = (typeof USER_ROLES)[number];
/** The roles that are also aspect labels (role === aspect label). */
export const LABEL_ROLES = ["Business & Ops", "Product", "Tech"] as const;

export function isLabelRole(role: string | null | undefined): role is (typeof LABEL_ROLES)[number] {
  return role === "Business & Ops" || role === "Product" || role === "Tech";
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
