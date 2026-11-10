import { supabase, isSupabaseConfigured } from "./supabase";
import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { slugify } from "./slugify";
import { USER_ROLES, isLabelRole } from "./auth";

/**
 * Unified Database Service supporting both:
 * 1. Supabase REST API (using only NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY / VITE_*)
 * 2. Prisma ORM (using DATABASE_URL)
 */

/** Thrown when an update/delete matches no row (stale slug, deleted
 *  project). Routes map this to 404 instead of a generic 500. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** PostgREST "no rows" for .single(), and Prisma's record-not-found. */
function isRowNotFound(error: any): boolean {
  if (!error) return false;
  if (error instanceof NotFoundError) return true;
  if (error.code === "PGRST116" || error.code === "P2025") return true;
  return /row.*not found|record.*not found|no rows/i.test(error.message || "");
}

function toNotFoundError(error: any, message: string): Error {
  return isRowNotFound(error) ? new NotFoundError(message) : error;
}

/** The `users` columns that only exist after the global-setup SQL steps
 *  (group_id: Step 6, project_id: Step 7). PostgREST names the missing
 *  column in its error, so a fallback must drop ONLY that column — the
 *  old "drop both" fallback hid the group assignment as soon as Step 7
 *  lagged behind Step 6. Returns the reduced column list, or null when
 *  the error is not about these columns. */
function withoutMissingUserCols(cols: string[], errorMessage: string): string[] | null {
  const missing = (errorMessage.match(/group_id|project_id/gi) || []).map((s) => s.toLowerCase());
  if (missing.length === 0) return null;
  const drop = new Set(missing);
  const next = cols.filter((c) => !drop.has(c));
  return next.length === cols.length ? null : next;
}

/** Run a users SELECT, retrying with only the PostgREST-named missing
 *  column dropped (up to two retries, so both columns can fall away). */
async function usersSelectWithFallback(run: (cols: string) => PromiseLike<any>): Promise<any> {
  let cols = ["id", "name", "email", "role", "is_active", "group_id", "project_id", "created_at"];
  let res = await run(cols.join(", "));
  for (let attempt = 0; attempt < 2 && res.error; attempt++) {
    const reduced = withoutMissingUserCols(cols, res.error.message || "");
    if (!reduced) break;
    console.warn(`users column missing (${cols.filter((c) => !reduced.includes(c)).join(", ")}) — continuing without it; run docs/global-setup-sql.md (Steps 6–7).`);
    cols = reduced;
    res = await run(cols.join(", "));
  }
  return res;
}

/** Hint shown when a global structure is missing in Supabase. */
export const GLOBAL_SQL_HINT =
  "Global setup is not enabled yet — run docs/global-setup-sql.md in the Supabase SQL editor.";

/** The only allowed aspect labels. A label groups an aspect for the
 *  viability scoring formula (stored and displayed only for now). */
export const ASPECT_LABELS = ["Business & Ops", "Product", "Tech"] as const;
export type AspectLabel = (typeof ASPECT_LABELS)[number];

/** Normalise a label input: a valid label passes through, anything
 *  else (null, empty string, unknown value) becomes null (no label). */
export function normalizeAspectLabel(label: unknown): AspectLabel | null {
  return typeof label === "string" && (ASPECT_LABELS as readonly string[]).includes(label)
    ? (label as AspectLabel)
    : null;
}

/** Normalise a user-role input: a known role passes through, anything
 *  else becomes FACILITATOR (the previous behaviour for non-ADMIN). */
export function normalizeUserRole(role: unknown): string {
  return typeof role === "string" && (USER_ROLES as readonly string[]).includes(role)
    ? role
    : "FACILITATOR";
}

export { isLabelRole };

/** Parse a global_settings value (jsonb object from Supabase, or a JSON
 *  string from Prisma) into a weights array, or null when unusable. */
function parseGlobalWeights(value: any): Array<{ name: string; weight: number }> | null {
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(v) || v.length === 0) return null;
    const weights = v
      .filter((w: any) => w && typeof w.name === "string" && Number.isFinite(Number(w.weight)))
      .map((w: any) => ({ name: w.name, weight: Number(w.weight) }));
    return weights.length > 0 ? weights : null;
  } catch {
    return null;
  }
}

/** Map raw Supabase parameters_l1 rows (with nested L2/L3) to the
 *  shape the rest of the app uses. */
function mapL1Rows(rows: any[]): any[] {
  return (rows || []).map((l1: any) => ({
    id: l1.id,
    name: l1.name,
    scoringRules: typeof l1.scoring_rules === "string" ? l1.scoring_rules : JSON.stringify(l1.scoring_rules || []),
    subCategories: (l1.subCategories || []).map((l2: any) => ({
      id: l2.id,
      name: l2.name,
      segments: l2.segments || [],
    })),
  }));
}

