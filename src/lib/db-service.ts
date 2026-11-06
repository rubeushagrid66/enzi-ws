import { supabase, isSupabaseConfigured } from "./supabase";
import { prisma } from "./prisma";
import { slugify } from "./slugify";

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

/** Hint shown when a global structure is missing in Supabase. */
export const GLOBAL_SQL_HINT =
  "Global setup is not enabled yet — run docs/global-setup-sql.md in the Supabase SQL editor.";

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
    const globalWeights = await dbService.getGlobalWeights();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("projects")
        .select(`
          *,
          findings(count),
          groups(count),
          viability_aspects(count),
          framework_weights(*)
        `)
        .order("created_at", { ascending: false });

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

    const projects = await prisma.project.findMany({
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
    });

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
      const [weightsRes, aspectsRes, groupsRes, l1GlobalRes, l1ProjectRes, findingsRes, globalWeights] =
        await Promise.all([
          supabase.from("framework_weights").select("*").eq("project_id", project.id),
          supabase.from("viability_aspects").select("*").eq("project_id", project.id).order("created_at", { ascending: true }),
          supabase.from("groups").select("*, participants(*)").eq("project_id", project.id).order("created_at", { ascending: true }),
          supabase.from("parameters_l1").select("*, subCategories:parameters_l2(*, segments:parameters_l3(*))").is("project_id", null).order("created_at", { ascending: true }),
          supabase.from("parameters_l1").select("*, subCategories:parameters_l2(*, segments:parameters_l3(*))").eq("project_id", project.id).order("created_at", { ascending: true }),
          supabase.from("findings").select("*, parameterValues:finding_parameter_values(*, segment:parameters_l3(*, subCategory:parameters_l2(*))), viabilityVotes:viability_votes(*)").eq("project_id", project.id).order("created_at", { ascending: true }),
          dbService.getGlobalWeights(),
        ]);

      const l1Rows = (l1GlobalRes.data?.length ?? 0) > 0 ? l1GlobalRes.data : l1ProjectRes.data;

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        isActive: project.is_active,
        frameworkWeights: globalWeights ?? (weightsRes.data || []).map((w: any) => ({
          id: w.id,
          name: w.name,
          weight: Number(w.weight),
        })),
        viabilityAspects: (aspectsRes.data || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          // The framework column only exists after the SQL in
          // docs/aspect-framework-sql.md is run; until then every aspect
          // reads as Viability, exactly as before.
          framework: a.framework ?? "Viability",
          description: a.description,
          isActive: a.is_active,
        })),
        groups: (groupsRes.data || []).map((g: any) => ({
          id: g.id,
          name: g.name,
          isActive: g.is_active,
          participants: (g.participants || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            roleTitle: p.role_title,
            isActive: p.is_active,
          })),
        })),
        parametersL1: mapL1Rows(l1Rows || []),
        findings: (findingsRes.data || []).map((f: any) => ({
          id: f.id,
          title: f.title,
          description: f.description,
          tags: typeof f.tags === "string" ? f.tags : JSON.stringify(f.tags || []),
          // Null stays null: an unplaced finding has no feasibility
          // position. The UI may display it at 50/50 as a neutral
          // default, but null is what marks it "not yet scored".
          feasibilityX: f.feasibility_x != null ? Number(f.feasibility_x) : null,
          feasibilityY: f.feasibility_y != null ? Number(f.feasibility_y) : null,
          feasibilityQuadrant: f.feasibility_quadrant,
          feasibilityImpact: f.feasibility_impact,
          feasibilityEffort: f.feasibility_effort,
          parameterValues: (f.parameterValues || []).map((pv: any) => ({
            id: pv.id,
            l3Id: pv.l3_id,
            value: pv.value,
            segment: pv.segment
              ? {
                  id: pv.segment.id,
                  name: pv.segment.name,
                  subCategory: pv.segment.subCategory || {},
                }
              : undefined,
          })),
          viabilityVotes: (f.viabilityVotes || []).map((v: any) => ({
            id: v.id,
            participantId: v.participant_id,
            aspectId: v.aspect_id,
            isValidated: v.is_validated,
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
            parameterValues: {
              include: {
                segment: {
                  include: { subCategory: true },
                },
              },
            },
            viabilityVotes: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!project) return null;
    const globalWeights = await dbService.getGlobalWeights();
    if (globalWeights) (project as any).frameworkWeights = globalWeights;
    const globalL1 = await prisma.parameterL1.findMany({
      where: { projectId: null },
      include: { subCategories: { include: { segments: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (globalL1.length > 0) (project as any).parametersL1 = globalL1;
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
      return (findingsRes.data || []).map((f: any) => {
        const proj = f.project_id ? byId.get(f.project_id) : null;
        return {
          id: f.id,
          title: f.title,
          description: f.description,
          tags: typeof f.tags === "string" ? f.tags : JSON.stringify(f.tags || []),
          feasibilityX: f.feasibility_x != null ? Number(f.feasibility_x) : null,
          feasibilityY: f.feasibility_y != null ? Number(f.feasibility_y) : null,
          feasibilityQuadrant: f.feasibility_quadrant,
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
    return rows.map((f: any) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      tags: f.tags,
      feasibilityX: f.feasibilityX,
      feasibilityY: f.feasibilityY,
      feasibilityQuadrant: f.feasibilityQuadrant,
      projectId: f.projectId ?? null,
      projectSlug: f.project?.slug ?? null,
      projectName: f.project?.name ?? null,
    }));
  },

  /** Pool findings only (project_id null). */
  async getPoolFindings(): Promise<any[]> {
    const all = await dbService.getAllFindings();
    return all.filter((f: any) => !f.projectId);
  },

  async getFindingById(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("findings").select("*").eq("id", id).maybeSingle();
      if (error || !data) return null;
      return data;
    }
    return prisma.finding.findUnique({ where: { id } });
  },

  /**
   * Copy a finding into a project (or into the pool when targetProjectId
   * is null). Only the listing is copied — title, description, tags.
   * Votes, L3 mappings and matrix position are NOT copied: the copy
   * starts Unscored and is scored independently in its own workshop.
   */
  async copyFinding(findingId: string, targetProjectId: string | null) {
    const source = await dbService.getFindingById(findingId);
    if (!source) throw new NotFoundError("Finding not found");
    const tagsRaw = typeof source.tags === "string" ? source.tags : JSON.stringify(source.tags || []);
    let parsed: any = {};
    try {
      parsed = JSON.parse(tagsRaw);
    } catch {
      parsed = {};
    }
    const data = {
      title: source.title,
      description: source.description || "",
      sumber: Array.isArray(parsed.sumber) ? parsed.sumber : [],
      fitur: parsed.fitur || "",
      platform: Array.isArray(parsed.platform) ? parsed.platform : [],
    };
    // Reuse createFinding (same shape, null feasibility). For a pool
    // target the SQL in docs/global-setup-sql.md must have run; the
    // error then names that file.
    return dbService.createFinding(targetProjectId, data);
  },

  async updateFindingFeasibility(
    id: string,
    x: number,
    y: number,
    quadrant: string,
    impact: string,
    effort: string
  ) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("findings")
        .update({
          feasibility_x: x,
          feasibility_y: y,
          feasibility_quadrant: quadrant,
          feasibility_impact: impact,
          feasibility_effort: effort,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return {
        id: data.id,
        feasibilityX: Number(data.feasibility_x),
        feasibilityY: Number(data.feasibility_y),
        feasibilityQuadrant: data.feasibility_quadrant,
        feasibilityImpact: data.feasibility_impact,
        feasibilityEffort: data.feasibility_effort,
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
      },
    });
  },

  async upsertViabilityVote(
    findingId: string,
    participantId: string,
    aspectId: string,
    isValidated: boolean
  ) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("viability_votes")
        .upsert(
          {
            finding_id: findingId,
            participant_id: participantId,
            aspect_id: aspectId,
            is_validated: isValidated,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "finding_id,participant_id,aspect_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    }

    return prisma.viabilityVote.upsert({
      where: {
        findingId_participantId_aspectId: {
          findingId,
          participantId,
          aspectId,
        },
      },
      update: { isValidated },
      create: { findingId, participantId, aspectId, isValidated },
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
      };
    }

    return prisma.user.findUnique({
      where: { email: cleanEmail },
    });
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
    data: { name?: string; description?: string; isActive?: boolean; slug?: string }
  ) {
    if (isSupabaseConfigured && supabase) {
      const { data: project, error } = await supabase
        .from("projects")
        .update({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.isActive !== undefined && { is_active: data.isActive }),
          // Renaming a project moves its URL: the slug follows the name.
          ...(data.slug !== undefined && { slug: data.slug }),
          updated_at: new Date().toISOString(),
        })
        .eq("slug", slug)
        .select()
        .single();
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

  // ── Finding Parameter Values (workshop Desirability mapping) ───────────────

  /** Replace all L3 mappings of a finding with the given list. */
  async setFindingParameterValues(
    findingId: string,
    values: Array<{ l3Id: string; value: string }>
  ) {
    const clean = values
      .filter((v) => v.l3Id && v.value && v.value.trim())
      .map((v) => ({ l3Id: v.l3Id, value: v.value.trim() }));
    if (isSupabaseConfigured && supabase) {
      const { error: delError } = await supabase
        .from("finding_parameter_values")
        .delete()
        .eq("finding_id", findingId);
      if (delError) throw delError;
      if (clean.length > 0) {
        const { data, error } = await supabase
          .from("finding_parameter_values")
          .insert(
            clean.map((v) => ({
              finding_id: findingId,
              l3_id: v.l3Id,
              value: v.value,
            }))
          )
          .select();
        if (error) throw error;
        return data;
      }
      return [];
    }
    await prisma.findingParameterValue.deleteMany({ where: { findingId } });
    if (clean.length === 0) return [];
    await prisma.findingParameterValue.createMany({ data: clean.map((v) => ({ ...v, findingId })) });
    return prisma.findingParameterValue.findMany({ where: { findingId } });
  },

  /** Remove all mappings of one L3 segment from a finding. */
  async deleteFindingParameterValue(findingId: string, l3Id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("finding_parameter_values")
        .delete()
        .eq("finding_id", findingId)
        .eq("l3_id", l3Id);
      if (error) throw error;
      return { success: true };
    }
    await prisma.findingParameterValue.deleteMany({ where: { findingId, l3Id } });
    return { success: true };
  },

  async updateFinding(id: string, data: {
    title?: string;
    description?: string;
    sumber?: string[];
    fitur?: string;
    platform?: string[];
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

  async createParticipant(groupId: string, name: string, roleTitle?: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("participants")
        .insert({ group_id: groupId, name, role_title: roleTitle || "", is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    return prisma.participant.create({ data: { groupId, name, roleTitle: roleTitle || "" } });
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

  async createAspect(projectId: string, name: string, description?: string, framework?: string) {
    const fw = framework === "Desirability" || framework === "Feasibility" ? framework : "Viability";
    if (isSupabaseConfigured && supabase) {
      // The framework column may not exist yet in Supabase (it is added
      // by docs/aspect-framework-sql.md). If the insert fails on that
      // column, retry without it so aspect creation never breaks.
      let res = await supabase
        .from("viability_aspects")
        .insert({ project_id: projectId, name, description: description || "", is_active: true, framework: fw })
        .select()
        .single();
      if (res.error && /framework/i.test(res.error.message || "")) {
        console.warn("viability_aspects.framework column missing — saving aspect without framework; run docs/aspect-framework-sql.md to enable linkage.");
        res = await supabase
          .from("viability_aspects")
          .insert({ project_id: projectId, name, description: description || "", is_active: true })
          .select()
          .single();
      }
      if (res.error) throw res.error;
      return { ...res.data, framework: res.data.framework ?? fw };
    }
    return prisma.viabilityAspect.create({ data: { projectId, name, description: description || "", framework: fw } });
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

  async updateGroup(id: string, name: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from("groups").update({ name, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    }
    return prisma.group.update({ where: { id }, data: { name } });
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

  async updateAspect(id: string, data: { name?: string; description?: string; framework?: string }) {
    const fw = data.framework === "Desirability" || data.framework === "Feasibility" ? data.framework : data.framework === "Viability" ? "Viability" : undefined;
    if (isSupabaseConfigured && supabase) {
      const withFramework = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(fw !== undefined && { framework: fw }),
        updated_at: new Date().toISOString(),
      };
      let res = await supabase.from("viability_aspects").update(withFramework).eq("id", id).select().single();
      if (res.error && fw !== undefined && /framework/i.test(res.error.message || "")) {
        console.warn("viability_aspects.framework column missing — saving aspect without framework; run docs/aspect-framework-sql.md to enable linkage.");
        const { framework: _omit, ...withoutFramework } = withFramework as any;
        res = await supabase.from("viability_aspects").update(withoutFramework).eq("id", id).select().single();
      }
      if (res.error) throw res.error;
      return { ...res.data, framework: res.data.framework ?? fw ?? "Viability" };
    }
    return prisma.viabilityAspect.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(fw !== undefined && { framework: fw }),
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

  async updateUser(id: string, data: { name?: string; role?: string; passwordHash?: string; isActive?: boolean }) {
    if (isSupabaseConfigured && supabase) {
      const { data: u, error } = await supabase.from("users").update({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.role !== undefined && { role: data.role === "ADMIN" ? "ADMIN" : "FACILITATOR" }),
        ...(data.passwordHash !== undefined && { password_hash: data.passwordHash }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
        updated_at: new Date().toISOString(),
      }).eq("id", id).select("id, name, email, role, is_active, created_at").single();
      if (error) throw error;
      return { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.is_active, createdAt: u.created_at };
    }
    return prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.passwordHash !== undefined && { passwordHash: data.passwordHash }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
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
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role, is_active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
        createdAt: u.created_at,
      }));
    }
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async createUser(data: { name: string; email: string; passwordHash: string; role?: string }) {
    const email = data.email.toLowerCase().trim();
    if (isSupabaseConfigured && supabase) {
      const { data: existing } = await supabase.from("users").select("id").eq("email", email).single();
      if (existing) throw new Error("Email already registered");
      const { data: user, error } = await supabase
        .from("users")
        .insert({
          name: data.name,
          email,
          password_hash: data.passwordHash,
          role: data.role === "ADMIN" ? "ADMIN" : "FACILITATOR",
          is_active: true,
        })
        .select("id, name, email, role, is_active, created_at")
        .single();
      if (error) throw error;
      return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.is_active, createdAt: user.created_at };
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error("Email already registered");
    return prisma.user.create({
      data: { name: data.name, email, passwordHash: data.passwordHash, role: data.role === "ADMIN" ? "ADMIN" : "FACILITATOR", isActive: true },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
  },
};
