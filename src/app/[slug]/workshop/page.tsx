import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import WorkshopSession from "@/components/WorkshopSession";

/**
 * Facilitator-led workshop scoring (Option 1). One shared screen:
 * the facilitator walks the group through each finding in three steps —
 * map L1–L3 parameters (Desirability), record each participant's votes
 * (Viability), place the consensus position on the matrix (Feasibility).
 * Login required (ADMIN or FACILITATOR); guests cannot open it.
 */
export default async function WorkshopPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return <WorkshopSession slug={params.slug} currentUser={session} />;
}
