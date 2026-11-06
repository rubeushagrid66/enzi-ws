import { revalidatePath } from "next/cache";

/**
 * Invalidate the server-rendered pages that show project data after a
 * mutation, so the homepage and the result viewer serve fresh data on
 * the next visit instead of a cached copy.
 */
export function revalidateProjectPages(slug?: string) {
  revalidatePath("/", "page");
  if (slug) revalidatePath(`/${slug}`, "page");
  revalidatePath("/admin", "page");
}
