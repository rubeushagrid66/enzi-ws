/**
 * Shared slug helper (server + client). URL-safe, lowercase, hyphens.
 * Returns "" when the name contains no usable characters — callers fall
 * back to the existing slug in that case.
 */
export function slugify(name: string): string {
  return (name || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