export const dbService = {
  async getProjects() {
    // Home-page cards show the weights: once the global weights exist
    // every project shows the same global D/V/F (see getGlobalWeights).
    if (isSupabaseConfigured && supabase) {
      // The weights lookup and the projects list are independent — run
      // them together instead of one after the other.
      const [globalWeights, projectsRes] = await Promise.all([
        dbService.getGlobalWeights(),
        supabase
          .from("projects")
          .select(`
            *,
            findings(count),
            groups(count),
            viability_aspects(count),
            framework_weights(*)
          `)
          .order("created_at", { ascending: false }),
      ]);
      const { data, error } = projectsRes;

      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        isActive: p.is_active,
        createdAt: p.created_at,
        _count: {
          findings: p.findings?.[0]?.count ?? 0,
          groups: p.groups?.[0]?.count ?? 0,
          viabilityAspects: p.viability_aspects?.[0]?.count ?? 0,
        },
        frameworkWeights: globalWeights ?? (p.framework_weights || []).map((fw: any) => ({
          name: fw.name,
          weight: Number(fw.weight),
        })),
      }));
    }

    const [globalWeights, projects] = await Promise.all([
      dbService.getGlobalWeights(),
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              findings: true,
              groups: true,
              viabilityAspects: true,
            },
          },
          frameworkWeights: true,
        },
      }),
    ]);

    if (globalWeights) {
      return projects.map((p: any) => ({ ...p, frameworkWeights: globalWeights }));
    }
    return projects;
  },

  async getProjectBySlug(slug: string) {
    if (isSupabaseConfigured && supabase) {
      const { data: project, error } = await supabase
        .from("projects")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error || !project) return null;

      // Parallel fetch related tables. Weights and the L1 tree are
      // GLOBAL when the global setup exists (see docs/global-setup-sql.md):
      // the global rows win, each project's own rows are the fallback
      // for before the SQL is run — so existing scores never change.
      const [weightsRes, aspectsRes, groupsRes, l1Res, findingsRes, globalWeights] =
        await Promise.all([
          supabase.from("framework_weights").select("*").eq("project_id", project.id),
          supabase.from("viability_aspects").select("*").eq("project_id", project.id).order("created_at", { ascending: true }),
          supabase.from("groups").select("*, participants(*)").eq("project_id", project.id).order("created_at", { ascending: true }),
          // One query for both the global tree (project_id null) and
          // the project's own tree; the global rows win below when
          // present, exactly as before.
          supabase.from("parameters_l1").select("*, subCategories:parameters_l2(*, segments:parameters_l3(*))").or(`project_id.is.null,project_id.eq.${project.id}`).order("created_at", { ascending: true }),
          supabase.from("findings").select("*, viabilityVotes:viability_votes(*)").eq("project_id", project.id).order("created_at", { ascending: true }),
          dbService.getGlobalWeights(),
        ]);

      const l1All = l1Res.data || [];
      const l1Global = l1All.filter((r: any) => !r.project_id);
      const l1Rows = l1Global.length > 0 ? l1Global : l1All.filter((r: any) => r.project_id === project.id);
      // Ideas tab = everything this project's groups work on: the
      // project's own findings PLUS any finding assigned to one of its
      // groups (which may belong to another project, or to no project
      // at all). Without this, a group can hold ideas that never appear
      // in the project's Ideas listing.
      const ownFindings = findingsRes.data || [];
      const ownIds = new Set(ownFindings.map((f: any) => f.id));
      const projectGroupIds = (groupsRes.data || []).map((g: any) => g.id).filter(Boolean);
      let assignedFindings: any[] = [];
      if (projectGroupIds.length > 0) {
        const { data: links } = await supabase
          .from("finding_groups")
          .select("finding_id")
          .in("group_id", projectGroupIds);
        const assignedIds = Array.from(
          new Set(((links as any[]) || []).map((r: any) => r.finding_id).filter(Boolean))
        ).filter((id: string) => !ownIds.has(id));
        if (assignedIds.length > 0) {
          const { data: assigned } = await supabase
            .from("findings")
            .select("*, viabilityVotes:viability_votes(*)")
            .in("id", assignedIds)
            .order("created_at", { ascending: true });
          assignedFindings = assigned || [];
        }
      }
      const allFindingsData = [...ownFindings, ...assignedFindings];
      // Group assignment (Step 10): which groups each finding is
      // assigned to. A missing table reads as no assignment.
      const groupMap = await dbService.getFindingsGroupMap(
        allFindingsData.map((f: any) => f.id)
      );

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        isActive: project.is_active,
        // Research basis N (Step 9 SQL adds the columns; missing means
        // not set yet — D cannot be computed for that source).
        interviewN: project.interview_n != null ? Number(project.interview_n) : null,
        surveyN: project.survey_n != null ? Number(project.survey_n) : null,
        frameworkWeights: globalWeights ?? (weightsRes.data || []).map((w: any) => ({
          id: w.id,
          name: w.name,
          weight: Number(w.weight),
        })),
        viabilityAspects: (aspectsRes.data || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          createdAt: a.created_at ?? null,
          // The framework column only exists after the SQL in
          // docs/aspect-framework-sql.md is run; until then every aspect
          // reads as Viability, exactly as before. Same for the label
          // column (docs/global-setup-sql.md, Step 1): missing means null.
          framework: a.framework ?? "Viability",
          label: a.label ?? null,
          description: a.description,
          isActive: a.is_active,
        })),
        groups: (groupsRes.data || []).map((g: any) => ({
          id: g.id,
          name: g.name,
          createdAt: g.created_at ?? null,
          // The label role assigned to this group (Product / Tech /
          // Business & Ops). The label gate reads it from here, so it
          // must be included — dropping it silently opens the gate.
          label: g.label ?? null,
          isActive: g.is_active,
          participants: (g.participants || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            roleTitle: p.role_title,
            // The user_id column only exists after the SQL in
            // docs/global-setup-sql.md (Step 5); missing means null.
            userId: p.user_id ?? null,
            isActive: p.is_active,
          })),
        })),
        parametersL1: mapL1Rows(l1Rows || []),
        findings: allFindingsData.map((f: any) => ({
          id: f.id,
          title: f.title,
          description: f.description,
          tags: typeof f.tags === "string" ? f.tags : JSON.stringify(f.tags || []),
          // Idea detail fields (same columns as getAllFindings; missing
          // means not entered yet). The project page's idea popup reads
          // these — without them it shows only title + description.
          // Role / Step / Apa Yang Berubah are split per Scope side:
          // the plain field is the Termasuk side, the *_tidak_termasuk
          // field is the Tidak Termasuk side.
          tujuan: f.tujuan ?? "",
          scopeTermasuk: f.scope_termasuk ?? "",
          scopeTidakTermasuk: f.scope_tidak_termasuk ?? "",
          roleUsers: f.role_users ?? "",
          roleUsersTidakTermasuk: f.role_users_tidak_termasuk ?? "",
          stepFeatureScreen: f.step_feature_screen ?? "",
          stepTidakTermasuk: f.step_feature_screen_tidak_termasuk ?? "",
          apaYangBerubah: f.apa_yang_berubah ?? "",
          apaYangBerubahTidakTermasuk: f.apa_yang_berubah_tidak_termasuk ?? "",
          outputKeberhasilan: f.output_keberhasilan ?? "",
          tujuanBisnis: f.tujuan_bisnis ?? "",
          // Null stays null: an unplaced finding has no feasibility
          // position. The UI may display it at 50/50 as a neutral
          // default, but null is what marks it "not yet scored".
          feasibilityX: f.feasibility_x != null ? Number(f.feasibility_x) : null,
          feasibilityY: f.feasibility_y != null ? Number(f.feasibility_y) : null,
          feasibilityQuadrant: f.feasibility_quadrant,
          feasibilityImpact: f.feasibility_impact,
          feasibilityEffort: f.feasibility_effort,
          // True only when the card was dragged to a manual pin (Step 8
          // SQL adds the column; missing means computed position).
          feasibilityManual: f.feasibility_manual === true,
          // Research mentions (Step 9 SQL adds the columns; missing
          // means not entered yet — D is unscored, never 0).
          interviewMentions: f.interview_mentions != null ? Number(f.interview_mentions) : null,
          surveyMentions: f.survey_mentions != null ? Number(f.survey_mentions) : null,
          // Group assignment (Step 10): the groups this finding is
          // assigned to; [] when unassigned.
          groupIds: groupMap[f.id] || [],
          viabilityVotes: (f.viabilityVotes || []).map((v: any) => ({
            id: v.id,
            participantId: v.participant_id,
            aspectId: v.aspect_id,
            isValidated: v.is_validated,
            // score/reason columns only exist after the SQL in
            // docs/global-setup-sql.md (Step 5); missing means null.
            score: v.score != null ? Number(v.score) : null,
            reason: v.reason ?? null,
          })),
        })),
      };
    }

    // Prisma fallback — same global-first resolution as the Supabase
    // branch above: global weights / global L1 tree win when present,
    // the project's own rows are the fallback.
    const project = await prisma.project.findUnique({
      where: { slug },
      include: {
        frameworkWeights: true,
        viabilityAspects: { orderBy: { createdAt: "asc" } },
        groups: {
          include: { participants: { orderBy: { createdAt: "asc" } } },
          orderBy: { createdAt: "asc" },
        },
        parametersL1: {
          include: {
            subCategories: {
              include: { segments: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        findings: {
          include: {
            viabilityVotes: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!project) return null;
    const [globalWeights, globalL1] = await Promise.all([
      dbService.getGlobalWeights(),
      prisma.parameterL1.findMany({
        where: { projectId: null },
        include: { subCategories: { include: { segments: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    if (globalWeights) (project as any).frameworkWeights = globalWeights;
    if (globalL1.length > 0) (project as any).parametersL1 = globalL1;
    // Ideas tab = the project's own findings PLUS any finding assigned
    // to one of its groups (same rule as the Supabase branch above).
    const prismaOwnIds = new Set((project.findings || []).map((f: any) => f.id));
    const prismaGroupIds = (project.groups || []).map((g: any) => g.id).filter(Boolean);
    let prismaAssigned: any[] = [];
    if (prismaGroupIds.length > 0) {
      const idLists = await Promise.all(prismaGroupIds.map((gid: string) => dbService.getGroupFindingIds(gid)));
      const assignedIds = Array.from(new Set(idLists.flat())).filter((id: string) => !prismaOwnIds.has(id));
      if (assignedIds.length > 0) prismaAssigned = await dbService.getFindingsByIds(assignedIds);
    }
    const prismaAllFindings = [...(project.findings || []), ...prismaAssigned];
    // Group assignment (Step 10) on each finding; [] when unassigned.
    const prismaGroupMap = await dbService.getFindingsGroupMap(
      prismaAllFindings.map((f: any) => f.id)
    );
    (project as any).findings = prismaAllFindings.map((f: any) => ({
      ...f,
      groupIds: prismaGroupMap[f.id] || [],
    }));
    return project;
  },

  // ── Global settings (weights / parameters / findings pool) ────────────────

  /** The global D/V/F weights, or null when the global setup does not
   *  exist yet (callers fall back to the project's own weights). */
  async getGlobalWeights(): Promise<Array<{ name: string; weight: number }> | null> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from("global_settings")
          .select("value")
          .eq("key", "framework_weights")
          .maybeSingle();
        if (error || !data) return null;
        return parseGlobalWeights(data.value);
      } catch {
        return null;
      }
    }
    try {
      const row = await prisma.globalSetting.findUnique({ where: { key: "framework_weights" } });
      return row ? parseGlobalWeights(row.value) : null;
    } catch {
      return null;
    }
  },

  /** Save the global D/V/F weights. Throws a clear error naming the
   *  SQL file when the global_settings table does not exist yet. */
  async updateGlobalWeights(weights: Array<{ name: string; weight: number }>) {
    const clean = weights.map((w) => ({ name: w.name, weight: Number(w.weight) }));
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("global_settings")
        .upsert(
          { key: "framework_weights", value: clean, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) {
        if (/global_settings|relation .* does not exist|PGRST205/i.test(error.message || "")) {
          throw new Error(GLOBAL_SQL_HINT);
        }
        throw error;
      }
      return clean;
    }
    await prisma.globalSetting.upsert({
      where: { key: "framework_weights" },
      update: { value: JSON.stringify(clean) },
      create: { key: "framework_weights", value: JSON.stringify(clean) },
    });
    return clean;
  },

  /** The global L1–L3 tree (project_id null rows), or [] when the
   *  global setup does not exist yet. Callers fall back to the
   *  project's own tree. */
  async getGlobalParameters(): Promise<any[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from("parameters_l1")
          .select("*, subCategories:parameters_l2(*, segments:parameters_l3(*))")
          .is("project_id", null)
          .order("created_at", { ascending: true });
        if (error || !data) return [];
        return mapL1Rows(data);
      } catch {
        return [];
      }
    }
    const rows = await prisma.parameterL1.findMany({
      where: { projectId: null },
      include: { subCategories: { include: { segments: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((l1: any) => ({
      id: l1.id,
      name: l1.name,
      scoringRules: l1.scoringRules,
      subCategories: (l1.subCategories || []).map((l2: any) => ({
        id: l2.id,
        name: l2.name,
        segments: l2.segments || [],
      })),
    }));
  },

  /** All findings: the global pool (project_id null) plus every
   *  project's findings, each labelled with its origin. Used by the
   *  admin findings pool tab and the workshop "select from pool" picker. */
  async getAllFindings(): Promise<any[]> {
    if (isSupabaseConfigured && supabase) {
      const [findingsRes, projectsRes] = await Promise.all([
        supabase.from("findings").select("*").order("created_at", { ascending: true }),
        supabase.from("projects").select("id, slug, name"),
      ]);
      const byId = new Map((projectsRes.data || []).map((p: any) => [p.id, p]));
      const allGroupMap = await dbService.getFindingsGroupMap(
        (findingsRes.data || []).map((f: any) => f.id)
      );
      return (findingsRes.data || []).map((f: any) => {
        const proj = f.project_id ? byId.get(f.project_id) : null;
        return {
          id: f.id,
          title: f.title,
          description: f.description,
          createdAt: f.created_at ?? null,
          // Idea detail fields (docs/findings-category-and-idea-fields-
          // sql.md adds the columns; missing means not entered yet).
          // Role / Step / Apa Yang Berubah are split per Scope side:
          // the plain field is Termasuk, *_tidak_termasuk is Tidak Termasuk.
          tujuan: f.tujuan ?? "",
          scopeTermasuk: f.scope_termasuk ?? "",
          scopeTidakTermasuk: f.scope_tidak_termasuk ?? "",
          roleUsers: f.role_users ?? "",
          roleUsersTidakTermasuk: f.role_users_tidak_termasuk ?? "",
          stepFeatureScreen: f.step_feature_screen ?? "",
          stepTidakTermasuk: f.step_feature_screen_tidak_termasuk ?? "",
          apaYangBerubah: f.apa_yang_berubah ?? "",
          apaYangBerubahTidakTermasuk: f.apa_yang_berubah_tidak_termasuk ?? "",
          outputKeberhasilan: f.output_keberhasilan ?? "",
          tujuanBisnis: f.tujuan_bisnis ?? "",
          tags: typeof f.tags === "string" ? f.tags : JSON.stringify(f.tags || []),
          feasibilityX: f.feasibility_x != null ? Number(f.feasibility_x) : null,
          feasibilityY: f.feasibility_y != null ? Number(f.feasibility_y) : null,
          feasibilityQuadrant: f.feasibility_quadrant,
          // Research mentions (Step 9 SQL adds the columns; missing
          // means not entered yet).
          interviewMentions: f.interview_mentions != null ? Number(f.interview_mentions) : null,
          surveyMentions: f.survey_mentions != null ? Number(f.survey_mentions) : null,
          groupIds: allGroupMap[f.id] || [],
          projectId: f.project_id ?? null,
          projectSlug: proj?.slug ?? null,
          projectName: proj?.name ?? null,
        };
      });
    }
    const rows = await prisma.finding.findMany({
      include: { project: { select: { slug: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const prismaAllGroupMap = await dbService.getFindingsGroupMap(rows.map((f: any) => f.id));
    return rows.map((f: any) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      tags: f.tags,
      feasibilityX: f.feasibilityX,
      feasibilityY: f.feasibilityY,
      feasibilityQuadrant: f.feasibilityQuadrant,
      interviewMentions: f.interviewMentions ?? null,
      surveyMentions: f.surveyMentions ?? null,
      groupIds: prismaAllGroupMap[f.id] || [],
      projectId: f.projectId ?? null,
      projectSlug: f.project?.slug ?? null,
      projectName: f.project?.name ?? null,
    }));
  },

  /** Pool findings only (project_id null). */
  async getFindingById(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("findings").select("*").eq("id", id).maybeSingle();
      if (error || !data) return null;
      return data;
    }
    return prisma.finding.findUnique({ where: { id } });
  },

  // ── Finding → group assignment (Step 10 SQL) ─────────────────────────
  // A finding can be assigned to one or more groups, in its own project
  // or in the other project — assignment is always to a group, never
  // directly to a project. The assignment puts the finding inside that
  // group's view and scopes scoring to that group's participants. A
  // missing finding_groups table (Step 10 not run yet) reads as "no
  // assignment", so scoring stays open as before.

  /** Group ids a finding is assigned to (empty when unassigned). */
  async getFindingGroupIds(findingId: string): Promise<string[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("finding_groups")
        .select("group_id")
        .eq("finding_id", findingId);
      if (error || !data) return [];
      return (data as any[]).map((r: any) => r.group_id).filter(Boolean);
    }
    try {
      const rows = await prisma.$queryRaw<Array<{ group_id: string }>>`
        SELECT group_id FROM finding_groups WHERE finding_id = ${findingId}
      `;
      return rows.map((r: any) => r.group_id).filter(Boolean);
    } catch {
      return [];
    }
  },

  /** Group ids for many findings at once: { findingId: [groupId...] }. */
  async getFindingsGroupMap(findingIds: string[]): Promise<Record<string, string[]>> {
    const map: Record<string, string[]> = {};
    if (!findingIds || findingIds.length === 0) return map;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("finding_groups")
        .select("finding_id, group_id")
        .in("finding_id", findingIds);
      if (error || !data) return map;
      for (const r of data as any[]) {
        if (!r.finding_id || !r.group_id) continue;
        (map[r.finding_id] ||= []).push(r.group_id);
      }
      return map;
    }
    try {
      const rows = await prisma.$queryRaw<Array<{ finding_id: string; group_id: string }>>`
        SELECT finding_id, group_id FROM finding_groups WHERE finding_id IN (${Prisma.join(findingIds)})
      `;
      for (const r of rows) {
        if (!r.finding_id || !r.group_id) continue;
        (map[r.finding_id] ||= []).push(r.group_id);
      }
    } catch {
      // No finding_groups table yet (Step 10 not run) — no assignments.
    }
    return map;
  },

  /** Finding ids assigned to one group. */
  async getGroupFindingIds(groupId: string): Promise<string[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("finding_groups")
        .select("finding_id")
        .eq("group_id", groupId);
      if (error || !data) return [];
      return (data as any[]).map((r: any) => r.finding_id).filter(Boolean);
    }
    try {
      const rows = await prisma.$queryRaw<Array<{ finding_id: string }>>`
        SELECT finding_id FROM finding_groups WHERE group_id = ${groupId}
      `;
      return rows.map((r: any) => r.finding_id).filter(Boolean);
    } catch {
      return [];
    }
  },

  /** Replace a finding's group assignment (admin + facilitator only at
   *  the route). Unknown group ids are dropped, so a deleted group
   *  never leaves a dangling assignment behind. */
  async setFindingGroups(findingId: string, groupIds: string[]): Promise<string[]> {
    const clean = Array.from(new Set((groupIds || []).filter((g) => typeof g === "string" && g.trim() !== "")));
    if (isSupabaseConfigured && supabase) {
      // Only keep groups that exist (any project — assignment is
      // cross-project by design).
      let valid = clean;
      if (clean.length > 0) {
        const { data } = await supabase.from("groups").select("id").in("id", clean);
        const existing = new Set(((data as any[]) || []).map((g: any) => g.id));
        valid = clean.filter((g) => existing.has(g));
      }
      const del = await supabase.from("finding_groups").delete().eq("finding_id", findingId);
      if (del.error) throw del.error;
      if (valid.length > 0) {
        const ins = await supabase
          .from("finding_groups")
          .insert(valid.map((group_id) => ({ finding_id: findingId, group_id })));
        if (ins.error) throw ins.error;
      }
      return valid;
    }
    // Prisma branch (local dev): raw SQL against the finding_groups
    // table; a missing table means Step 10 has not been created here.
    await prisma.$executeRaw`DELETE FROM finding_groups WHERE finding_id = ${findingId}`;
    for (const gid of clean) {
      const exists = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Group" WHERE id = ${gid}
      `;
      if (exists.length === 0) continue;
      await prisma.$executeRaw`
        INSERT INTO finding_groups (finding_id, group_id) VALUES (${findingId}, ${gid})
        ON CONFLICT (finding_id, group_id) DO NOTHING
      `;
    }
    return this.getFindingGroupIds(findingId);
  },

  // ── Ideas ───────────────────────────────────────────────────────────────────
  // Ideas are global (like the findings pool): an idea is created in
  // the admin and linked to 1 or many findings. A finding shows its
  // linked ideas on its detail page. The link is the idea_findings
  // join table (idea_id, finding_id), mirroring finding_groups.

  /** All ideas, each with the ids of the findings it is linked to. */
  async getIdeas(): Promise<any[]> {
    if (isSupabaseConfigured && supabase) {
      const [ideasRes, linksRes] = await Promise.all([
        supabase.from("ideas").select("*").order("created_at", { ascending: true }),
        supabase.from("idea_findings").select("idea_id, finding_id"),
      ]);
      const linkMap: Record<string, string[]> = {};
      for (const r of (linksRes.data as any[]) || []) {
        if (!r.idea_id || !r.finding_id) continue;
        (linkMap[r.idea_id] ||= []).push(r.finding_id);
      }
      return (ideasRes.data || []).map((i: any) => ({
        id: i.id,
        title: i.title,
        description: i.description || "",
        sumber: Array.isArray(i.sumber) ? i.sumber : [],
        imageUrl: i.image_url || null,
        categoryId: i.category_id ?? null,
        verbatimEvidence: i.verbatim_evidence || "",
        findingIds: linkMap[i.id] || [],
        createdAt: i.created_at,
      }));
    }
    try {
      const rows = await prisma.$queryRaw<Array<{ id: string; title: string; description: string; created_at: string }>>`
        SELECT id, title, description, created_at FROM ideas ORDER BY created_at ASC
      `;
      const links = await prisma.$queryRaw<Array<{ idea_id: string; finding_id: string }>>`
        SELECT idea_id, finding_id FROM idea_findings
      `;
      const linkMap: Record<string, string[]> = {};
      for (const r of links) (linkMap[r.idea_id] ||= []).push(r.finding_id);
      return rows.map((i: any) => ({
        id: i.id,
        title: i.title,
        description: i.description || "",
        findingIds: linkMap[i.id] || [],
        createdAt: i.created_at,
      }));
    } catch {
      return [];
    }
  },

  async createIdea(data: { title: string; description?: string; sumber?: string[]; imageUrl?: string | null; categoryId?: string | null; verbatimEvidence?: string | null }) {
    if (isSupabaseConfigured && supabase) {
      // image_url is only sent when an image was uploaded — so a
      // create never fails on a production table that doesn't have the
      // column yet (the SQL adds it; see supabase-schema.sql).
      const row: any = { title: data.title, description: data.description || "", sumber: data.sumber || [] };
      if (data.imageUrl) row.image_url = data.imageUrl;
      if (data.categoryId) row.category_id = data.categoryId;
      if (data.verbatimEvidence) row.verbatim_evidence = data.verbatimEvidence;
      const { data: idea, error } = await supabase
        .from("ideas")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return idea;
    }
    const id = `idea_${Date.now()}`;
    await prisma.$executeRaw`
      INSERT INTO ideas (id, title, description) VALUES (${id}, ${data.title}, ${data.description || ""})
    `;
    return { id, title: data.title, description: data.description || "", sumber: data.sumber || [] };
  },

  async updateIdea(id: string, data: { title?: string; description?: string; sumber?: string[]; imageUrl?: string | null; categoryId?: string | null; verbatimEvidence?: string | null }) {
    if (isSupabaseConfigured && supabase) {
      const patch: any = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.description !== undefined) patch.description = data.description;
      if (data.sumber !== undefined) patch.sumber = data.sumber;
      // verbatimEvidence undefined = leave it alone; empty string =
      // clear it; a string = set it. Only sent when the form actually
      // carries the field, so an edit from an older client never fails
      // on a production table that doesn't have the column yet.
      if (data.verbatimEvidence !== undefined) patch.verbatim_evidence = data.verbatimEvidence || null;
      // categoryId undefined = leave it alone; null = clear it; a
      // string = assign it. Only sent when the form actually carries
      // the field, so an edit from an older client never fails on a
      // production table that doesn't have the column yet.
      if (data.categoryId !== undefined) patch.category_id = data.categoryId;
      // imageUrl undefined = leave the image alone; null = remove it;
      // a string = replace it. Only sent when the image actually
      // changed, so an edit that doesn't touch the image never fails
      // on a production table that doesn't have the column yet.
      if (data.imageUrl !== undefined) patch.image_url = data.imageUrl;
      patch.updated_at = new Date().toISOString();
      let { data: idea, error } = await supabase.from("ideas").update(patch).eq("id", id).select().single();
      // Safety net: if the image_url column doesn't exist yet in
      // production, retry the save without the image instead of
      // failing the whole edit.
      if (error && data.imageUrl !== undefined && String((error as any)?.message || "").includes("image_url")) {
        delete patch.image_url;
        ({ data: idea, error } = await supabase.from("ideas").update(patch).eq("id", id).select().single());
      }
      // Same safety net for verbatim_evidence: retry without it
      // instead of failing the whole edit.
      if (error && data.verbatimEvidence !== undefined && String((error as any)?.message || "").includes("verbatim_evidence")) {
        delete patch.verbatim_evidence;
        ({ data: idea, error } = await supabase.from("ideas").update(patch).eq("id", id).select().single());
      }
      if (error) throw error;
      return idea;
    }
    if (data.title !== undefined) {
      await prisma.$executeRaw`UPDATE ideas SET title = ${data.title}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`;
    }
    if (data.description !== undefined) {
      await prisma.$executeRaw`UPDATE ideas SET description = ${data.description}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`;
    }
    return { id, ...data };
  },

  async deleteIdea(id: string) {
    if (isSupabaseConfigured && supabase) {
      // Delete the finding links explicitly first — do not rely on the
      // FK cascade. An orphaned idea_findings row is what made a deleted
      // idea keep showing on a finding's detail page.
      const { error: linkError } = await supabase.from("idea_findings").delete().eq("idea_id", id);
      if (linkError) throw linkError;
      const { error } = await supabase.from("ideas").delete().eq("id", id);
      if (error) throw error;
      return;
    }
    await prisma.$executeRaw`DELETE FROM idea_findings WHERE idea_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM ideas WHERE id = ${id}`;
  },

  // ── Finding Categories ──────────────────────────────────────────────────
  // Categories are global (like Findings): one list shared by both
  // projects. A Finding belongs to at most one category; deleting a
  // category clears the link (ON DELETE SET NULL) instead of deleting
  // the Finding. The table is created by docs/findings-category-and-
  // idea-fields-sql.md; a missing table reads as an empty list.
  /** All finding categories, newest first. */
  async getFindingCategories(): Promise<any[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("finding_categories")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        createdAt: c.created_at,
      }));
    }
    return [];
  },

  async createFindingCategory(name: string) {
    if (!isSupabaseConfigured || !supabase) throw new Error("Finding categories need Supabase");
    const { data, error } = await supabase
      .from("finding_categories")
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateFindingCategory(id: string, name: string) {
    if (!isSupabaseConfigured || !supabase) throw new Error("Finding categories need Supabase");
    const { data, error } = await supabase
      .from("finding_categories")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteFindingCategory(id: string) {
    if (!isSupabaseConfigured || !supabase) throw new Error("Finding categories need Supabase");
    const { error } = await supabase.from("finding_categories").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  },

  /** Finding ids an idea is linked to (empty when unlinked). */
  async getIdeaFindingIds(ideaId: string): Promise<string[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("idea_findings")
        .select("finding_id")
        .eq("idea_id", ideaId);
      if (error || !data) return [];
      return (data as any[]).map((r: any) => r.finding_id).filter(Boolean);
    }
    try {
      const rows = await prisma.$queryRaw<Array<{ finding_id: string }>>`
        SELECT finding_id FROM idea_findings WHERE idea_id = ${ideaId}
      `;
      return rows.map((r: any) => r.finding_id).filter(Boolean);
    } catch {
      return [];
    }
  },

  /** Ideas linked to one finding — shown on that finding's detail
   *  page. Returns the idea rows (id, title, description, imageUrl). */
  async getIdeasForFinding(findingId: string): Promise<any[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("idea_findings")
        .select("idea:ideas(id, title, description, image_url, verbatim_evidence)")
        .eq("finding_id", findingId);
      if (error || !data) return [];
      return (data as any[])
        .map((r: any) => r.idea)
        .filter((i: any) => i && i.id)
        .map((i: any) => ({ id: i.id, title: i.title, description: i.description || "", imageUrl: i.image_url || null, verbatimEvidence: i.verbatim_evidence || "" }));
    }
    try {
      const rows = await prisma.$queryRaw<Array<{ id: string; title: string; description: string }>>`
        SELECT i.id, i.title, i.description FROM ideas i
        JOIN idea_findings f ON f.idea_id = i.id
        WHERE f.finding_id = ${findingId}
        ORDER BY i.created_at ASC
      `;
      return rows.map((i: any) => ({ id: i.id, title: i.title, description: i.description || "" }));
    } catch {
      return [];
    }
  },

  /** Sub findings of one finding (idea). Each has a Fitur, a
   *  Description, and `images` — a JSONB array of image evidences,
   *  each { image_url, description }. Ordered oldest first. Returns
   *  [] when the table does not exist yet (the SQL in
   *  docs/sub-findings-sql.md adds it). */
  async getSubFindings(ideaId: string): Promise<any[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from("sub_findings")
          .select("*")
          .eq("idea_id", ideaId)
          .order("created_at", { ascending: true });
        if (error || !data) return [];
        return (data as any[]).map((s: any) => ({
          id: s.id,
          ideaId: s.idea_id,
          fitur: s.fitur || "",
          description: s.description || "",
          images: Array.isArray(s.images) ? s.images : [],
          createdAt: s.created_at,
        }));
      } catch {
        return [];
      }
    }
    try {
      const rows = await prisma.$queryRaw<Array<{ id: string; fitur: string; description: string; images: any }>>`
        SELECT id, fitur, description, images FROM sub_findings
        WHERE idea_id = ${ideaId} ORDER BY created_at ASC
      `;
      return rows.map((s: any) => ({
        id: s.id,
        ideaId,
        fitur: s.fitur || "",
        description: s.description || "",
        images: Array.isArray(s.images) ? s.images : [],
      }));
    } catch {
      return [];
    }
  },

  /** Sub findings for many findings at once, grouped by idea id —
   *  one query for the project page popup. Missing table → {}. */
  async getSubFindingsForIdeas(ideaIds: string[]): Promise<Record<string, any[]>> {
    const ids = Array.from(new Set((ideaIds || []).filter(Boolean)));
    if (ids.length === 0) return {};
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from("sub_findings")
          .select("*")
          .in("idea_id", ids)
          .order("created_at", { ascending: true });
        if (error || !data) return {};
        const map: Record<string, any[]> = {};
        for (const s of data as any[]) {
          (map[s.idea_id] ||= []).push({
            id: s.id,
            ideaId: s.idea_id,
            fitur: s.fitur || "",
            description: s.description || "",
            images: Array.isArray(s.images) ? s.images : [],
            createdAt: s.created_at,
          });
        }
        return map;
      } catch {
        return {};
      }
    }
    return {};
  },

  /** Create one sub finding under a finding (idea). */
  async createSubFinding(ideaId: string, data: { fitur?: string; description?: string; images?: Array<{ image_url: string; description?: string }> }) {
    if (isSupabaseConfigured && supabase) {
      const { data: row, error } = await supabase
        .from("sub_findings")
        .insert({ idea_id: ideaId, fitur: data.fitur || "", description: data.description || "", images: data.images || [] })
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    throw new Error("Sub findings need Supabase (local database has no sub_findings table).");
  },

  /** Update one sub finding. Only the given fields change. */
  async updateSubFinding(id: string, data: { fitur?: string; description?: string; images?: Array<{ image_url: string; description?: string }> }) {
    if (isSupabaseConfigured && supabase) {
      const patch: any = { updated_at: new Date().toISOString() };
      if (data.fitur !== undefined) patch.fitur = data.fitur;
      if (data.description !== undefined) patch.description = data.description;
      if (data.images !== undefined) patch.images = data.images;
      const { data: row, error } = await supabase.from("sub_findings").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return row;
    }
    throw new Error("Sub findings need Supabase (local database has no sub_findings table).");
  },

  /** Delete one sub finding. */
  async deleteSubFinding(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("sub_findings").delete().eq("id", id);
      if (error) throw error;
      return true;
    }
    throw new Error("Sub findings need Supabase (local database has no sub_findings table).");
  },

  /** Replace an idea's finding links (admin only at the route).
   *  Unknown finding ids are dropped, so a deleted finding never
   *  leaves a dangling link behind. */
  async setIdeaFindings(ideaId: string, findingIds: string[]): Promise<string[]> {
    const clean = Array.from(new Set((findingIds || []).filter((f) => typeof f === "string" && f.trim() !== "")));
    if (isSupabaseConfigured && supabase) {
      let valid = clean;
      if (clean.length > 0) {
        const { data } = await supabase.from("findings").select("id").in("id", clean);
        const existing = new Set(((data as any[]) || []).map((f: any) => f.id));
        valid = clean.filter((f) => existing.has(f));
      }
      const del = await supabase.from("idea_findings").delete().eq("idea_id", ideaId);
      if (del.error) throw del.error;
      if (valid.length > 0) {
        const ins = await supabase
          .from("idea_findings")
          .insert(valid.map((finding_id) => ({ idea_id: ideaId, finding_id })));
        if (ins.error) throw ins.error;
      }
      return valid;
    }
    await prisma.$executeRaw`DELETE FROM idea_findings WHERE idea_id = ${ideaId}`;
    for (const fid of clean) {
      const exists = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM findings WHERE id = ${fid}
      `;
      if (exists.length === 0) continue;
      await prisma.$executeRaw`
        INSERT INTO idea_findings (idea_id, finding_id) VALUES (${ideaId}, ${fid})
        ON CONFLICT (idea_id, finding_id) DO NOTHING
      `;
    }
    return this.getIdeaFindingIds(ideaId);
  },

  /** Replace a finding's (pool idea's) linked ideas — the reverse of
   *  setIdeaFindings. Used by the Idea edit popup, so an idea can pick
   *  its findings from either side. Unknown idea ids are dropped, so a
   *  deleted finding never leaves a dangling link behind. */
  async setFindingIdeas(findingId: string, ideaIds: string[]): Promise<string[]> {
    const clean = Array.from(new Set((ideaIds || []).filter((i) => typeof i === "string" && i.trim() !== "")));
    if (isSupabaseConfigured && supabase) {
      let valid = clean;
      if (clean.length > 0) {
        const { data } = await supabase.from("ideas").select("id").in("id", clean);
        const existing = new Set(((data as any[]) || []).map((i: any) => i.id));
        valid = clean.filter((i) => existing.has(i));
      }
      const del = await supabase.from("idea_findings").delete().eq("finding_id", findingId);
      if (del.error) throw del.error;
      if (valid.length > 0) {
        const ins = await supabase
          .from("idea_findings")
          .insert(valid.map((idea_id) => ({ idea_id, finding_id: findingId })));
        if (ins.error) throw ins.error;
      }
      return valid;
    }
    await prisma.$executeRaw`DELETE FROM idea_findings WHERE finding_id = ${findingId}`;
    for (const iid of clean) {
      const exists = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM ideas WHERE id = ${iid}
      `;
      if (exists.length === 0) continue;
      await prisma.$executeRaw`
        INSERT INTO idea_findings (idea_id, finding_id) VALUES (${iid}, ${findingId})
        ON CONFLICT (idea_id, finding_id) DO NOTHING
      `;
    }
    return this.getIdeasForFinding(findingId).then((rows) => rows.map((r: any) => r.id));
  },

  /** Every group in every project, with its project — for the
   *  dashboard's finding → group assignment picker (assignment is
   *  cross-project). */
  async getAllGroups(): Promise<any[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, label, project_id, projects(id, slug, name)")
        .order("created_at", { ascending: true });
      if (error || !data) return [];
      return (data as any[]).map((g: any) => ({
        id: g.id,
        name: g.name,
        label: g.label ?? null,
        projectId: g.project_id,
        projectSlug: g.projects?.slug ?? null,
        projectName: g.projects?.name ?? null,
      }));
    }
    const rows = await prisma.group.findMany({
      include: { project: { select: { slug: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((g: any) => ({
      id: g.id,
      name: g.name,
      label: (g as any).label ?? null,
      projectId: g.projectId,
      projectSlug: g.project?.slug ?? null,
      projectName: g.project?.name ?? null,
    }));
  },

  /** Full findings (mapped like getProjectBySlug's findings, with votes
   *  and group assignment) for a list of ids — used by the group view,
   *  which can show findings from any project. Empty list → []. */
  async getFindingsByIds(ids: string[]): Promise<any[]> {
    if (!ids || ids.length === 0) return [];
    const groupMap = await dbService.getFindingsGroupMap(ids);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("findings")
        .select("*, viabilityVotes:viability_votes(*)")
        .in("id", ids);
      if (error || !data) return [];
      return (data as any[]).map((f: any) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        tags: typeof f.tags === "string" ? f.tags : JSON.stringify(f.tags || []),
        feasibilityX: f.feasibility_x != null ? Number(f.feasibility_x) : null,
        feasibilityY: f.feasibility_y != null ? Number(f.feasibility_y) : null,
        feasibilityQuadrant: f.feasibility_quadrant,
        feasibilityImpact: f.feasibility_impact,
        feasibilityEffort: f.feasibility_effort,
        feasibilityManual: f.feasibility_manual === true,
        interviewMentions: f.interview_mentions != null ? Number(f.interview_mentions) : null,
        surveyMentions: f.survey_mentions != null ? Number(f.survey_mentions) : null,
        groupIds: groupMap[f.id] || [],
        projectId: f.project_id ?? null,
        viabilityVotes: (f.viabilityVotes || []).map((v: any) => ({
          id: v.id,
          participantId: v.participant_id,
          aspectId: v.aspect_id,
          isValidated: v.is_validated,
          score: v.score != null ? Number(v.score) : null,
          reason: v.reason ?? null,
        })),
      }));
    }
    const rows = await prisma.finding.findMany({
      where: { id: { in: ids } },
      include: { viabilityVotes: true },
    });
    return rows.map((f: any) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      tags: f.tags,
      feasibilityX: f.feasibilityX,
      feasibilityY: f.feasibilityY,
      feasibilityQuadrant: f.feasibilityQuadrant,
      feasibilityImpact: f.feasibilityImpact,
      feasibilityEffort: f.feasibilityEffort,
      feasibilityManual: f.feasibilityManual ?? false,
      interviewMentions: f.interviewMentions ?? null,
      surveyMentions: f.surveyMentions ?? null,
      groupIds: groupMap[f.id] || [],
      projectId: f.projectId ?? null,
      viabilityVotes: (f.viabilityVotes || []).map((v: any) => ({
        id: v.id,
        participantId: v.participantId,
        aspectId: v.aspectId,
        isValidated: v.isValidated,
        score: v.score != null ? Number(v.score) : null,
        reason: v.reason ?? null,
      })),
    }));
  },

  /**
   * Copy a finding into a project (or into the pool when targetProjectId
   * is null). The listing is copied — title, description, tags, and the
   * 8 idea detail fields (Tujuan, Scope, Role/Users, Step, Apa Yang
   * Berubah, Output, Tujuan Bisnis). Votes, L3 mappings, research
   * mentions and matrix position are NOT copied: the copy starts
   * Unscored and is scored independently in its own workshop.
   */
  async copyFinding(findingId: string, targetProjectId: string | null) {
    const source = await dbService.getFindingById(findingId);
    if (!source) throw new NotFoundError("Finding not found");
    const tagsRaw = typeof source.tags === "string" ? source.tags : JSON.stringify(source.tags || []);
    // Tags exist in two shapes: the current object form and the legacy
    // array form [{ value, category }]. Both must be read, or a copy of
    // a legacy finding silently loses its Sumber / Fitur / Platform.
    let parsed: any = {};
    try {
      parsed = JSON.parse(tagsRaw);
    } catch {
      parsed = {};
    }
    // Idea detail fields — snake_case from Supabase, camelCase from
    // Prisma; read both so a copy never silently drops them.
    const s: any = source;
    const detail = {
      tujuan: s.tujuan ?? "",
      scopeTermasuk: s.scope_termasuk ?? s.scopeTermasuk ?? "",
      scopeTidakTermasuk: s.scope_tidak_termasuk ?? s.scopeTidakTermasuk ?? "",
      roleUsers: s.role_users ?? s.roleUsers ?? "",
      roleUsersTidakTermasuk: s.role_users_tidak_termasuk ?? s.roleUsersTidakTermasuk ?? "",
      stepFeatureScreen: s.step_feature_screen ?? s.stepFeatureScreen ?? "",
      stepTidakTermasuk: s.step_feature_screen_tidak_termasuk ?? s.stepTidakTermasuk ?? "",
      apaYangBerubah: s.apa_yang_berubah ?? s.apaYangBerubah ?? "",
      apaYangBerubahTidakTermasuk: s.apa_yang_berubah_tidak_termasuk ?? s.apaYangBerubahTidakTermasuk ?? "",
      outputKeberhasilan: s.output_keberhasilan ?? s.outputKeberhasilan ?? "",
      tujuanBisnis: s.tujuan_bisnis ?? s.tujuanBisnis ?? "",
    };
    let data: { title: string; description: string; sumber: string[]; fitur: string; platform: string[] } & typeof detail;
    if (Array.isArray(parsed)) {
      data = { title: source.title, description: source.description || "", sumber: [], fitur: "", platform: [], ...detail };
      for (const t of parsed) {
        if (!t || typeof t.value !== "string") continue;
        if (t.category === "Sumber") data.sumber.push(t.value);
        else if (t.category === "Platform") data.platform.push(t.value === "CMS Portal" ? "CMS" : t.value);
        else if (t.category === "Feature" || t.category === "Fitur") data.fitur = t.value;
      }
    } else {
      data = {
        title: source.title,
        description: source.description || "",
        sumber: Array.isArray(parsed.sumber) ? parsed.sumber : [],
        fitur: parsed.fitur || "",
        platform: Array.isArray(parsed.platform) ? parsed.platform.map((p: any) => (p === "CMS Portal" ? "CMS" : p)) : [],
        ...detail,
      };
    }
    // Reuse createFinding (same shape, null feasibility). For a pool
    // target the SQL in docs/global-setup-sql.md must have run; the
    // error then names that file.
    return dbService.createFinding(targetProjectId, data);
  },

  /**
   * Save a board position. A drag pins the card (manual=true): the stored
   * position then wins over the computed one until it is reset. Pass
   * manual=false to clear a pin (position becomes computed again).
   * The feasibility_manual column is added by docs/global-setup-sql.md
   * (Step 8); when it does not exist yet, the update retries without it
   * (the drag still saves its coordinates) and warns once.
   */
  async updateFindingFeasibility(
    id: string,
    x: number,
    y: number,
    quadrant: string,
    impact: string,
    effort: string,
    manual?: boolean
  ) {
    if (isSupabaseConfigured && supabase) {
      const payload: any = {
        feasibility_x: x,
        feasibility_y: y,
        feasibility_quadrant: quadrant,
        feasibility_impact: impact,
        feasibility_effort: effort,
        updated_at: new Date().toISOString(),
      };
      if (manual !== undefined) payload.feasibility_manual = manual;
      let res = await supabase
        .from("findings")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (res.error && manual !== undefined && /feasibility_manual/i.test(res.error.message || "")) {
        console.warn("findings.feasibility_manual column missing — saving position without the pin flag; run docs/global-setup-sql.md (Step 8) to enable manual pins.");
        delete payload.feasibility_manual;
        res = await supabase
          .from("findings")
          .update(payload)
          .eq("id", id)
          .select()
          .single();
      }

      if (res.error) throw res.error;
      const data = res.data;
      return {
        id: data.id,
        feasibilityX: Number(data.feasibility_x),
        feasibilityY: Number(data.feasibility_y),
        feasibilityQuadrant: data.feasibility_quadrant,
        feasibilityImpact: data.feasibility_impact,
        feasibilityEffort: data.feasibility_effort,
        feasibilityManual: data.feasibility_manual === true,
      };
    }

    return prisma.finding.update({
      where: { id },
      data: {
        feasibilityX: x,
        feasibilityY: y,
        feasibilityQuadrant: quadrant,
        feasibilityImpact: impact,
        feasibilityEffort: effort,
        ...(manual !== undefined ? { feasibilityManual: manual } : {}),
      },
    });
  },

  /** Clear (or set) a board position's manual pin without moving it. */
  async setFindingFeasibilityManual(id: string, manual: boolean) {
    if (isSupabaseConfigured && supabase) {
      let res = await supabase
        .from("findings")
        .update({ feasibility_manual: manual, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (res.error && /feasibility_manual/i.test(res.error.message || "")) {
        console.warn("findings.feasibility_manual column missing — cannot store the pin flag; run docs/global-setup-sql.md (Step 8).");
        // The pin cannot persist without the column; return the row as-is
        // so the caller still gets the current coordinates.
        const fallback = await supabase.from("findings").select("*").eq("id", id).maybeSingle();
        if (fallback.error || !fallback.data) throw res.error;
        const data = fallback.data;
        return {
          id: data.id,
          feasibilityX: data.feasibility_x != null ? Number(data.feasibility_x) : null,
          feasibilityY: data.feasibility_y != null ? Number(data.feasibility_y) : null,
          feasibilityQuadrant: data.feasibility_quadrant,
          feasibilityImpact: data.feasibility_impact,
          feasibilityEffort: data.feasibility_effort,
          feasibilityManual: false,
        };
      }

      if (res.error) throw res.error;
      const data = res.data;
      return {
        id: data.id,
        feasibilityX: data.feasibility_x != null ? Number(data.feasibility_x) : null,
        feasibilityY: data.feasibility_y != null ? Number(data.feasibility_y) : null,
        feasibilityQuadrant: data.feasibility_quadrant,
        feasibilityImpact: data.feasibility_impact,
        feasibilityEffort: data.feasibility_effort,
        feasibilityManual: data.feasibility_manual === true,
      };
    }

    return prisma.finding.update({
      where: { id },
      data: { feasibilityManual: manual },
    });
  },

  /**
   * Save a finding's research mentions (how many users mentioned it in
   * Wawancara and/or Survey). Null clears a count. D is computed from
   * these counts against the project's basis N — the counts themselves
   * are the only thing stored. The interview_mentions / survey_mentions
   * columns are added by docs/global-setup-sql.md (Step 9); when they do
   * not exist yet the save fails with a clear message naming that step
   * (there is no partial save for research data).
   */
  async updateFindingResearch(
    id: string,
    data: { interviewMentions?: number | null; surveyMentions?: number | null }
  ) {
    const clean = (v: number | null | undefined): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    if (isSupabaseConfigured && supabase) {
      const payload: Record<string, number | null | string> = {
        updated_at: new Date().toISOString(),
      };
      const im = clean(data.interviewMentions);
      const sm = clean(data.surveyMentions);
      if (im !== undefined) payload.interview_mentions = im;
      if (sm !== undefined) payload.survey_mentions = sm;
      const { data: finding, error } = await supabase
        .from("findings")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        if (/interview_mentions|survey_mentions/i.test(error.message || "")) {
          throw new Error(
            "Research columns are not set up yet — run docs/global-setup-sql.md (Step 9) in the Supabase SQL editor, then save the counts again."
          );
        }
        throw error;
      }
      return {
        ...finding,
        interviewMentions: finding.interview_mentions != null ? Number(finding.interview_mentions) : null,
        surveyMentions: finding.survey_mentions != null ? Number(finding.survey_mentions) : null,
      };
    }

    return prisma.finding.update({
      where: { id },
      data: {
        ...(clean(data.interviewMentions) !== undefined && { interviewMentions: clean(data.interviewMentions) }),
        ...(clean(data.surveyMentions) !== undefined && { surveyMentions: clean(data.surveyMentions) }),
      },
    });
  },

  /**
   * Upsert a viability vote: a 1-3 score + an Alasan (reason) per aspect.
   * `score` null clears the vote (and its reason). `isValidated` is kept
   * in sync — true exactly when a score is set — because a scored aspect
   * is what feeds the per-participant V/F formulas. When `reason` is
   * undefined the existing reason is kept; pass null to clear it.
   */
  /** A single viability vote (finding + participant + aspect), or null.
   *  A one-row lookup — the vote route uses it for reason-only updates
   *  instead of loading the whole project to scan its findings. */
  async getViabilityVote(findingId: string, participantId: string, aspectId: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("viability_votes")
        .select("*")
        .eq("finding_id", findingId)
        .eq("participant_id", participantId)
        .eq("aspect_id", aspectId)
        .maybeSingle();
      if (error || !data) return null;
      return data;
    }
    return (prisma as any).viabilityVote?.findFirst?.({
      where: { findingId, participantId, aspectId },
    }).catch(() => null) ?? null;
  },

  async upsertViabilityVote(
    findingId: string,
    participantId: string,
    aspectId: string,
    score: number | null,
    reason?: string | null
  ) {
    const cleanScore = score === 1 || score === 2 || score === 3 ? score : null;
    const cleanReason =
      reason === undefined ? undefined : typeof reason === "string" ? reason.trim().slice(0, 500) || null : null;
    const isValidated = cleanScore !== null;
    if (isSupabaseConfigured && supabase) {
      // Keep the existing reason when the caller did not send one.
      let keepReason: string | null = null;
      if (cleanReason === undefined) {
        const { data: existing } = await supabase
          .from("viability_votes")
          .select("reason")
          .eq("finding_id", findingId)
          .eq("participant_id", participantId)
          .eq("aspect_id", aspectId)
          .maybeSingle();
        keepReason = existing?.reason ?? null;
      }
      const finalReason = cleanScore === null ? null : cleanReason === undefined ? keepReason : cleanReason;
      const payload: any = {
        finding_id: findingId,
        participant_id: participantId,
        aspect_id: aspectId,
        is_validated: isValidated,
        score: cleanScore,
        reason: finalReason,
        updated_at: new Date().toISOString(),
      };
      let res = await supabase
        .from("viability_votes")
        .upsert(payload, { onConflict: "finding_id,participant_id,aspect_id" })
        .select()
        .single();
      if (res.error && /score|reason/i.test(res.error.message || "")) {
        // The score/reason columns may not exist yet in Supabase (added
        // by docs/global-setup-sql.md, Step 5). Retry with just the
        // boolean so the vote still counts; the score/reason do not stick.
        console.warn("viability_votes.score/reason columns missing — saving vote as boolean only; run docs/global-setup-sql.md (Step 5) to enable 1-3 scoring with Alasan.");
        delete payload.score;
        delete payload.reason;
        res = await supabase
          .from("viability_votes")
          .upsert(payload, { onConflict: "finding_id,participant_id,aspect_id" })
          .select()
          .single();
      }
      if (res.error) throw res.error;
      return {
        ...res.data,
        score: res.data.score != null ? Number(res.data.score) : null,
        reason: res.data.reason ?? null,
      };
    }

    const existing = await prisma.viabilityVote.findUnique({
      where: { findingId_participantId_aspectId: { findingId, participantId, aspectId } },
    });
    const finalReason =
      cleanScore === null ? null : cleanReason === undefined ? existing?.reason ?? null : cleanReason;
    return prisma.viabilityVote.upsert({
      where: {
        findingId_participantId_aspectId: {
          findingId,
          participantId,
          aspectId,
        },
      },
      update: { isValidated, score: cleanScore, reason: finalReason },
      create: { findingId, participantId, aspectId, isValidated, score: cleanScore, reason: finalReason },
    });
  },

  async updateWeights(projectId: string, weights: Array<{ name: string; weight: number }>) {
    if (isSupabaseConfigured && supabase) {
      for (const w of weights) {
        await supabase.from("framework_weights").upsert(
          {
            project_id: projectId,
            name: w.name,
            weight: w.weight,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,name" }
        );
      }
      const { data } = await supabase
        .from("framework_weights")
        .select("*")
        .eq("project_id", projectId);
      return data;
    }

    for (const w of weights) {
      await prisma.frameworkWeight.upsert({
        where: {
          projectId_name: {
            projectId,
            name: w.name,
          },
        },
        update: { weight: w.weight },
        create: { projectId, name: w.name, weight: w.weight },
      });
    }

    return prisma.frameworkWeight.findMany({ where: { projectId } });
  },

  async getUserByEmail(email: string) {
    const cleanEmail = email.toLowerCase().trim();
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("email", cleanEmail)
        .single();
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        passwordHash: data.password_hash,
        role: data.role,
        isActive: data.is_active,
        projectId: data.project_id ?? null,
      };
    }

    return prisma.user.findUnique({
      where: { email: cleanEmail },
    });
  },

  /** Fetch one user by id, including their assigned group and project.
   *  The group_id column only exists after the SQL in
   *  docs/global-setup-sql.md (Step 6) and project_id after Step 7;
   *  missing means groupId / projectId null. */
  async getUserById(id: string) {
    if (isSupabaseConfigured && supabase) {
      const sb = supabase;
      const res = await usersSelectWithFallback((cols) =>
        sb.from("users").select(cols).eq("id", id).single()
      );
      if (res.error || !res.data) return null;
      const u = res.data;
      return { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.is_active, groupId: u.group_id ?? null, projectId: u.project_id ?? null, createdAt: u.created_at };
    }
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, groupId: (u as any).groupId ?? null, projectId: (u as any).projectId ?? null, createdAt: u.createdAt };
  },

  /** Fetch one project by id (id, name, slug) or null when missing. */
  async getProjectById(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, slug")
        .eq("id", id)
        .single();
      if (error || !data) return null;
      return { id: data.id, name: data.name, slug: data.slug };
    }
    const p = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
    if (!p) return null;
    return { id: p.id, name: p.name, slug: p.slug };
  },

  /** Fetch one group by id (id, name, projectId) or null when missing. */
  async getGroupById(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, project_id")
        .eq("id", id)
        .single();
      if (error || !data) return null;
      return { id: data.id, name: data.name, projectId: data.project_id };
    }
    const g = await prisma.group.findUnique({ where: { id } });
    if (!g) return null;
    return { id: g.id, name: g.name, projectId: g.projectId };
  },

  // ── Project CRUD ────────────────────────────────────────────────────────────

  /** Lightweight slug lookup (id only) for uniqueness checks. */
  async findProjectBySlug(slug: string): Promise<{ id: string; slug: string } | null> {
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from("projects")
        .select("id, slug")
        .eq("slug", slug)
        .maybeSingle();
      return data ? { id: data.id, slug: data.slug } : null;
    }
    const p = await prisma.project.findUnique({ where: { slug }, select: { id: true, slug: true } });
    return p ? { id: p.id, slug: p.slug } : null;
  },

  async createProject(data: {
    name: string;
    slug: string;
    description?: string;
    isActive?: boolean;
  }) {
    const slug = slugify(data.slug);

    if (isSupabaseConfigured && supabase) {
      // Check slug uniqueness
      const { data: existing } = await supabase
        .from("projects")
        .select("id")
        .eq("slug", slug)
        .single();
      if (existing) throw new Error("A project with this slug already exists");

      const { data: project, error } = await supabase
        .from("projects")
        .insert({ name: data.name, slug, description: data.description || "", is_active: data.isActive ?? true })
        .select()
        .single();
      if (error) throw error;

      // Seed default weights and aspects
      await supabase.from("framework_weights").insert([
        { project_id: project.id, name: "Desirability", weight: 33.34 },
        { project_id: project.id, name: "Viability", weight: 33.33 },
        { project_id: project.id, name: "Feasibility", weight: 33.33 },
      ]);
      await supabase.from("viability_aspects").insert([
        { project_id: project.id, name: "Market Demand", description: "Customer need and adoption" },
        { project_id: project.id, name: "Revenue / Business Value", description: "Financial viability" },
        { project_id: project.id, name: "Operational Scalability", description: "Process supportability" },
      ]);

      return project;
    }

    // Check slug uniqueness via Prisma
    const existing = await prisma.project.findUnique({ where: { slug } });
    if (existing) throw new Error("A project with this slug already exists");

    return prisma.project.create({
      data: {
        name: data.name,
        slug,
        description: data.description || "",
        isActive: data.isActive ?? true,
        frameworkWeights: {
          create: [
            { name: "Desirability", weight: 33.34 },
            { name: "Viability", weight: 33.33 },
            { name: "Feasibility", weight: 33.33 },
          ],
        },
        viabilityAspects: {
          create: [
            { name: "Market Demand", description: "Customer need and adoption" },
            { name: "Revenue / Business Value", description: "Financial viability" },
            { name: "Operational Scalability", description: "Process supportability" },
          ],
        },
      },
      include: { frameworkWeights: true, viabilityAspects: true },
    });
  },

  async updateProject(
    slug: string,
    data: { name?: string; description?: string; isActive?: boolean; slug?: string; interviewN?: number | null; surveyN?: number | null }
  ) {
    if (isSupabaseConfigured && supabase) {
      const cleanN = (v: number | null | undefined): number | null | undefined => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const n = Math.floor(Number(v));
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const base = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
        // Renaming a project moves its URL: the slug follows the name.
        ...(data.slug !== undefined && { slug: data.slug }),
        updated_at: new Date().toISOString(),
      };
      // Research basis N (Step 9 SQL adds the columns). When they do
      // not exist yet, retry without them so a rename/description edit
      // still saves — the N values simply cannot be stored yet.
      const withN = {
        ...base,
        ...(cleanN(data.interviewN) !== undefined && { interview_n: cleanN(data.interviewN) }),
        ...(cleanN(data.surveyN) !== undefined && { survey_n: cleanN(data.surveyN) }),
      };
      let res = await supabase
        .from("projects")
        .update(withN)
        .eq("slug", slug)
        .select()
        .single();
      if (res.error && /interview_n|survey_n/i.test(res.error.message || "")) {
        console.warn("projects.interview_n/survey_n columns missing — saving the project without the research basis; run docs/global-setup-sql.md (Step 9).");
        res = await supabase
          .from("projects")
          .update(base)
          .eq("slug", slug)
          .select()
          .single();
      }
      const { data: project, error } = res;
      // .single() on zero rows (stale slug — e.g. renamed in another
      // tab) errors PGRST116: surface it as not-found, not a 500.
      if (error) throw toNotFoundError(error, `Project not found (slug "${slug}" may have been renamed — refresh the project list)`);
      return project;
    }
    try {
      return await prisma.project.update({
        where: { slug },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.slug !== undefined && { slug: data.slug }),
          ...(data.interviewN !== undefined && { interviewN: data.interviewN }),
          ...(data.surveyN !== undefined && { surveyN: data.surveyN }),
        },
      });
    } catch (error: any) {
      throw toNotFoundError(error, `Project not found (slug "${slug}" may have been renamed — refresh the project list)`);
    }
  },

  async deleteProject(slug: string) {
    if (isSupabaseConfigured && supabase) {
      // A plain delete reports success even when zero rows match, so
      // select the deleted rows to tell "already gone" apart.
      const { data, error } = await supabase.from("projects").delete().eq("slug", slug).select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new NotFoundError(`Project not found (slug "${slug}" may have been renamed — refresh the project list)`);
      }
      return { success: true };
    }
    try {
      await prisma.project.delete({ where: { slug } });
    } catch (error: any) {
      throw toNotFoundError(error, `Project not found (slug "${slug}" may have been renamed — refresh the project list)`);
    }
    return { success: true };
  },

  // ── Finding CRUD ─────────────────────────────────────────────────────────────

  /**
   * Create a finding. projectId null creates a POOL finding (global
   * library, belongs to no project yet). Pool creation needs the SQL in
   * docs/global-setup-sql.md (findings.project_id nullable); before it
   * runs, the insert fails with a clear error naming that file.
   */
  async createFinding(projectId: string | null, data: {
    title: string;
    description?: string;
    sumber?: string[];
    fitur?: string;
    platform?: string[];
    tujuan?: string;
    scopeTermasuk?: string;
    scopeTidakTermasuk?: string;
    roleUsers?: string;
    roleUsersTidakTermasuk?: string;
    stepFeatureScreen?: string;
    stepTidakTermasuk?: string;
    apaYangBerubah?: string;
    apaYangBerubahTidakTermasuk?: string;
    outputKeberhasilan?: string;
    tujuanBisnis?: string;
  }) {
    const tagsJson = JSON.stringify({
      sumber: data.sumber || [],
      fitur: data.fitur || "",
      platform: data.platform || [],
    });

    // A new finding starts Unscored: no feasibility position until the
    // workshop places it on the matrix (null, not a 50/50 default).
    if (isSupabaseConfigured && supabase) {
      const { data: finding, error } = await supabase
        .from("findings")
        .insert({
          project_id: projectId,
          title: data.title,
          description: data.description || "",
          tags: tagsJson,
          tujuan: data.tujuan || null,
          scope_termasuk: data.scopeTermasuk || null,
          scope_tidak_termasuk: data.scopeTidakTermasuk || null,
          role_users: data.roleUsers || null,
          role_users_tidak_termasuk: data.roleUsersTidakTermasuk || null,
          step_feature_screen: data.stepFeatureScreen || null,
          step_feature_screen_tidak_termasuk: data.stepTidakTermasuk || null,
          apa_yang_berubah: data.apaYangBerubah || null,
          apa_yang_berubah_tidak_termasuk: data.apaYangBerubahTidakTermasuk || null,
          output_keberhasilan: data.outputKeberhasilan || null,
          tujuan_bisnis: data.tujuanBisnis || null,
          feasibility_x: null,
          feasibility_y: null,
          feasibility_quadrant: null,
          feasibility_impact: null,
          feasibility_effort: null,
        })
        .select()
        .single();
      if (error) {
        if (projectId === null && /null value.*project_id|not-null/i.test(error.message || "")) {
          throw new Error(`Cannot create a pool finding yet. ${GLOBAL_SQL_HINT}`);
        }
        throw error;
      }
      return finding;
    }

    return prisma.finding.create({
      data: {
        projectId,
        title: data.title,
        description: data.description || "",
        tags: tagsJson,
        feasibilityX: null,
        feasibilityY: null,
        feasibilityQuadrant: null,
        feasibilityImpact: null,
        feasibilityEffort: null,
      },
    });
  },

  async updateFinding(id: string, data: {
    title?: string;
    description?: string;
    sumber?: string[];
    fitur?: string;
    platform?: string[];
    tujuan?: string;
    scopeTermasuk?: string;
    scopeTidakTermasuk?: string;
    roleUsers?: string;
    roleUsersTidakTermasuk?: string;
    stepFeatureScreen?: string;
    stepTidakTermasuk?: string;
    apaYangBerubah?: string;
    apaYangBerubahTidakTermasuk?: string;
    outputKeberhasilan?: string;
    tujuanBisnis?: string;
  }) {
    const tagsJson = JSON.stringify({
      sumber: data.sumber || [],
      fitur: data.fitur || "",
      platform: data.platform || [],
    });

    if (isSupabaseConfigured && supabase) {
      const { data: finding, error } = await supabase
        .from("findings")
        .update({
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.tujuan !== undefined && { tujuan: data.tujuan || null }),
          ...(data.scopeTermasuk !== undefined && { scope_termasuk: data.scopeTermasuk || null }),
          ...(data.scopeTidakTermasuk !== undefined && { scope_tidak_termasuk: data.scopeTidakTermasuk || null }),
          ...(data.roleUsers !== undefined && { role_users: data.roleUsers || null }),
          ...(data.roleUsersTidakTermasuk !== undefined && { role_users_tidak_termasuk: data.roleUsersTidakTermasuk || null }),
          ...(data.stepFeatureScreen !== undefined && { step_feature_screen: data.stepFeatureScreen || null }),
          ...(data.stepTidakTermasuk !== undefined && { step_feature_screen_tidak_termasuk: data.stepTidakTermasuk || null }),
          ...(data.apaYangBerubah !== undefined && { apa_yang_berubah: data.apaYangBerubah || null }),
          ...(data.apaYangBerubahTidakTermasuk !== undefined && { apa_yang_berubah_tidak_termasuk: data.apaYangBerubahTidakTermasuk || null }),
          ...(data.outputKeberhasilan !== undefined && { output_keberhasilan: data.outputKeberhasilan || null }),
          ...(data.tujuanBisnis !== undefined && { tujuan_bisnis: data.tujuanBisnis || null }),
          tags: tagsJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return finding;
    }

    return prisma.finding.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        tags: tagsJson,
      },
    });
  },

  async deleteFinding(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("findings").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.finding.delete({ where: { id } });
    return { success: true };
  },

  // ── Project ID lookup (for Supabase) ─────────────────────────────────────────

  async getProjectIdBySlug(slug: string): Promise<string | null> {
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.from("projects").select("id").eq("slug", slug).single();
      return data?.id ?? null;
    }
    const p = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
    return p?.id ?? null;
  },

  /** Slim groups lookup for dropdowns (e.g. the Users form): one query
   *  for the project's groups + participants. The full project fetch
   *  is far too heavy just to list groups. */
  async getGroupsBySlug(slug: string) {
    const projectId = await dbService.getProjectIdBySlug(slug);
    if (!projectId) return null;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, participants(id, name, role_title, user_id, is_active)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        participants: (g.participants || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          roleTitle: p.role_title ?? null,
          userId: p.user_id ?? null,
          isActive: p.is_active,
        })),
      }));
    }
    const groups = await prisma.group.findMany({
      where: { projectId },
      include: { participants: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return groups.map((g: any) => ({
      id: g.id,
      name: g.name,
      participants: (g.participants || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        roleTitle: p.roleTitle ?? null,
        userId: p.userId ?? null,
        isActive: p.isActive,
      })),
    }));
  },

  // ── Group / Participant CRUD ──────────────────────────────────────────────────

  async createGroup(projectId: string, name: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("groups")
        .insert({ project_id: projectId, name, is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    return prisma.group.create({ data: { projectId, name } });
  },

  async deleteGroup(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("groups").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.group.delete({ where: { id } });
    return { success: true };
  },

  async createParticipant(groupId: string, name: string, roleTitle?: string, userId?: string | null) {
    if (isSupabaseConfigured && supabase) {
      const payload: any = { group_id: groupId, name, role_title: roleTitle || "", is_active: true };
      if (userId) payload.user_id = userId;
      let res = await supabase.from("participants").insert(payload).select().single();
      if (res.error && userId && /user_id/i.test(res.error.message || "")) {
        // The user_id column may not exist yet (docs/global-setup-sql.md,
        // Step 5). Retry without the link — the participant still works,
        // it just is not tied to the login account yet.
        console.warn("participants.user_id column missing — creating participant without login link; run docs/global-setup-sql.md (Step 5).");
        delete payload.user_id;
        res = await supabase.from("participants").insert(payload).select().single();
      }
      if (res.error) throw res.error;
      return res.data;
    }
    return prisma.participant.create({ data: { groupId, name, roleTitle: roleTitle || "", userId: userId ?? null } });
  },

  /** Link an existing participant row to a login user. Returns true when
   *  the link stuck, false when the user_id column does not exist yet. */
  async linkParticipantToUser(id: string, userId: string): Promise<boolean> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("participants")
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        if (/user_id/i.test(error.message || "")) return false;
        throw error;
      }
      return true;
    }
    await prisma.participant.update({ where: { id }, data: { userId } });
    return true;
  },

  /**
   * Resolve the participant row the session user votes as ("me") in a
   * project: the row already linked to their login id, else a row with
   * their name (linked on the spot), else a newly created row — in the
   * project's first active group, or a new group named after their role
   * when the project has no groups. Never creates a duplicate for the
   * same user: name matching finds an unlinked row first.
   *
   * Assigned group (User.groupId, set in the dashboard Users tab):
   * when the user has one AND that group belongs to this project, the
   * participant must live in it — an existing row in another group is
   * moved there, and a new row is created there. Otherwise the old
   * behaviour above applies.
   */
  async resolveMeParticipant(projectSlug: string, session: { id: string; name: string; role: string }, preloadedProject?: any) {
    // Callers that already loaded the project (e.g. the vote route)
    // pass it in so this does not re-fetch the whole project — a vote
    // used to pay for two full project loads per save.
    const project = preloadedProject ?? (await dbService.getProjectBySlug(projectSlug));
    if (!project) throw new NotFoundError("Project not found");
    const allParticipants: any[] = (project.groups || []).flatMap((g: any) =>
      (g.participants || []).map((p: any) => ({ ...p, groupId: g.id, groupName: g.name }))
    );
    const user = await dbService.getUserById(session.id).catch(() => null);
    // A login assigned to a project (User.projectId, set in the
    // dashboard Users tab) cannot score in any other project — return
    // null so the caller answers 403 and no participant row is created
    // or linked here. ADMIN / FACILITATOR are exempt (they work across
    // projects), and a user with no projectId is unaffected. Viewing
    // stays open: the matrix degrades to read-only when /me fails.
    // This covers EVERY scorer role (label roles, Group, Participant):
    // the gate used to be label-role-only, so a Group login assigned
    // to CMS who opened DVC got a phantom "Me" in DVC Grup 1.
    const isPrivileged = session.role === "ADMIN" || session.role === "FACILITATOR";
    if (user?.projectId && user.projectId !== project.id && !isPrivileged) {
      return null;
    }
    // A group assignment implies a project (a group's project): a user
    // whose assigned group belongs to ANOTHER project cannot score
    // here either — otherwise merely opening the wrong project silently
    // creates them a participant in that project's first group (seen
    // live with Biz CMS 2 and with Grup CMS 1: assigned to CMS Grup 1,
    // opened DVC, got a "Me" in DVC Grup 1). Same exemptions as the
    // project gate. A dangling groupId (group deleted) does not block.
    if (user?.groupId && !isPrivileged) {
      const assigned = await dbService.getGroupById(user.groupId).catch(() => null);
      if (assigned && assigned.projectId !== project.id) {
        return null;
      }
    }
    const assignedGroup = user?.groupId
      ? (project.groups || []).find((g: any) => g.id === user.groupId) || null
      : null;
    const moveToAssigned = async (p: any) => {
      if (assignedGroup && p.groupId !== assignedGroup.id) {
        await dbService.updateParticipant(p.id, { groupId: assignedGroup.id });
        return { ...p, groupId: assignedGroup.id, groupName: assignedGroup.name };
      }
      return p;
    };
    const byUserId = allParticipants.find((p) => p.userId === session.id);
    if (byUserId) return moveToAssigned(byUserId);
    const byName = allParticipants.find((p) => p.name.trim().toLowerCase() === session.name.trim().toLowerCase());
    if (byName) {
      const linked = await dbService.linkParticipantToUser(byName.id, session.id);
      return moveToAssigned({ ...byName, userId: linked ? session.id : byName.userId ?? null });
    }
    let group = assignedGroup || (project.groups || []).find((g: any) => g.isActive) || project.groups?.[0];
    if (!group) {
      group = await dbService.createGroup(project.id, session.role);
    }
    const created = await dbService.createParticipant(group.id, session.name, session.role, session.id);
    return {
      id: created.id,
      name: created.name,
      roleTitle: created.role_title ?? created.roleTitle ?? session.role,
      userId: created.user_id ?? created.userId ?? null,
      groupId: group.id,
      groupName: group.name,
      isActive: true,
    };
  },

  async deleteParticipant(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("participants").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.participant.delete({ where: { id } });
    return { success: true };
  },

  // ── Viability Aspect CRUD ────────────────────────────────────────────────────

  async createAspect(projectId: string, name: string, description?: string, framework?: string, label?: string | null) {
    const fw = framework === "Desirability" || framework === "Feasibility" ? framework : "Viability";
    const lab = normalizeAspectLabel(label);
    if (isSupabaseConfigured && supabase) {
      // The framework column may not exist yet in Supabase (it is added
      // by docs/aspect-framework-sql.md), and likewise the label column
      // (docs/global-setup-sql.md, Step 1). If the insert fails on either
      // column, retry without it so aspect creation never breaks.
      const payload: any = { project_id: projectId, name, description: description || "", is_active: true, framework: fw };
      if (lab !== null) payload.label = lab;
      let res = await supabase.from("viability_aspects").insert(payload).select().single();
      if (res.error && /framework/i.test(res.error.message || "")) {
        console.warn("viability_aspects.framework column missing — saving aspect without framework; run docs/aspect-framework-sql.md to enable linkage.");
        delete payload.framework;
        res = await supabase.from("viability_aspects").insert(payload).select().single();
      }
      if (res.error && /label/i.test(res.error.message || "")) {
        console.warn("viability_aspects.label column missing — saving aspect without label; run docs/global-setup-sql.md to enable labels.");
        delete payload.label;
        res = await supabase.from("viability_aspects").insert(payload).select().single();
      }
      if (res.error) throw res.error;
      return { ...res.data, framework: res.data.framework ?? fw, label: res.data.label ?? lab };
    }
    return prisma.viabilityAspect.create({ data: { projectId, name, description: description || "", framework: fw, label: lab } });
  },

  async deleteAspect(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("viability_aspects").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.viabilityAspect.delete({ where: { id } });
    return { success: true };
  },

  // ── Parameters (L1/L2/L3) CRUD ───────────────────────────────────────────────

  /** projectId null creates a GLOBAL L1 (shared tree). Needs the SQL
   *  in docs/global-setup-sql.md (parameters_l1.project_id nullable). */
  async createParameterL1(projectId: string | null, name: string, scoringRules?: any[]) {
    const rules = JSON.stringify(
      scoringRules ?? [
        { minPercent: 66, score: 3 },
        { minPercent: 33, score: 2 },
        { minPercent: 0, score: 1 },
      ]
    );
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("parameters_l1")
        .insert({ project_id: projectId, name, scoring_rules: rules })
        .select()
        .single();
      if (error) {
        if (projectId === null && /null value.*project_id|not-null/i.test(error.message || "")) {
          throw new Error(`Cannot create a global parameter yet. ${GLOBAL_SQL_HINT}`);
        }
        throw error;
      }
      return data;
    }
    return prisma.parameterL1.create({ data: { projectId, name, scoringRules: rules } });
  },

  async createParameterL2(l1Id: string, name: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("parameters_l2")
        .insert({ l1_id: l1Id, name })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    return prisma.parameterL2.create({ data: { l1Id, name } });
  },

  async createParameterL3(l2Id: string, name: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("parameters_l3")
        .insert({ l2_id: l2Id, name })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    return prisma.parameterL3.create({ data: { l2Id, name } });
  },

  async updateGroup(id: string, name: string, label?: string | null) {
    const cleanLabel =
      label === undefined ? undefined : normalizeAspectLabel(label);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("groups").update({
        name,
        // The label column is added by docs/group-label-sql.md; until
        // it exists, updating a group without a label still works.
        ...(cleanLabel !== undefined && { label: cleanLabel }),
        updated_at: new Date().toISOString(),
      }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    }
    return prisma.group.update({ where: { id }, data: { name, ...(cleanLabel !== undefined ? { label: cleanLabel } : {}) } });
  },

  async updateParticipant(id: string, data: { name?: string; roleTitle?: string; groupId?: string }) {
    if (isSupabaseConfigured && supabase) {
      const { data: p, error } = await supabase.from("participants").update({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.roleTitle !== undefined && { role_title: data.roleTitle }),
        ...(data.groupId !== undefined && { group_id: data.groupId }),
        updated_at: new Date().toISOString(),
      }).eq("id", id).select().single();
      if (error) throw error;
      return p;
    }
    return prisma.participant.update({ where: { id }, data });
  },

  /** Best-effort: make the user's assignment real as a participant row,
   *  so the user inherits their assigned project, role and group at
   *  assignment time — not only when they first log in and open the
   *  project. Used when an admin creates a user with a group or changes
   *  a user's assigned group. Finds the row by login id, else by name,
   *  in the group's project; moves it into the assigned group and links
   *  it (login id + role) when found; creates it there when missing.
   *  Returns the participant, or null when there is no such group or
   *  anything fails — it must never fail a user save. */
  async ensureUserParticipantInGroup(userId: string, userName: string, roleTitle: string, groupId: string) {
    try {
      const group = await dbService.getGroupById(groupId);
      if (!group) return null;
      let participants: any[] = [];
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from("groups")
          .select("id, participants(id, name, user_id, role_title)")
          .eq("project_id", group.projectId);
        if (error) return null;
        participants = (data || []).flatMap((g: any) =>
          (g.participants || []).map((p: any) => ({ ...p, groupId: g.id }))
        );
      } else {
        const groups = await prisma.group.findMany({
          where: { projectId: group.projectId },
          include: { participants: true },
        });
        participants = groups.flatMap((g: any) =>
          (g.participants || []).map((p: any) => ({ ...p, groupId: g.id }))
        );
      }
      const row =
        participants.find((p: any) => p.user_id === userId || p.userId === userId) ||
        participants.find((p: any) => p.name.trim().toLowerCase() === userName.trim().toLowerCase());
      if (!row) {
        return await dbService.createParticipant(groupId, userName, roleTitle, userId);
      }
      // Claim / move the row into the assigned group, inheriting the
      // user's role. (A row claimed by name gets linked to the login.)
      if (!row.user_id && !row.userId) {
        await dbService.linkParticipantToUser(row.id, userId);
      }
      const patch: any = {};
      if (row.groupId !== groupId) patch.groupId = groupId;
      if ((row.role_title ?? row.roleTitle ?? "") !== roleTitle) patch.roleTitle = roleTitle;
      if (Object.keys(patch).length > 0) {
        return await dbService.updateParticipant(row.id, patch);
      }
      return row;
    } catch (err) {
      console.warn("Could not ensure participant in assigned group:", (err as any)?.message || err);
      return null;
    }
  },

  async updateAspect(id: string, data: { name?: string; description?: string; framework?: string; label?: string | null }) {
    const fw = data.framework === "Desirability" || data.framework === "Feasibility" ? data.framework : data.framework === "Viability" ? "Viability" : undefined;
    // label: undefined = leave untouched; null / "" = clear; a valid
    // label = set it. Anything else normalises to null (clear).
    const lab = data.label === undefined ? undefined : normalizeAspectLabel(data.label);
    if (isSupabaseConfigured && supabase) {
      const withExtras: any = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(fw !== undefined && { framework: fw }),
        ...(lab !== undefined && { label: lab }),
        updated_at: new Date().toISOString(),
      };
      let res = await supabase.from("viability_aspects").update(withExtras).eq("id", id).select().single();
      if (res.error && fw !== undefined && /framework/i.test(res.error.message || "")) {
        console.warn("viability_aspects.framework column missing — saving aspect without framework; run docs/aspect-framework-sql.md to enable linkage.");
        delete withExtras.framework;
        res = await supabase.from("viability_aspects").update(withExtras).eq("id", id).select().single();
      }
      if (res.error && lab !== undefined && /label/i.test(res.error.message || "")) {
        console.warn("viability_aspects.label column missing — saving aspect without label; run docs/global-setup-sql.md to enable labels.");
        delete withExtras.label;
        res = await supabase.from("viability_aspects").update(withExtras).eq("id", id).select().single();
      }
      if (res.error) throw res.error;
      return { ...res.data, framework: res.data.framework ?? fw ?? "Viability", label: res.data.label ?? lab ?? null };
    }
    return prisma.viabilityAspect.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(fw !== undefined && { framework: fw }),
        ...(lab !== undefined && { label: lab }),
      },
    });
  },

  async updateParameterL1(id: string, name: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("parameters_l1").update({ name, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    }
    return prisma.parameterL1.update({ where: { id }, data: { name } });
  },

  async updateParameterL2(id: string, name: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("parameters_l2").update({ name, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    }
    return prisma.parameterL2.update({ where: { id }, data: { name } });
  },

  async updateParameterL3(id: string, name: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("parameters_l3").update({ name, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    }
    return prisma.parameterL3.update({ where: { id }, data: { name } });
  },

  async deleteParameterL1(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("parameters_l1").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.parameterL1.delete({ where: { id } });
    return { success: true };
  },

  async deleteParameterL2(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("parameters_l2").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.parameterL2.delete({ where: { id } });
    return { success: true };
  },

  async deleteParameterL3(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("parameters_l3").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.parameterL3.delete({ where: { id } });
    return { success: true };
  },

  async updateUser(id: string, data: { name?: string; role?: string; passwordHash?: string; isActive?: boolean; groupId?: string | null; projectId?: string | null }) {
    // groupId / projectId: undefined = leave untouched; null / "" = clear; a string = set.
    const groupId = data.groupId === undefined ? undefined : (data.groupId || null);
    const projectId = data.projectId === undefined ? undefined : (data.projectId || null);
    if (isSupabaseConfigured && supabase) {
      const base: any = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.role !== undefined && { role: normalizeUserRole(data.role) }),
        ...(data.passwordHash !== undefined && { password_hash: data.passwordHash }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
        updated_at: new Date().toISOString(),
      };
      // The group_id / project_id columns only exist after the SQL in
      // docs/global-setup-sql.md (Steps 6–7); missing means the group /
      // project does not stick — retry without ONLY the missing column,
      // so a missing project_id never also drops an existing group_id.
      let payload: any = {
        ...base,
        ...(groupId !== undefined ? { group_id: groupId } : {}),
        ...(projectId !== undefined ? { project_id: projectId } : {}),
      };
      let cols = ["id", "name", "email", "role", "is_active", "group_id", "project_id", "created_at"];
      let res: any = await supabase.from("users")
        .update(payload)
        .eq("id", id).select(cols.join(", ")).single();
      for (let attempt = 0; attempt < 2 && res.error; attempt++) {
        const reduced = withoutMissingUserCols(cols, res.error.message || "");
        if (!reduced) break;
        const drop = new Set(cols.filter((c) => !reduced.includes(c)));
        const nextPayload = Object.fromEntries(Object.entries(payload).filter(([k]) => !drop.has(k)));
        if (Object.keys(nextPayload).length === Object.keys(payload).length && reduced.length === cols.length) break;
        console.warn(`users column missing (${Array.from(drop).join(", ")}) — saving user without it; run docs/global-setup-sql.md (Steps 6–7).`);
        payload = nextPayload;
        cols = reduced;
        res = await supabase.from("users").update(payload).eq("id", id).select(cols.join(", ")).single();
      }
      if (res.error) throw res.error;
      const u = res.data;
      const group = u.group_id ? await dbService.getGroupById(u.group_id).catch(() => null) : null;
      const project = u.project_id ? await dbService.getProjectById(u.project_id).catch(() => null) : null;
      return { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.is_active, groupId: u.group_id ?? null, groupName: group?.name ?? null, projectId: u.project_id ?? null, projectName: project?.name ?? null, createdAt: u.created_at };
    }
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.role !== undefined && { role: normalizeUserRole(data.role) }),
        ...(data.passwordHash !== undefined && { passwordHash: data.passwordHash }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(groupId !== undefined && { groupId }),
        ...(projectId !== undefined && { projectId }),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, groupId: true, projectId: true, createdAt: true },
    });
    const group = updated.groupId ? await dbService.getGroupById(updated.groupId).catch(() => null) : null;
    const project = updated.projectId ? await dbService.getProjectById(updated.projectId).catch(() => null) : null;
    return { ...updated, groupName: group?.name ?? null, projectName: project?.name ?? null };
  },

  async deleteUser(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("users").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.user.delete({ where: { id } });
    return { success: true };
  },

  async countAdmins() {
    if (isSupabaseConfigured && supabase) {
      const { count, error } = await supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "ADMIN").eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    }
    return prisma.user.count({ where: { role: "ADMIN", isActive: true } });
  },

  // ── Users CRUD ───────────────────────────────────────────────────────────────

  async getUsers() {
    // Each user carries groupId + groupName and projectId + projectName
    // (resolved in one batch query each) so the dashboard can show the
    // assigned group and project. The group_id column only exists after
    // the SQL in docs/global-setup-sql.md (Step 6) and project_id after
    // Step 7; missing means groupId / projectId null.
    const resolveNames = async (
      rows: any[],
      fetchGroupNames: (ids: string[]) => Promise<Record<string, string>>,
      fetchProjectNames: (ids: string[]) => Promise<Record<string, string>>
    ) => {
      const groupIds = Array.from(new Set(rows.map((u: any) => u.groupId).filter(Boolean)));
      const projectIds = Array.from(new Set(rows.map((u: any) => u.projectId).filter(Boolean)));
      const [groupNames, projectNames] = await Promise.all([
        groupIds.length > 0 ? fetchGroupNames(groupIds) : ({} as Record<string, string>),
        projectIds.length > 0 ? fetchProjectNames(projectIds) : ({} as Record<string, string>),
      ]);
      return rows.map((u: any) => ({
        ...u,
        groupName: groupNames[u.groupId] ?? null,
        projectName: projectNames[u.projectId] ?? null,
      }));
    };
    if (isSupabaseConfigured && supabase) {
      const sb = supabase;
      const res: any = await usersSelectWithFallback((cols) =>
        sb.from("users").select(cols).order("created_at", { ascending: false })
      );
      if (res.error) throw res.error;
      const rows = (res.data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
        groupId: u.group_id ?? null,
        projectId: u.project_id ?? null,
        createdAt: u.created_at,
      }));
      return resolveNames(
        rows,
        async (ids) => {
          if (!supabase) return {};
          const { data: groups } = await supabase.from("groups").select("id, name").in("id", ids);
          return Object.fromEntries((groups || []).map((g: any) => [g.id, g.name]));
        },
        async (ids) => {
          if (!supabase) return {};
          const { data: projects } = await supabase.from("projects").select("id, name").in("id", ids);
          return Object.fromEntries((projects || []).map((p: any) => [p.id, p.name]));
        }
      );
    }
    const rows = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, groupId: true, projectId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return resolveNames(
      rows,
      async (ids) => {
        const groups = await prisma.group.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
        return Object.fromEntries(groups.map((g) => [g.id, g.name]));
      },
      async (ids) => {
        const projects = await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
        return Object.fromEntries(projects.map((p) => [p.id, p.name]));
      }
    );
  },

  async createUser(data: { name: string; email: string; passwordHash: string; role?: string; groupId?: string | null; projectId?: string | null }) {
    const email = data.email.toLowerCase().trim();
    const groupId = data.groupId || null;
    const projectId = data.projectId || null;
    if (isSupabaseConfigured && supabase) {
      const { data: existing } = await supabase.from("users").select("id").eq("email", email).single();
      if (existing) throw new Error("Email already registered");
      const base: any = {
        name: data.name,
        email,
        password_hash: data.passwordHash,
        role: normalizeUserRole(data.role),
        is_active: true,
      };
      let extra: any = {
        ...(groupId ? { group_id: groupId } : {}),
        ...(projectId ? { project_id: projectId } : {}),
      };
      let cols = ["id", "name", "email", "role", "is_active", "group_id", "project_id", "created_at"];
      let res: any = await supabase
        .from("users")
        .insert({ ...base, ...extra })
        .select(cols.join(", "))
        .single();
      // Drop ONLY the column PostgREST names as missing, and retry — a
      // missing project_id must not also drop a group_id that exists.
      for (let attempt = 0; attempt < 2 && res.error; attempt++) {
        const reduced = withoutMissingUserCols(cols, res.error.message || "");
        if (!reduced) break;
        const drop = new Set(cols.filter((c) => !reduced.includes(c)));
        const nextExtra = Object.fromEntries(Object.entries(extra).filter(([k]) => !drop.has(k)));
        if (Object.keys(nextExtra).length === Object.keys(extra).length && reduced.length === cols.length) break;
        console.warn(`users column missing (${Array.from(drop).join(", ")}) — creating user without it; run docs/global-setup-sql.md (Steps 6–7).`);
        extra = nextExtra;
        cols = reduced;
        res = await supabase.from("users").insert({ ...base, ...extra }).select(cols.join(", ")).single();
      }
      if (res.error) throw res.error;
      const user = res.data;
      const group = user.group_id ? await dbService.getGroupById(user.group_id).catch(() => null) : null;
      const project = user.project_id ? await dbService.getProjectById(user.project_id).catch(() => null) : null;
      return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.is_active, groupId: user.group_id ?? null, groupName: group?.name ?? null, projectId: user.project_id ?? null, projectName: project?.name ?? null, createdAt: user.created_at };
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error("Email already registered");
    const created = await prisma.user.create({
      data: { name: data.name, email, passwordHash: data.passwordHash, role: normalizeUserRole(data.role), isActive: true, ...(groupId ? { groupId } : {}), ...(projectId ? { projectId } : {}) },
      select: { id: true, name: true, email: true, role: true, isActive: true, groupId: true, projectId: true, createdAt: true },
    });
    const group = created.groupId ? await dbService.getGroupById(created.groupId).catch(() => null) : null;
    const project = created.projectId ? await dbService.getProjectById(created.projectId).catch(() => null) : null;
    return { ...created, groupName: group?.name ?? null, projectName: project?.name ?? null };
  },
};
