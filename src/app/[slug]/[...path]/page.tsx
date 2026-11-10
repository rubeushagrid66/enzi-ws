"use client";

import ProjectResultViewer from "../page";

/**
 * Catch-all for the project tab/popup URLs: /{slug}/findings,
 * /{slug}/ideas, /{slug}/group, /{slug}/roadmap,
 * /{slug}/findings/{finding-title}, and (for finding popups) any
 * deeper path. It renders the same project page; the page reads the
 * URL and opens the matching tab/popup. The /{slug}/ideas/{title}
 * popup URL is claimed by the more specific ideas/[id] route instead
 * (see that file), which renders this same component for title slugs.
 */
export default function ProjectSubPage({
  params,
}: {
  params: { slug: string; path: string[] };
}) {
  return <ProjectResultViewer params={{ slug: params.slug }} />;
}
