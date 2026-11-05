import { supabase, isSupabaseConfigured } from "./supabase";
import { prisma } from "./prisma";

/**
 * Unified Database Service supporting both:
 * 1. Supabase REST API (using only NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY / VITE_*)
 * 2. Prisma ORM (using DATABASE_URL)
 */

export const dbService = {
  async getProjects() {
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
        frameworkWeights: (p.framework_weights || []).map((fw: any) => ({
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

      // Parallel fetch related tables
      const [weightsRes, aspectsRes, groupsRes, l1Res, findingsRes] =
        await Promise.all([
          supabase.from("framework_weights").select("*").eq("project_id", project.id),
          supabase.from("viability_aspects").select("*").eq("project_id", project.id).order("created_at", { ascending: true }),
          supabase.from("groups").select("*, participants(*)").eq("project_id", project.id).order("created_at", { ascending: true }),
          supabase.from("parameters_l1").select("*, subCategories:parameters_l2(*, segments:parameters_l3(*))").eq("project_id", project.id).order("created_at", { ascending: true }),
          supabase.from("findings").select("*, parameterValues:finding_parameter_values(*, segment:parameters_l3(*, subCategory:parameters_l2(*))), viabilityVotes:viability_votes(*)").eq("project_id", project.id).order("created_at", { ascending: true }),
        ]);

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        isActive: project.is_active,
        frameworkWeights: (weightsRes.data || []).map((w: any) => ({
          id: w.id,
          name: w.name,
          weight: Number(w.weight),
        })),
        viabilityAspects: (aspectsRes.data || []).map((a: any) => ({
          id: a.id,
          name: a.name,
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
        parametersL1: (l1Res.data || []).map((l1: any) => ({
          id: l1.id,
          name: l1.name,
          scoringRules: typeof l1.scoring_rules === "string" ? l1.scoring_rules : JSON.stringify(l1.scoring_rules || []),
          subCategories: (l1.subCategories || []).map((l2: any) => ({
            id: l2.id,
            name: l2.name,
            segments: l2.segments || [],
          })),
        })),
        findings: (findingsRes.data || []).map((f: any) => ({
          id: f.id,
          title: f.title,
          description: f.description,
          tags: typeof f.tags === "string" ? f.tags : JSON.stringify(f.tags || []),
          feasibilityX: f.feasibility_x != null ? Number(f.feasibility_x) : 50,
          feasibilityY: f.feasibility_y != null ? Number(f.feasibility_y) : 50,
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

    // Prisma fallback
    return prisma.project.findUnique({
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

  async createProject(data: {
    name: string;
    slug: string;
    description?: string;
    isActive?: boolean;
  }) {
    const slug = data.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");

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

  async updateProject(slug: string, data: { name?: string; description?: string; isActive?: boolean }) {
    if (isSupabaseConfigured && supabase) {
      const { data: project, error } = await supabase
        .from("projects")
        .update({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.isActive !== undefined && { is_active: data.isActive }),
          updated_at: new Date().toISOString(),
        })
        .eq("slug", slug)
        .select()
        .single();
      if (error) throw error;
      return project;
    }
    return prisma.project.update({
      where: { slug },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  },

  async deleteProject(slug: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("projects").delete().eq("slug", slug);
      if (error) throw error;
      return { success: true };
    }
    await prisma.project.delete({ where: { slug } });
    return { success: true };
  },

  // ── Finding CRUD ─────────────────────────────────────────────────────────────

  async createFinding(projectId: string, data: {
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

    if (isSupabaseConfigured && supabase) {
      const { data: finding, error } = await supabase
        .from("findings")
        .insert({
          project_id: projectId,
          title: data.title,
          description: data.description || "",
          tags: tagsJson,
          feasibility_x: 50,
          feasibility_y: 50,
          feasibility_quadrant: "QUICK_WINS",
          feasibility_impact: "HIGH",
          feasibility_effort: "LOW",
        })
        .select()
        .single();
      if (error) throw error;
      return finding;
    }

    return prisma.finding.create({
      data: {
        projectId,
        title: data.title,
        description: data.description || "",
        tags: tagsJson,
        feasibilityX: 50,
        feasibilityY: 50,
        feasibilityQuadrant: "QUICK_WINS",
        feasibilityImpact: "HIGH",
        feasibilityEffort: "LOW",
      },
    });
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

  async createAspect(projectId: string, name: string, description?: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("viability_aspects")
        .insert({ project_id: projectId, name, description: description || "", is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    return prisma.viabilityAspect.create({ data: { projectId, name, description: description || "" } });
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

  async createParameterL1(projectId: string, name: string, scoringRules?: any[]) {
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
      if (error) throw error;
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

  async updateAspect(id: string, data: { name?: string; description?: string }) {
    if (isSupabaseConfigured && supabase) {
      const { data: a, error } = await supabase.from("viability_aspects").update({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        updated_at: new Date().toISOString(),
      }).eq("id", id).select().single();
      if (error) throw error;
      return a;
    }
    return prisma.viabilityAspect.update({ where: { id }, data });
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
