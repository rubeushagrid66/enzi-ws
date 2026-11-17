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

/**
 * Group slug for group URLs (/{slug}/group/{group-slug}): the group's
 * name slugified with hyphens removed, so "Business & Ops" becomes
 * "businessops" and "Tech" stays "tech". Resolvers accept both this
 * form and the hyphenated slugify() form.
 */
export function groupSlug(name: string): string {
  return slugify(name).replace(/-/g, "");
}
