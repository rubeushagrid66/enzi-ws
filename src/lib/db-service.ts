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
};
