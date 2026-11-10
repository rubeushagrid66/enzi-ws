"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import { ADMIN_NAV, type AdminTab, TAB_BY_SLUG } from "@/lib/admin-nav";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { slugify } from "@/lib/slugify";
import {
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  Sparkles,
  Menu,
  Copy,
  Users,
  ChevronRight,
  ImagePlus,
  X,
} from "lucide-react";

async function apiCall(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Carry the HTTP status so callers can react to a 404 (stale slug)
    // differently from a real failure.
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

const SUMBER_OPTIONS = ["Wawancara", "Survey", "Internal"];
const PLATFORM_OPTIONS = ["CMS", "DVC"];

// Aspect → framework linkage: which DVF dimension an aspect's votes feed.
const FRAMEWORK_OPTIONS = ["Desirability", "Viability", "Feasibility"] as const;
const FRAMEWORK_BADGE_CLASS: Record<string, string> = {
  Desirability: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Viability: "bg-blue-100 text-blue-800 border-blue-200",
  Feasibility: "bg-amber-100 text-amber-800 border-amber-200",
};

// Aspect label: a second grouping on each aspect (Business & Ops /
// Product / Tech), used by the viability scoring formula later. Stored
// and displayed only for now — no scoring math reads it yet.
const ASPECT_LABEL_OPTIONS = ["Business & Ops", "Product", "Tech"] as const;

/**
 * Pool rows carry tags as a JSON string ({sumber, fitur, platform}),
 * while project-detail rows already carry the parsed fields. Normalise
 * both into the same shape for the pool table and the edit form.
 *
 * Two tag shapes exist in the database: the current object form and the
 * legacy array form [{ value, category }] (category "Sumber" |
 * "Platform" | "Feature"). The legacy form MUST be parsed too — before
 * this fix, opening Edit on a legacy finding showed empty Sumber /
 * Fitur / Platform, and saving silently overwrote the real tags with
 * the empty ones. "CMS Portal" is the legacy label for the CMS platform.
 */
function findingMeta(f: any) {
  const normalizePlatform = (p: string) => (p === "CMS Portal" ? "CMS" : p);
  let sumber: string[] = Array.isArray(f.sumber) ? f.sumber : [];
  let fitur = typeof f.fitur === "string" ? f.fitur : "";
  let platform: string[] = Array.isArray(f.platform) ? f.platform.map(normalizePlatform) : [];
  if (typeof f.tags === "string") {
    try {
      const parsed = JSON.parse(f.tags);
      if (Array.isArray(parsed)) {
        sumber = [];
        fitur = "";
        platform = [];
        for (const t of parsed) {
          if (!t || typeof t.value !== "string") continue;
          if (t.category === "Sumber") sumber.push(t.value);
          else if (t.category === "Platform") platform.push(normalizePlatform(t.value));
          else if (t.category === "Feature" || t.category === "Fitur") fitur = t.value;
        }
      } else {
        sumber = Array.isArray(parsed.sumber) ? parsed.sumber : [];
        fitur = typeof parsed.fitur === "string" ? parsed.fitur : "";
        platform = Array.isArray(parsed.platform) ? parsed.platform.map(normalizePlatform) : [];
      }
    } catch {
      // Leave the defaults: unparseable tags render as nothing.
    }
  }
  // Tags shown in the pool table: only the fields that exist on the
  // create/edit form (Fitur, Platform). "Sumber" is not a form field
  // anymore, so it is not shown as a tag — the raw `sumber` value is
  // still parsed above and returned, so editing a finding never wipes
  // it, but it no longer renders as a chip. This filters Sumber out
  // of an API-supplied tagsList too, not just the locally built one.
  const tagsList: Array<{ category: string; value: string }> = (f.tagsList || [
    ...(fitur ? [{ category: "Fitur", value: fitur }] : []),
    ...platform.map((p) => ({ category: "Platform", value: p })),
  ]
  ).filter(
    (t: any, i: number, arr: any[]) =>
      // Drop "Sumber" chips (no such field on the form) and de-dupe
      // the rest (the stored tags can repeat a value, e.g. Platform:
      // CMS twice) so the Tags column stays quiet.
      t.category !== "Sumber" &&
      arr.findIndex((x: any) => x.category === t.category && x.value === t.value) === i
  );
  return { sumber, fitur, platform, tagsList };
}

function AspectFrameworkBadge({ framework }: { framework?: string }) {
  const fw = framework === "Desirability" || framework === "Feasibility" ? framework : "Viability";
  return (
    <span
      title={`Linked to ${fw} — votes on this aspect feed the ${fw} score`}
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${FRAMEWORK_BADGE_CLASS[fw]}`}
    >
      {fw === "Desirability" ? "D" : fw === "Feasibility" ? "F" : "V"} · {fw}
    </span>
  );
}

function AspectLabelBadge({ label }: { label?: string | null }) {
  if (!label) {
    return (
      <span title="No label yet — edit the aspect to set one" className="inline-flex shrink-0 items-center rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-400">
        No label
      </span>
    );
  }
  return (
    <span
      title={`Label: ${label} — used by the viability scoring formula`}
      className="inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
    >
      {label}
    </span>
  );
}

// The dashboard shell lives in the (main) layout, so it stays mounted
// across tab navigations — switching tabs swaps the content instantly
// without a reload or a data refetch. The active tab is read from the
// URL itself (/dashboard/<slug>).
export default function AdminDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  // The tab the URL points at (unknown slugs fall back to Findings;
  // the [tab] page also redirects those server-side).
  const urlTab: AdminTab = TAB_BY_SLUG[pathname.split("/").pop() || ""] ?? "findings";
  const [currentUser, setCurrentUser] = useState<any>(null);
  // Access rule: only ADMIN edits config. Everyone else can edit
  // Findings only; everything else in the admin area is view-only.
  const isAdmin = currentUser?.role === "ADMIN";
  // Label-role users (Tech / Product / Business & Ops) get a reduced
  // dashboard: only Groups & Participants and Viability Aspects,
  // view-only, and only their assigned project (no switcher).
  const isLabelUser = ["Tech", "Product", "Business & Ops"].includes(currentUser?.role ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Projects
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string>("");
  const [activeProject, setActiveProject] = useState<any>(null);
  // True while a project's details are being fetched (initial load or a
  // switch). The dashboard clears activeProject on switch, so without
  // this the Groups/Aspects tabs flash "No groups created yet." and the
  // sidebar badges vanish while the new project loads — which reads as
  // "switching does nothing". While this is true, show a loading state
  // instead of the empty state.
  const [projectLoading, setProjectLoading] = useState(false);
  // The slug whose details were most recently requested. loadProjectDetails
  // is async and several requests can be in flight (switching projects,
  // then saving); only the latest one's response may update activeProject,
  // otherwise a slow earlier response overwrites the newer project's data
  // and new items "don't show" / appear under the previous project.
  const latestProjectSlugRef = useRef<string>("");
  // The active tab follows the URL (/dashboard/<slug>). It is set from
  // the pathname on mount and re-synced whenever the URL changes
  // (sidebar link, back/forward, or a pasted URL). Because this shell
  // lives in the layout, it stays mounted across tab navigations, so the
  // data loaded once on mount is NOT refetched when switching tabs.
  const [activeTab, setActiveTab] = useState<AdminTab>(urlTab);
  useEffect(() => {
    // Users & Roles is admin-only: a non-admin landing on /dashboard/user
    // (e.g. via a pasted URL) falls back to Ideas & Tags.
    // Label-role users only have Groups & Participants and Viability
    // Aspects: any other tab (e.g. via a pasted URL) falls back to Groups.
    if (!loading && urlTab === "users" && !isAdmin) {
      setActiveTab("findings");
    } else if (!loading && isLabelUser && urlTab !== "groups" && urlTab !== "aspects") {
      setActiveTab("groups");
    } else {
      setActiveTab(urlTab);
    }
    setError(null);
    setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, loading, isAdmin, isLabelUser]);

  // Confirm dialog
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel?: string } | null>(null);
  const confirmAction = useRef<(() => void) | null>(null);
  const askConfirm = (title: string, message: string, confirmLabel: string, action: () => void) => {
    confirmAction.current = action;
    setConfirm({ title, message, confirmLabel });
  };

  // Project form (create + edit)
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectSlug, setEditingProjectSlug] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({ name: "", slug: "", description: "", isActive: true });

  // Framework Weights — GLOBAL: one weighting for all projects.
  const [weightInputs, setWeightInputs] = useState<Array<{ name: string; weight: number }>>([
    { name: "Desirability", weight: 40 },
    { name: "Viability", weight: 30 },
    { name: "Feasibility", weight: 30 },
  ]);
  const [weightSaveStatus, setWeightSaveStatus] = useState<string | null>(null);
  const [weightsSource, setWeightsSource] = useState<string | null>(null);

  // Research basis N for Desirability (per selected project): total
  // users per source. Synced from the active project when it changes.
  const [interviewNInput, setInterviewNInput] = useState<string>("");
  const [surveyNInput, setSurveyNInput] = useState<string>("");
  const [researchNSaveStatus, setResearchNSaveStatus] = useState<string | null>(null);
  useEffect(() => {
    setInterviewNInput(activeProject?.interviewN != null ? String(activeProject.interviewN) : "");
    setSurveyNInput(activeProject?.surveyN != null ? String(activeProject.surveyN) : "");
    setResearchNSaveStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.slug]);

  // Global findings pool (shared by all projects).
  const [poolFindings, setPoolFindings] = useState<any[]>([]);
  const [globalSetupNote, setGlobalSetupNote] = useState<string | null>(null);

  // Finding → group assignment (admin + facilitator, dashboard only).
  // All groups across all projects — assignment is cross-project, so
  // the picker lists every group with its project.
  const [allGroups, setAllGroups] = useState<any[]>([]);

  // Finding form (create + edit)
  const [findingModalOpen, setFindingModalOpen] = useState(false);
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  // Where a new finding goes: the shared pool, or the selected project.
  const [findingTarget, setFindingTarget] = useState<"pool" | "project">("pool");
  const [findingForm, setFindingForm] = useState({ title: "", description: "", sumber: [] as string[], fitur: "", platform: [] as string[] });
  // Finding ids (the linked "Findings" tab items) ticked for this pool
  // idea in its modal — the reverse of an idea's Linked Ideas list.
  const [findingIdeaIds, setFindingIdeaIds] = useState<string[]>([]);
  // Search text filtering the Findings checklist in the idea modal.
  const [findingIdeaSearch, setFindingIdeaSearch] = useState("");
  const toggleFindingIdea = (ideaId: string) => {
    setFindingIdeaIds((prev) =>
      prev.includes(ideaId) ? prev.filter((i) => i !== ideaId) : [...prev, ideaId]
    );
  };

  // Ideas (global): an idea is linked to 1 or many findings, and a
  // finding shows its linked ideas on its detail page.
  const [ideas, setIdeas] = useState<any[]>([]);
  const [ideaModalOpen, setIdeaModalOpen] = useState(false);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [ideaForm, setIdeaForm] = useState({ title: "", description: "", sumber: [] as string[], imageUrl: null as string | null });
  // Image evidence upload: drag-over highlight, validation error, and
  // the hidden file input the drop zone / browse action triggers.
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  // Finding ids ticked for the idea in the modal.
  const [ideaFindingIds, setIdeaFindingIds] = useState<string[]>([]);
  // Search text filtering the Linked Ideas checklist (title + project).
  const [ideaFindingSearch, setIdeaFindingSearch] = useState("");
  const [savingIdea, setSavingIdea] = useState(false);

  // Groups and Participants
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; label?: string | null } | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<{ id: string; name: string; roleTitle: string; groupId: string } | null>(null);

  // Aspects
  const [newAspectName, setNewAspectName] = useState("");
  const [newAspectDesc, setNewAspectDesc] = useState("");
  const [newAspectFramework, setNewAspectFramework] = useState<string>("Viability");
  const [newAspectLabel, setNewAspectLabel] = useState<string>("");
  const [editingAspect, setEditingAspect] = useState<{ id: string; name: string; description: string; framework: string; label: string } | null>(null);

  // Users
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "FACILITATOR", groupId: "", groupName: "", projectId: "", projectName: "" });
  // Groups of non-active projects, fetched on demand for the user
  // form's Group dropdown (the project list itself carries no groups).
  const [userFormGroups, setUserFormGroups] = useState<Record<string, any[]>>({});

  // Close the mobile drawer with Escape and return focus to the hamburger.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const loadProjectDetails = async (slug: string) => {
    latestProjectSlugRef.current = slug;
    setProjectLoading(true);
    try {
      const res = await fetch(`/api/projects/${slug}`);
      if (!res.ok) throw new Error("Failed to load project details");
      const data = await res.json();
      // Ignore a stale response: the user may have switched projects (or
      // reloaded after a save) while this fetch was in flight, and the
      // newer request's data must win.
      if (latestProjectSlugRef.current === slug) {
        setActiveProject(data.project);
        setProjectLoading(false);
      }
    } catch (err: any) {
      if (latestProjectSlugRef.current === slug) {
        setError(err.message || "Failed to load project details");
        setProjectLoading(false);
      }
    }
  };

  // Global setup: weights, findings pool, ideas. These are shared
  // by all projects and do not depend on the selected project.
  const loadGlobalData = async () => {
    try {
      const [w, f, g, ideasRes] = await Promise.all([
        apiCall("/api/global/weights"),
        apiCall("/api/global/findings"),
        apiCall("/api/global/groups"),
        apiCall("/api/global/ideas"),
      ]);
      if (w.weights) {
        setWeightInputs(w.weights.map((x: any) => ({ name: x.name, weight: x.weight })));
        setWeightsSource(w.source || null);
      }
      setPoolFindings(f.findings || []);
      setAllGroups(g.groups || []);
      setIdeas(ideasRes.ideas || []);
      // Surface the "run the SQL" note once, from whichever endpoint
      // reported it.
      setGlobalSetupNote(w.note || null);
    } catch (err: any) {
      setError(err.message || "Failed to load global setup");
    }
  };

  const reloadUsers = async () => {
    try {
      const data = await apiCall("/api/users");
      setUsersList(data.users || []);
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    }
  };

  const initData = async () => {
    try {
      setLoading(true);
      // The session check and the project list are independent — fetch
      // them together instead of one after the other.
      const [userData, projData] = await Promise.all([
        fetch("/api/auth/me").then((r) => r.json()),
        apiCall("/api/projects"),
      ]);
      if (!userData?.user) {
        router.push("/dashboard/login");
        return;
      }
      setCurrentUser(userData.user);
      const loadedProjects = projData.projects || [];
      setProjects(loadedProjects);
      // Once the first project is known, its details, the global setup
      // and the users list are independent — fetch them together.
      // Label-role users only ever see their assigned project: resolve
      // it from their projectId (fresh, from the projects list) and
      // fall back to the JWT projectSlug, then to the first project
      // when they have no assignment.
      const userRole = userData.user?.role ?? "";
      const userIsLabel = ["Tech", "Product", "Business & Ops"].includes(userRole);
      let firstSlug = loadedProjects.length > 0 ? loadedProjects[0].slug : null;
      if (userIsLabel) {
        const mine =
          loadedProjects.find((p: any) => p.id === userData.user?.projectId) ||
          loadedProjects.find((p: any) => p.slug === userData.user?.projectSlug);
        if (mine) firstSlug = mine.slug;
      }
      if (firstSlug) setSelectedProjectSlug(firstSlug);
      await Promise.all([
        firstSlug ? loadProjectDetails(firstSlug) : Promise.resolve(),
        loadGlobalData(),
        userData.user.role === "ADMIN" ? reloadUsers() : Promise.resolve(),
      ]);
    } catch (e: any) {
      setError(e.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProjectSelect = (slug: string) => {
    setSelectedProjectSlug(slug);
    setError(null);
    // Clear the previous project's data immediately: the lists (groups,
    // aspects, counts) render from activeProject, and it only updates
    // when the details fetch finishes ~2s later. Until then the UI
    // would show — and let the user act on — the previous project.
    setActiveProject(null);
    loadProjectDetails(slug);
  };

  // Sign out from the sidebar user card (same flow as the site navbar).
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  // Master button (top bar, black) — the single creation entry point for
  // the current page. Groups/Aspects scroll to and focus their inline
  // create form; the masterAction itself is computed just before the
  // return, after the modal openers it calls are defined.
  const groupNameInputRef = useRef<HTMLInputElement>(null);
  const aspectNameInputRef = useRef<HTMLInputElement>(null);
  const focusInlineForm = (ref: React.RefObject<HTMLInputElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.current?.focus({ preventScroll: true });
  };

  const openCreateProject = () => {
    setEditingProjectSlug(null);
    setProjectForm({ name: "", slug: "", description: "", isActive: true });
    setProjectModalOpen(true);
  };

  const openEditProject = (p: any) => {
    setEditingProjectSlug(p.slug);
    setProjectForm({ name: p.name, slug: p.slug, description: p.description || "", isActive: p.isActive ?? true });
    setProjectModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.name || !projectForm.slug) return;
    try {
      setError(null);
      if (editingProjectSlug) {
        // Renaming moves the URL: the API returns the project with its
        // new slug — switch the whole admin UI to it, don't keep pointing
        // at the old slug (that URL stops working after the rename).
        const result = await apiCall(`/api/projects/${editingProjectSlug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectForm.name, description: projectForm.description, isActive: projectForm.isActive }),
        });
        const newSlug = result.project?.slug || editingProjectSlug;
        setProjectModalOpen(false);
        await initData();
        setSelectedProjectSlug(newSlug);
        await loadProjectDetails(newSlug);
      } else {
        await apiCall("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectForm.name, slug: projectForm.slug, description: projectForm.description }),
        });
        setProjectModalOpen(false);
        await initData();
        // New projects sort first; select the new one explicitly.
        setSelectedProjectSlug(projectForm.slug);
        await loadProjectDetails(projectForm.slug);
      }
    } catch (err: any) {
      // A 404 means the slug this tab was editing no longer exists
      // (renamed in another tab, or the project was deleted). Refresh
      // the list first so the UI never stays pointed at a dead slug,
      // then show the server's message instead of a generic one.
      if (err?.status === 404) {
        await initData();
      }
      setError(err.message || "Failed to save project");
    }
  };

  const handleDeleteProject = (p: any) => {
    askConfirm(
      "Delete project?",
      `“${p.name}” and all of its findings, groups, participants and aspects will be permanently deleted. This cannot be undone.`,
      "Delete project",
      async () => {
        try {
          await apiCall(`/api/projects/${p.slug}`, { method: "DELETE" });
          setConfirm(null);
          if (p.slug === selectedProjectSlug) {
            const remaining = projects.filter((x: any) => x.slug !== p.slug);
            setProjects(remaining);
            if (remaining.length > 0) {
              setSelectedProjectSlug(remaining[0].slug);
              await loadProjectDetails(remaining[0].slug);
            } else {
              setSelectedProjectSlug("");
              setActiveProject(null);
            }
          } else {
            await initData();
          }
        } catch (err: any) {
          setError(err.message || "Failed to delete project");
        }
      }
    );
  };

  // Framework Weights — GLOBAL, saved exactly as entered, no
  // auto-calibration. One weighting for the whole platform.
  const totalRawWeight = weightInputs.reduce((sum, w) => sum + (Number(w.weight) || 0), 0);

  const handleSaveWeights = async () => {
    try {
      setError(null);
      setWeightSaveStatus("Saving weights...");
      await apiCall("/api/global/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights: weightInputs }),
      });
      setWeightSaveStatus("Global weights saved — they now apply to all projects!");
      await loadGlobalData();
      setTimeout(() => setWeightSaveStatus(null), 3000);
    } catch (e: any) {
      setWeightSaveStatus("Failed to save weights");
      setError(e.message || "Failed to save weights");
    }
  };

  // Research basis N for Desirability (per selected project, admin-only).
  // A blank basis means that source cannot score D.
  const handleSaveResearchBasis = async () => {
    if (!selectedProjectSlug) return;
    try {
      setError(null);
      setResearchNSaveStatus("Saving research basis...");
      const toN = (raw: string) =>
        raw.trim() === "" ? null : Math.floor(Number(raw));
      await apiCall(`/api/projects/${selectedProjectSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewN: toN(interviewNInput),
          surveyN: toN(surveyNInput),
        }),
      });
      setResearchNSaveStatus(
        `Research basis saved for ${activeProject?.name ?? selectedProjectSlug}.`
      );
      await loadProjectDetails(selectedProjectSlug);
      setTimeout(() => setResearchNSaveStatus(null), 3000);
    } catch (e: any) {
      setResearchNSaveStatus("Failed to save research basis");
      setError(e.message || "Failed to save research basis");
    }
  };

  // ── Findings (GLOBAL pool) ──────────────────────────────────────────────────
  // The pool is a library: pool findings belong to no project, project
  // findings belong to one project. A finding is never shared live —
  // copying it into a project creates an independent row that is
  // scored on its own (see handleCopyFindingToProject).
  const openCreateFinding = () => {
    setEditingFindingId(null);
    setFindingTarget("pool");
    setFindingForm({ title: "", description: "", sumber: [], fitur: "", platform: [] });
    setFindingIdeaIds([]);
    setFindingIdeaSearch("");
    setFindingModalOpen(true);
  };

  const openEditFinding = async (f: any) => {
    setEditingFindingId(f.id);
    setFindingTarget(f.projectId ? "project" : "pool");
    const meta = findingMeta(f);
    setFindingForm({
      title: f.title || "",
      description: f.description || "",
      sumber: meta.sumber,
      fitur: meta.fitur,
      platform: meta.platform,
    });
    // Pre-tick the findings already linked to this idea.
    setFindingIdeaIds([]);
    setFindingIdeaSearch("");
    try {
      const res = await apiCall(`/api/global/findings/${f.id}/ideas`);
      if (Array.isArray(res?.ideaIds)) setFindingIdeaIds(res.ideaIds);
    } catch {
      // Leave the checklist unticked if the links cannot be read.
    }
    setFindingModalOpen(true);
  };

  // While a finding save is in flight the Save button shows "Saving…"
  // and is disabled — without this, the several-second save looked
  // exactly like a dead button (the modal stayed open, nothing changed).
  const [savingFinding, setSavingFinding] = useState(false);

  const handleSaveFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!findingForm.title || savingFinding) return;
    setSavingFinding(true);
    try {
      setError(null);
      const body = JSON.stringify(findingForm);
      // The saved row, so the table can update instantly below.
      let saved: any = null;
      if (editingFindingId) {
        // Edit keeps the finding where it is (pool stays pool).
        const row = poolFindings.find((x: any) => x.id === editingFindingId);
        if (row && !row.projectId) {
          saved = await apiCall(`/api/global/findings/${editingFindingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          });
        } else {
          // Project finding: edit it under its own project, whichever
          // project is currently selected in the sidebar.
          const slug = row?.projectSlug || selectedProjectSlug;
          if (!slug) return;
          saved = await apiCall(`/api/projects/${slug}/findings/${editingFindingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          });
        }
        // Update the row in place from the save response — the
        // background list refresh below is slow and was observed not
        // to repaint the row, so without this the edit only appeared
        // after a manual page reload.
        const f = saved?.finding;
        if (f) {
          setPoolFindings((rows: any[]) =>
            rows.map((x: any) =>
              x.id === editingFindingId
                ? { ...x, title: f.title ?? x.title, description: f.description ?? x.description, tags: f.tags ?? x.tags }
                : x
            )
          );
        }
      } else if (findingTarget === "pool") {
        saved = await apiCall("/api/global/findings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const f = saved?.finding;
        if (f) {
          setPoolFindings((rows: any[]) => [
            ...rows,
            {
              id: f.id,
              title: f.title,
              description: f.description,
              tags: typeof f.tags === "string" ? f.tags : JSON.stringify(f.tags || {}),
              feasibilityX: null,
              feasibilityY: null,
              feasibilityQuadrant: null,
              projectId: null,
              projectSlug: null,
              projectName: null,
            },
          ]);
        }
      } else {
        if (!selectedProjectSlug) return;
        saved = await apiCall(`/api/projects/${selectedProjectSlug}/findings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const f = saved?.finding;
        if (f) {
          setPoolFindings((rows: any[]) => [
            ...rows,
            {
              id: f.id,
              title: f.title,
              description: f.description,
              tags: typeof f.tags === "string" ? f.tags : JSON.stringify(f.tags || {}),
              feasibilityX: null,
              feasibilityY: null,
              feasibilityQuadrant: null,
              projectId: f.project_id ?? null,
              projectSlug: selectedProjectSlug,
              projectName: activeProject?.name ?? selectedProjectSlug,
            },
          ]);
        }
      }
      // Save the linked findings (the reverse of an idea's Linked Ideas
      // list). The pool idea's id is the edited id, or the new row's id.
      const ideaRowId = editingFindingId || saved?.finding?.id;
      if (ideaRowId) {
        try {
          await apiCall(`/api/global/findings/${ideaRowId}/ideas`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ideaIds: findingIdeaIds }),
          });
        } catch {
          // The idea itself is saved; a failed link save must not
          // reopen the modal as if nothing was saved.
        }
      }
      // Close the modal as soon as the save succeeds — the list refresh
      // (global data + project details) takes several more seconds, and
      // waiting for it before closing is what made saves look broken.
      // Both loaders catch their own errors, so the refresh is safe to
      // run in the background.
      setFindingModalOpen(false);
      loadGlobalData();
      if (selectedProjectSlug) loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to save idea");
    } finally {
      setSavingFinding(false);
    }
  };

  const handleDeleteFinding = (f: any) => {
    askConfirm("Delete idea?", `“${f.title}” will be permanently deleted.`, "Delete idea", async () => {
      try {
        if (!f.projectId) {
          await apiCall(`/api/global/findings/${f.id}`, { method: "DELETE" });
        } else {
          await apiCall(`/api/projects/${f.projectSlug}/findings/${f.id}`, { method: "DELETE" });
        }
        setConfirm(null);
        await loadGlobalData();
        if (selectedProjectSlug) await loadProjectDetails(selectedProjectSlug);
      } catch (err: any) {
        setError(err.message || "Failed to delete idea");
      }
    });
  };

  // ── Ideas ───────────────────────────────────────────────────────────────────
  // An idea is created here and linked to 1 or many findings (the
  // checklist lives in the idea modal). A finding shows its linked
  // ideas on its detail page.
  const openCreateIdea = () => {
    setEditingIdeaId(null);
    setIdeaForm({ title: "", description: "", sumber: [], imageUrl: null });
    setImageError(null);
    setIdeaFindingIds([]);
    setIdeaFindingSearch("");
    setIdeaModalOpen(true);
  };

  const openEditIdea = (idea: any) => {
    setEditingIdeaId(idea.id);
    setIdeaForm({ title: idea.title || "", description: idea.description || "", sumber: Array.isArray(idea.sumber) ? [...idea.sumber] : [], imageUrl: idea.imageUrl || null });
    setImageError(null);
    setIdeaFindingIds(Array.isArray(idea.findingIds) ? [...idea.findingIds] : []);
    setIdeaFindingSearch("");
    setIdeaModalOpen(true);
  };

  // Image evidence: validate (JPEG/JPG/PNG, max 5 MB), then downscale
  // to max 1200px on the longest side so the stored data URL stays
  // small (a 5 MB phone photo would otherwise bloat every project
  // page load). JPEG stays JPEG, PNG stays PNG.
  const handleImageFile = async (file: File) => {
    const okType = file.type === "image/jpeg" || file.type === "image/png" || /\.(jpe?g|png)$/i.test(file.name);
    if (!okType) {
      setImageError("Please choose a JPEG, JPG or PNG image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be under 5 MB.");
      return;
    }
    setImageError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the image file."));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error("Could not load the image."));
          img.onload = () => {
            const MAX = 1200;
            let width = img.naturalWidth;
            let height = img.naturalHeight;
            if (width > MAX || height > MAX) {
              const scale = MAX / Math.max(width, height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Could not process the image."));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.85));
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
      });
      setIdeaForm((f) => ({ ...f, imageUrl: dataUrl }));
    } catch {
      setImageError("Could not read that image — please try another file.");
    }
  };

  const toggleIdeaFinding = (findingId: string) => {
    setIdeaFindingIds((prev) =>
      prev.includes(findingId) ? prev.filter((f) => f !== findingId) : [...prev, findingId]
    );
  };

  const handleSaveIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ideaForm.title || savingIdea) return;
    setSavingIdea(true);
    try {
      setError(null);
      const body = JSON.stringify({ ...ideaForm, findingIds: ideaFindingIds });
      let saved: any = null;
      if (editingIdeaId) {
        saved = await apiCall(`/api/global/ideas/${editingIdeaId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const idea = saved?.idea;
        if (idea) {
          setIdeas((rows: any[]) =>
            rows.map((x: any) =>
              x.id === editingIdeaId
                ? { ...x, title: idea.title ?? x.title, description: idea.description ?? x.description, imageUrl: (idea as any).image_url ?? ideaForm.imageUrl ?? x.imageUrl ?? null, findingIds: ideaFindingIds }
                : x
            )
          );
        }
      } else {
        saved = await apiCall("/api/global/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const idea = saved?.idea;
        if (idea) {
          setIdeas((rows: any[]) => [
            ...rows,
            { id: idea.id, title: idea.title, description: idea.description || "", imageUrl: (idea as any).image_url ?? ideaForm.imageUrl ?? null, findingIds: ideaFindingIds },
          ]);
        }
      }
      setIdeaModalOpen(false);
      await loadGlobalData();
    } catch (err: any) {
      setError(err.message || "Failed to save finding");
    } finally {
      setSavingIdea(false);
    }
  };

  const handleDeleteIdea = (idea: any) => {
    // Use the app's own confirm dialog, not window.confirm — the
    // native browser confirm is dismissed by automated browsers
    // before it can be accepted, so the delete never ran.
    askConfirm(
      `Delete finding — ${idea.title}`,
      `Delete the finding “${idea.title}”? Its links to findings will be removed too. This cannot be undone.`,
      "Delete",
      async () => {
        try {
          setError(null);
          await apiCall(`/api/global/ideas/${idea.id}`, { method: "DELETE" });
          setIdeas((rows: any[]) => rows.filter((x: any) => x.id !== idea.id));
        } catch (err: any) {
          setError(err.message || "Failed to delete finding");
        } finally {
          setConfirm(null);
        }
      }
    );
  };

  /** Copy a pool finding into the selected project. The copy is a new,
   *  independent row (no votes, mappings or position) that starts
   *  Unscored; the pool original is untouched. */
  const handleCopyFindingToProject = async (f: any) => {
    if (!selectedProjectSlug) {
      setError("Select a project in the sidebar first, then copy this idea into it.");
      return;
    }
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/findings/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId: f.id }),
      });
      await loadGlobalData();
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to copy idea into project");
    }
  };

  /** Copy a project's finding into the shared pool. */
  const handleCopyFindingToPool = async (f: any) => {
    try {
      setError(null);
      await apiCall("/api/global/findings/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId: f.id }),
      });
      await loadGlobalData();
    } catch (err: any) {
      setError(err.message || "Failed to copy idea to pool");
    }
  };

  // ── Groups & Participants ───────────────────────────────────────────────────
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "GROUP", name: newGroupName }),
      });
      setNewGroupName("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to create group");
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !editingGroup.name.trim()) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/groups/${editingGroup.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingGroup.name.trim(), label: editingGroup.label ?? null }),
      });
      setEditingGroup(null);
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to update group");
    }
  };

  const handleDeleteGroup = (g: any) => {
    askConfirm(
      "Delete group?",
      `“${g.name}” and its ${g.participants?.length || 0} participant(s) will be permanently deleted.`,
      "Delete group",
      async () => {
        try {
          await apiCall(`/api/projects/${selectedProjectSlug}/groups/${g.id}`, { method: "DELETE" });
          setConfirm(null);
          await loadProjectDetails(selectedProjectSlug);
        } catch (err: any) {
          setError(err.message || "Failed to delete group");
        }
      }
    );
  };

  const handleSaveParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParticipant || !editingParticipant.name.trim()) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/participants/${editingParticipant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingParticipant.name.trim(), roleTitle: editingParticipant.roleTitle, groupId: editingParticipant.groupId }),
      });
      setEditingParticipant(null);
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to update participant");
    }
  };

  const handleDeleteParticipant = (p: any) => {
    askConfirm("Delete participant?", `“${p.name}” will be removed from this group.`, "Delete participant", async () => {
      try {
        await apiCall(`/api/projects/${selectedProjectSlug}/participants/${p.id}`, { method: "DELETE" });
        setConfirm(null);
        await loadProjectDetails(selectedProjectSlug);
      } catch (err: any) {
        setError(err.message || "Failed to delete participant");
      }
    });
  };

  // ── Aspects ─────────────────────────────────────────────────────────────────
  const handleCreateAspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAspectName) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/aspects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newAspectName, description: newAspectDesc, framework: newAspectFramework, label: newAspectLabel || null }),
      });
      setNewAspectName("");
      setNewAspectDesc("");
      setNewAspectFramework("Viability");
      setNewAspectLabel("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to create aspect");
    }
  };

  const handleSaveAspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAspect || !editingAspect.name.trim()) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/aspects/${editingAspect.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingAspect.name.trim(), description: editingAspect.description, framework: editingAspect.framework, label: editingAspect.label || null }),
      });
      setEditingAspect(null);
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to update aspect");
    }
  };

  const handleDeleteAspect = (a: any) => {
    askConfirm("Delete aspect?", `“${a.name}” will be permanently deleted.`, "Delete aspect", async () => {
      try {
        await apiCall(`/api/projects/${selectedProjectSlug}/aspects/${a.id}`, { method: "DELETE" });
        setConfirm(null);
        await loadProjectDetails(selectedProjectSlug);
      } catch (err: any) {
        setError(err.message || "Failed to delete aspect");
      }
    });
  };

  // ── Users ───────────────────────────────────────────────────────────────────
  // Project + groups backing the user form's dropdowns. The Group
  // options follow the selected project, not the dashboard's active
  // project; the active project's groups are already loaded, any other
  // project's are fetched once (see the effect below) and cached.
  const formProject = projects.find((p: any) => p.id === userForm.projectId) || null;
  const formGroups: any[] = userForm.projectId
    ? (userForm.projectId === activeProject?.id ? (activeProject?.groups || []) : (userFormGroups[userForm.projectId] || []))
    : [];

  // Fetch the groups of the user form's selected project when it is not
  // the active project (whose groups are already loaded).
  useEffect(() => {
    if (!userModalOpen) return;
    const pid = userForm.projectId;
    if (!pid || pid === activeProject?.id || userFormGroups[pid]) return;
    const proj = projects.find((p: any) => p.id === pid);
    if (!proj) return;
    let cancelled = false;
    // Slim groups endpoint (groups + participants only) — the full
    // project fetch took seconds just to fill this dropdown.
    apiCall(`/api/projects/${proj.slug}/groups`)
      .then((d: any) => { if (!cancelled) setUserFormGroups((m) => ({ ...m, [pid]: d.groups || [] })); })
      .catch(() => { if (!cancelled) setUserFormGroups((m) => ({ ...m, [pid]: [] })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userModalOpen, userForm.projectId, activeProject?.id]);

  // Changing the Project clears a Group that does not belong to it.
  // Groups load async for non-active projects, so this runs once they
  // are known.
  useEffect(() => {
    if (!userModalOpen || !userForm.projectId || !userForm.groupId) return;
    const groups = userForm.projectId === activeProject?.id
      ? (activeProject?.groups || [])
      : userFormGroups[userForm.projectId];
    if (!groups) return; // not loaded yet
    if (!groups.some((g: any) => g.id === userForm.groupId)) {
      setUserForm((f) => ({ ...f, groupId: "", groupName: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userModalOpen, userForm.projectId, userForm.groupId, activeProject?.id, userFormGroups]);

  const openCreateUser = () => {
    setEditingUser(null);
    // New users default to the project selected in the sidebar — resolved
    // from the projects list, not from activeProject, whose details lag
    // the switch by the fetch (~2s) and would default to the previous
    // project if the modal is opened right after switching.
    const proj = projects.find((p: any) => p.slug === selectedProjectSlug) || activeProject;
    setUserForm({ name: "", email: "", password: "", role: "FACILITATOR", groupId: "", groupName: "", projectId: proj?.id ?? "", projectName: proj?.name ?? "" });
    setUserModalOpen(true);
  };

  const openEditUser = (u: any) => {
    setEditingUser({ id: u.id, name: u.name, role: u.role });
    // No stored project yet, but a group in the active project implies it.
    const impliedProjectId = !u.projectId && u.groupId && (activeProject?.groups || []).some((g: any) => g.id === u.groupId)
      ? activeProject.id
      : "";
    setUserForm({ name: u.name, email: u.email, password: "", role: u.role, groupId: u.groupId ?? "", groupName: u.groupName ?? "", projectId: u.projectId ?? impliedProjectId, projectName: u.projectName ?? (impliedProjectId ? activeProject?.name ?? "" : "") });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      if (editingUser) {
        const body: any = { name: userForm.name, role: userForm.role, groupId: userForm.groupId || null, projectId: userForm.projectId || null };
        if (userForm.password) body.password = userForm.password;
        await apiCall(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        if (!userForm.name || !userForm.email || !userForm.password) return;
        await apiCall("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: userForm.name, email: userForm.email, password: userForm.password, role: userForm.role, groupId: userForm.groupId || null, projectId: userForm.projectId || null }),
        });
      }
      setUserModalOpen(false);
      await reloadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to save user");
    }
  };

  const handleDeleteUser = (u: any) => {
    if (u.id === currentUser?.id) {
      setError("You cannot delete your own account.");
      return;
    }
    askConfirm("Delete user?", `“${u.name}” (${u.email}) will be permanently deleted.`, "Delete user", async () => {
      try {
        await apiCall(`/api/users/${u.id}`, { method: "DELETE" });
        setConfirm(null);
        await reloadUsers();
      } catch (err: any) {
        setError(err.message || "Failed to delete user");
      }
    });
  };

  const sidebarCounts: Record<string, number | undefined> = {
    // Findings are a global pool: count the whole pool,
    // not just the selected project's slice.
    findings: poolFindings.length,
    ideas: ideas.length,
    groups: activeProject?.groups?.length,
    aspects: activeProject?.viabilityAspects?.length,
    projects: projects.length,
    users: usersList.length,
  };

  // Master button — computed here, after every opener it calls is defined.
  // Findings/Projects/Users open their create modal; Groups/Aspects scroll
  // to and focus their inline create form. Framework has no creation
  // action, so the button is hidden there.
  const masterAction: { label: string; onClick: () => void } | null =
    activeTab === "findings"
      ? { label: "Add Idea", onClick: openCreateFinding }
      : activeTab === "ideas"
        ? { label: "Add Finding", onClick: openCreateIdea }
        : activeTab === "groups" && isAdmin
        ? { label: "Add Group", onClick: () => focusInlineForm(groupNameInputRef) }
        : activeTab === "aspects" && isAdmin
          ? { label: "Add Aspect", onClick: () => focusInlineForm(aspectNameInputRef) }
          : activeTab === "projects" && isAdmin
            ? { label: "New Project", onClick: openCreateProject }
            : activeTab === "users" && isAdmin
              ? { label: "Add User", onClick: openCreateUser }
              : null;
  const activeNavItem = ADMIN_NAV.find((i) => i.id === activeTab);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-600">Loading Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar
        activeTab={activeTab}
        projects={projects}
        selectedProjectSlug={selectedProjectSlug}
        onSelectProject={handleProjectSelect}
        activeProject={activeProject}
        projectLoading={projectLoading}
        counts={sidebarCounts}
        isAdmin={isAdmin}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: breadcrumb + master button */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
              className="btn-icon shrink-0 border border-slate-200 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
              <a href="/" className="hidden shrink-0 font-medium text-slate-500 transition hover:text-slate-900 sm:inline">
                Bewize Workshop
              </a>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" />
              <span aria-current="page" className="truncate font-semibold text-slate-900">
                {activeNavItem?.label ?? "Dashboard"}
              </span>
            </nav>
            <div className="flex-1" />
            {masterAction && (
              <button type="button" onClick={masterAction.onClick} className="btn-dark shrink-0">
                <Plus className="h-4 w-4" /> {masterAction.label}
              </button>
            )}
          </div>
        </header>

        {!isAdmin && currentUser && (
          <p className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-800 sm:px-6 lg:px-8">
            {isLabelUser
              ? `You're signed in as ${currentUser.name} (${currentUser.role}) — Groups & Participants and Viability Aspects for your project, view-only.`
              : `You're signed in as ${currentUser.name} (${currentUser.role}) — you can edit Findings; everything else here is view-only.`}
          </p>
        )}

        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {error && (
            <div role="alert" className="mb-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="btn-icon shrink-0 !p-1">
                ×
              </button>
            </div>
          )}

          {/* TAB: FINDINGS — GLOBAL pool */}
          {activeTab === "findings" && (
            <section aria-labelledby="findings-heading" className="space-y-6">
              <div>
                <h2 id="findings-heading" className="section-title">Ideas Pool</h2>
                <p className="section-sub">Shared library for all projects. An idea is copied into a project before scoring — the copy is scored independently, so moving it in one workshop never moves it in another.</p>
                {globalSetupNote && (
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{globalSetupNote}</p>
                )}
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <caption className="sr-only">All ideas: the shared pool and every project&apos;s ideas</caption>
                    <colgroup>
                      <col className="w-[38%]" />
                      <col className="w-[34%]" />
                      <col className="w-[28%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th scope="col" className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Idea Title</th>
                        <th scope="col" className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tags</th>
                        <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poolFindings.length > 0 ? (
                        poolFindings.map((f: any) => {
                          const meta = findingMeta(f);
                          const isPool = !f.projectId;
                          return (
                            <tr key={f.id} className="transition hover:bg-slate-50">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-900">{f.title}</div>
                                {f.description && <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{f.description}</div>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {meta.tagsList.map((t: any, i: number) => (
                                    <span key={i} className="rounded-md bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                                      {t.category}: {t.value}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isPool ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyFindingToProject(f)}
                                      aria-label={`Copy ${f.title} into ${activeProject?.name || "selected project"}`}
                                      title={`Copy into ${activeProject?.name || "selected project"} (starts Unscored)`}
                                      className="btn-icon"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyFindingToPool(f)}
                                      aria-label={`Copy ${f.title} to the pool`}
                                      title="Copy to the pool (starts Unscored)"
                                      className="btn-icon"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button type="button" onClick={() => openEditFinding(f)} aria-label={`Edit idea ${f.title}`} className="btn-icon">
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteFinding(f)} aria-label={`Delete idea ${f.title}`} className="btn-icon-danger">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center italic text-slate-600">No ideas yet. Click “Add Idea” above.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* TAB: IDEAS */}
          {activeTab === "ideas" && (
            <section aria-labelledby="ideas-heading" className="space-y-6">
              <div>
                <h2 id="ideas-heading" className="section-title">Findings</h2>
                <p className="section-sub">Findings are linked to one or many ideas. Open an idea to see the findings related to it.</p>
                {globalSetupNote && (
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{globalSetupNote}</p>
                )}
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <caption className="sr-only">All findings and the ideas they are linked to</caption>
                    <colgroup>
                      <col className="w-[30%]" />
                      <col className="w-[30%]" />
                      <col className="w-[24%]" />
                      <col className="w-[16%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th scope="col" className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Finding</th>
                        <th scope="col" className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Description</th>
                        <th scope="col" className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Linked Ideas</th>
                        <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ideas.length > 0 ? (
                        ideas.map((idea: any) => {
                          const linked = (idea.findingIds || [])
                            .map((fid: string) => poolFindings.find((f: any) => f.id === fid))
                            .filter(Boolean);
                          return (
                            <tr key={idea.id} className="transition hover:bg-slate-50">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-900">{idea.title}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="line-clamp-2 text-xs text-slate-500">{idea.description || "—"}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {linked.length > 0 ? (
                                    linked.map((f: any) => (
                                      <span key={f.id} className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                                        {f.title}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs font-medium text-slate-400">No ideas linked yet</span>
                                  )}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button type="button" onClick={() => openEditIdea(idea)} aria-label={`Edit finding ${idea.title}`} className="btn-icon">
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteIdea(idea)} aria-label={`Delete finding ${idea.title}`} className="btn-icon-danger">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center italic text-slate-600">No findings yet. Click “Add Finding” above.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* TAB: WEIGHTS */}
          {activeTab === "weights" && (
            <section aria-labelledby="weights-heading" className="max-w-3xl space-y-6">
              <div className="card space-y-6 p-6">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Sparkles className="h-4 w-4" /> Framework Weighting
                  </div>
                  <h2 id="weights-heading" className="mt-1 text-xl font-semibold text-slate-900">DVF Framework Allocation</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">Global — applies to all projects.</p>
                  <p className="mt-1 text-sm text-slate-600">Enter any number for Desirability, Viability, and Feasibility. Weights are saved exactly as you type them — nothing is recalculated or forced to total 100.</p>
                  <p className="mt-1 text-sm text-slate-600">These weights are kept for reference only — scoring no longer uses a composite score. V and F are calculated per participant (1–3).</p>
                  {weightsSource && weightsSource !== "global" && (
                    <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      Showing the {weightsSource.replace("project:", "")} project's weights for now. {globalSetupNote || "Run docs/global-setup-sql.md in the Supabase SQL editor to make weights global."}
                    </p>
                  )}
                </div>

                <div className="space-y-5 pt-2">
                  {weightInputs.map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor={`weight-number-${item.name}`} className="text-sm font-medium text-slate-700">{item.name}</label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Input:</span>
                          {isAdmin ? (
                            <input
                              id={`weight-number-${item.name}`}
                              type="number"
                              value={item.weight}
                              min={0}
                              step="any"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const next = [...weightInputs];
                                next[idx].weight = val;
                                setWeightInputs(next);
                              }}
                              className="input w-24 px-2 py-1 text-right font-semibold"
                            />
                          ) : (
                            <span className="px-2 py-1 text-right font-semibold text-slate-900">{item.weight}</span>
                          )}
                          <span className="font-medium text-slate-500">%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold uppercase tracking-wider text-slate-500">
                      Total: <span className="text-slate-900">{totalRawWeight}%</span>
                    </span>
                    <span className="font-medium text-slate-500">
                      Saved exactly as entered
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {weightInputs.map((w, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
                        <div className="text-xs font-medium text-slate-600">{w.name}</div>
                        <div className="mt-0.5 text-base font-extrabold text-slate-900">{w.weight}%</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div>
                    {weightSaveStatus && <span className="text-sm font-medium text-emerald-600">{weightSaveStatus}</span>}
                  </div>
                  {isAdmin && (<button type="button" onClick={handleSaveWeights} className="btn-primary">Save Weights</button>)}
                </div>
              </div>

              <div className="card space-y-6 p-6">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Sparkles className="h-4 w-4" /> Research Basis
                  </div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">Desirability Research Basis</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">Per project — {activeProject?.name ?? "no project selected"}.</p>
                  <p className="mt-1 text-sm text-slate-600">Total users per research source. D is computed from each idea&apos;s mention counts against these totals (Wawancara: &ge;66% &rarr; 3, &ge;33% &rarr; 2; Survey: &ge;30% &rarr; 3, &ge;15% &rarr; 2). Leave a basis blank and that source cannot score D.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="research-interview-n" className="field-label">Wawancara — total interview users</label>
                    {isAdmin ? (
                      <input
                        id="research-interview-n"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={interviewNInput}
                        onChange={(e) => setInterviewNInput(e.target.value)}
                        placeholder="e.g. 3"
                        className="input w-full"
                      />
                    ) : (
                      <span className="block py-2 text-sm font-semibold text-slate-900">{interviewNInput || "—"}</span>
                    )}
                  </div>
                  <div>
                    <label htmlFor="research-survey-n" className="field-label">Survey — total respondents</label>
                    {isAdmin ? (
                      <input
                        id="research-survey-n"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={surveyNInput}
                        onChange={(e) => setSurveyNInput(e.target.value)}
                        placeholder="e.g. 121"
                        className="input w-full"
                      />
                    ) : (
                      <span className="block py-2 text-sm font-semibold text-slate-900">{surveyNInput || "—"}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div>
                    {researchNSaveStatus && <span className="text-sm font-medium text-emerald-600">{researchNSaveStatus}</span>}
                  </div>
                  {isAdmin && (<button type="button" onClick={handleSaveResearchBasis} className="btn-primary">Save Research Basis</button>)}
                </div>
              </div>
            </section>
          )}

          {/* TAB: GROUPS & PARTICIPANTS */}
          {activeTab === "groups" && (
            <section aria-labelledby="groups-heading" className="space-y-6">
              <div>
                <h2 id="groups-heading" className="section-title">Groups &amp; Participants</h2>
                <p className="section-sub">Create groups, and edit or remove participants. Participants are added by creating a user in Users &amp; Roles and assigning them a group.</p>
              </div>
              <div className="card space-y-5 p-5">
                {isAdmin && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Create New Group</h3>
                  <form onSubmit={handleCreateGroup} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="new-group-name" className="sr-only">Group name</label>
                    <input ref={groupNameInputRef} id="new-group-name" type="text" required placeholder="e.g. Core Product & Strategy" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="input flex-1" />
                    <button type="submit" className="btn-primary">Add Group</button>
                  </form>
                </div>
                )}

                <div className={`space-y-4 ${isAdmin ? "border-t border-slate-100 pt-5" : ""}`}>
                  <h3 className="text-sm font-semibold text-slate-900">Active Groups &amp; Participants</h3>
                  {projectLoading && !activeProject ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden />
                      Loading project…
                    </div>
                  ) : activeProject?.groups?.length > 0 ? (
                    <div className="max-h-[500px] space-y-4 overflow-y-auto pr-1">
                      {activeProject.groups.map((group: any) => (
                        <div key={group.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group.name}{group.label ? ` · ${group.label}` : ""} ({(group.participants || []).filter((p: any) => p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR").length} participants)</span>
                            {isAdmin && (
                            <span className="flex items-center gap-1">
                              <button type="button" onClick={() => setEditingGroup({ id: group.id, name: group.name, label: group.label || null })} aria-label={`Edit group ${group.name}`} className="btn-icon"><Edit2 className="h-4 w-4" /></button>
                              <button type="button" onClick={() => handleDeleteGroup(group)} aria-label={`Delete group ${group.name}`} className="btn-icon-danger"><Trash2 className="h-4 w-4" /></button>
                            </span>
                            )}
                          </div>
                          <div className="space-y-1.5 border-l-2 border-slate-200 pl-2">
                            {(group.participants || []).filter((p: any) => p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR").map((p: any) => (
                              <div key={p.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                                <span className="min-w-0"><span className="font-medium">{p.name}</span>{p.roleTitle && <span className="text-xs text-slate-500"> — {p.roleTitle}</span>}</span>
                                {isAdmin && (
                                <span className="flex shrink-0 items-center gap-1">
                                  <button type="button" onClick={() => setEditingParticipant({ id: p.id, name: p.name, roleTitle: p.roleTitle || "", groupId: group.id })} aria-label={`Edit participant ${p.name}`} className="btn-icon !p-1"><Edit2 className="h-3.5 w-3.5" /></button>
                                  <button type="button" onClick={() => handleDeleteParticipant(p)} aria-label={`Delete participant ${p.name}`} className="btn-icon-danger !p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                                </span>
                                )}
                              </div>
                            ))}
                            {(!(group.participants || []).filter((p: any) => p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR").length) && <p className="text-xs italic text-slate-500">No participants yet.</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-4 text-sm italic text-slate-600">No groups created yet.</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* TAB: ASPECTS */}
          {activeTab === "aspects" && (
            <section aria-labelledby="aspects-heading" className="max-w-2xl space-y-6">
              <div className="card space-y-5 p-6">
                <div>
                  <h2 id="aspects-heading" className="text-base font-semibold text-slate-900">Viability Aspects (Aspek)</h2>
                  <p className="mt-0.5 text-sm text-slate-600">Define aspects for the participant validation voting matrix, and link each one to the framework its votes feed — Desirability, Viability, or Feasibility.</p>
                </div>
                {isAdmin && (
                <form onSubmit={handleCreateAspect} className="space-y-3">
                  <div>
                    <label htmlFor="new-aspect-name" className="field-label">Aspect name</label>
                    <input ref={aspectNameInputRef} id="new-aspect-name" type="text" required placeholder="Aspect Name (e.g. Market Demand)" value={newAspectName} onChange={(e) => setNewAspectName(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label htmlFor="new-aspect-desc" className="field-label">Description / Guidance</label>
                    <input id="new-aspect-desc" type="text" placeholder="Description / Guidance (e.g. Customer adoption and willingness to pay)" value={newAspectDesc} onChange={(e) => setNewAspectDesc(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label htmlFor="new-aspect-framework" className="field-label">Framework — which score do votes on this aspect feed?</label>
                    <select id="new-aspect-framework" value={newAspectFramework} onChange={(e) => setNewAspectFramework(e.target.value)} className="input w-full">
                      {FRAMEWORK_OPTIONS.map((fw) => (
                        <option key={fw} value={fw}>{fw}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="new-aspect-label" className="field-label">Label — which group does this aspect belong to?</label>
                    <select id="new-aspect-label" value={newAspectLabel} onChange={(e) => setNewAspectLabel(e.target.value)} className="input w-full">
                      <option value="">— No label —</option>
                      {ASPECT_LABEL_OPTIONS.map((lb) => (
                        <option key={lb} value={lb}>{lb}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="btn-primary">Add Aspect</button>
                </form>
                )}
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Aspects ({projectLoading && !activeProject ? "…" : (activeProject?.viabilityAspects?.length || 0)})</h3>
                  {projectLoading && !activeProject ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden />
                      Loading project…
                    </div>
                  ) : activeProject?.viabilityAspects?.map((aspect: any) => (
                    <div key={aspect.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{aspect.name}</span>
                          <AspectFrameworkBadge framework={aspect.framework} />
                          <AspectLabelBadge label={aspect.label} />
                        </div>
                        {aspect.description && <div className="mt-0.5 text-xs text-slate-600">{aspect.description}</div>}
                      </div>
                      {isAdmin && (
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setEditingAspect({ id: aspect.id, name: aspect.name, description: aspect.description || "", framework: aspect.framework || "Viability", label: aspect.label || "" })} aria-label={`Edit aspect ${aspect.name}`} className="btn-icon"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => handleDeleteAspect(aspect)} aria-label={`Delete aspect ${aspect.name}`} className="btn-icon-danger"><Trash2 className="h-4 w-4" /></button>
                      </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* TAB: PROJECTS */}
          {activeTab === "projects" && (
            <section aria-labelledby="projects-heading" className="space-y-6">
              <div>
                <h2 id="projects-heading" className="section-title">All Workshop Projects</h2>
                <p className="section-sub">Switch between workshops or create new project workspaces.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((p) => (
                  <div key={p.id} className={`card flex flex-col justify-between p-5 transition ${p.slug === selectedProjectSlug ? "border-emerald-500 ring-2 ring-emerald-500/20" : "hover:border-slate-300"}`}>
                    <div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs font-medium text-emerald-600">{p.isActive ? "Active" : "Archived"}</span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-slate-900">{p.name}</h3>
                      {p.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
                    </div>
                    {isAdmin && (
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      <span className="flex items-center gap-1">
                        <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800">
                          <span>Viewer</span><ExternalLink className="h-3 w-3" />
                        </a>
                        <button type="button" onClick={() => openEditProject(p)} aria-label={`Edit project ${p.name}`} className="btn-icon !p-1"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => handleDeleteProject(p)} aria-label={`Delete project ${p.name}`} className="btn-icon-danger !p-1"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TAB: USERS (ADMIN ONLY) */}
          {activeTab === "users" && isAdmin && (
            <section aria-labelledby="users-heading" className="max-w-3xl space-y-6">
              <div className="card space-y-6 p-6">
                <div>
                  <h2 id="users-heading" className="text-base font-semibold text-slate-900">User Management</h2>
                  <p className="mt-0.5 text-sm text-slate-600">Create and manage facilitator and admin credentials. Assign each user to a project (and a group within it) so their scores land in the right workshop — label-role users (Tech, Product, Business &amp; Ops) can only score in their assigned project, while admins and facilitators work across projects. A user with no project assigned can score anywhere.</p>
                </div>
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Existing Credentials ({usersList.length})</h3>
                  {usersList.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-700">{u.name}{u.id === currentUser?.id && <span className="ml-2 text-xs font-medium text-slate-500">(you)</span>}</div>
                        <div className="font-mono text-xs text-slate-600">{u.email}</div>
                      </div>
                      <span className="flex items-center gap-2">
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">{u.role}</span>
                        {u.projectName && (
                          <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800" title="Assigned project">{u.projectName}</span>
                        )}
                        {u.groupName && (
                          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800" title="Assigned group">{u.groupName}</span>
                        )}
                        <button type="button" onClick={() => openEditUser(u)} aria-label={`Edit user ${u.name}`} className="btn-icon"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => handleDeleteUser(u)} disabled={u.id === currentUser?.id} aria-label={`Delete user ${u.name}`} title={u.id === currentUser?.id ? "You cannot delete your own account" : undefined} className="btn-icon-danger disabled:opacity-40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* PROJECT MODAL (create + edit) */}
      {projectModalOpen && (
        <Modal title={editingProjectSlug ? "Edit Project" : "Create New Workshop Project"} onClose={() => setProjectModalOpen(false)}>
          <form onSubmit={handleSaveProject} className="space-y-3">
            <div>
              <label htmlFor="project-name" className="field-label">Project Name</label>
              <input id="project-name" type="text" required placeholder="e.g. Enterprise Cash Management" value={projectForm.name} onChange={(e) => {
                const name = e.target.value;
                setProjectForm((f) => ({ ...f, name, slug: editingProjectSlug ? f.slug : slugify(name) }));
              }} className="input w-full" />
            </div>
            <div>
              <label htmlFor="project-slug" className="field-label">URL Slug (Dynamic Routing)</label>
              <div className="flex items-center">
                <span className="rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 px-2.5 py-2 font-mono text-sm text-slate-500">/</span>
                <input id="project-slug" type="text" required disabled={!!editingProjectSlug} placeholder="project-slug" value={projectForm.slug} onChange={(e) => setProjectForm((f) => ({ ...f, slug: e.target.value }))} className="input w-full rounded-l-none font-mono disabled:bg-slate-100" />
              </div>
              {editingProjectSlug ? (
                (() => {
                  const preview = slugify(projectForm.name) || editingProjectSlug;
                  return preview !== editingProjectSlug ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Saving will move this project to <span className="font-mono font-semibold">/{preview}</span> — the old link <span className="font-mono">/{editingProjectSlug}</span> will stop working.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">The URL follows the project name — rename the project above to move it.</p>
                  );
                })()
              ) : (
                <p className="mt-1 text-xs text-slate-500">The URL is generated from the project name.</p>
              )}
            </div>
            <div>
              <label htmlFor="project-desc" className="field-label">Description</label>
              <textarea id="project-desc" rows={3} placeholder="Workshop objectives and context..." value={projectForm.description} onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))} className="input w-full" />
            </div>
            {editingProjectSlug && (
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={projectForm.isActive} onChange={(e) => setProjectForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 accent-emerald-600" />
                Active project
              </label>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setProjectModalOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editingProjectSlug ? "Save Changes" : "Create Project"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* FINDING MODAL (create + edit) */}
      {findingModalOpen && (
        <Modal title={editingFindingId ? "Edit Idea" : "Create New Idea"} onClose={() => setFindingModalOpen(false)} wide>
          <form onSubmit={handleSaveFinding} className="space-y-3">
            {!editingFindingId && (
              <fieldset>
                <legend className="field-label">Where should this idea live?</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="radio" name="finding-target" checked={findingTarget === "pool"} onChange={() => setFindingTarget("pool")} className="h-4 w-4 accent-emerald-600" />
                    <span className="text-sm text-slate-700">Shared pool (usable in any workshop)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="radio" name="finding-target" checked={findingTarget === "project"} onChange={() => setFindingTarget("project")} className="h-4 w-4 accent-emerald-600" />
                    <span className="text-sm text-slate-700">This project only ({activeProject?.name || "selected project"})</span>
                  </label>
                </div>
              </fieldset>
            )}
            <div>
              <label htmlFor="finding-title" className="field-label">Idea Title (User Need / Pain Point)</label>
              <input id="finding-title" type="text" required placeholder="e.g. Tampilan Membingungkan" value={findingForm.title} onChange={(e) => setFindingForm((f) => ({ ...f, title: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="finding-desc" className="field-label">Description</label>
              <textarea id="finding-desc" rows={2} placeholder="Elaborate on participant feedback..." value={findingForm.description} onChange={(e) => setFindingForm((f) => ({ ...f, description: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="finding-fitur" className="field-label">Fitur</label>
              <input id="finding-fitur" type="text" placeholder="e.g. Bulk Payment" value={findingForm.fitur} onChange={(e) => setFindingForm((f) => ({ ...f, fitur: e.target.value }))} className="input w-full" />
            </div>
            <fieldset>
              <legend className="field-label">Platform</legend>
              <div className="flex flex-wrap gap-4">
                {PLATFORM_OPTIONS.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={findingForm.platform.includes(opt)} onChange={(e) => setFindingForm((f) => ({ ...f, platform: e.target.checked ? [...f.platform, opt] : f.platform.filter((p) => p !== opt) }))} className="h-4 w-4 rounded accent-emerald-600" />
                    <span className="text-sm text-slate-700">{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="field-label">Findings</legend>
              <p className="mb-2 text-xs text-slate-500">Tick the findings this idea relates to. An idea can be linked to one or many findings.</p>
              {ideas.length === 0 ? (
                <p className="text-sm italic text-slate-500">No findings yet — add a finding first (Findings tab).</p>
              ) : (
                <>
                  <input
                    type="search"
                    placeholder="Search findings…"
                    aria-label="Search findings"
                    value={findingIdeaSearch}
                    onChange={(e) => setFindingIdeaSearch(e.target.value)}
                    className="input mb-2 w-full"
                  />
                  {(() => {
                    const q = findingIdeaSearch.trim().toLowerCase();
                    const shown = q
                      ? ideas.filter((i: any) =>
                          `${i.title || ""} ${i.description || ""}`.toLowerCase().includes(q)
                        )
                      : ideas;
                    if (shown.length === 0) {
                      return <p className="rounded-xl border border-slate-200 px-3 py-3 text-sm italic text-slate-500">No findings match “{findingIdeaSearch.trim()}”.</p>;
                    }
                    return (
                      <div className="max-h-96 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                        {shown.map((i: any) => (
                          <label key={i.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={findingIdeaIds.includes(i.id)}
                              onChange={() => toggleFindingIdea(i.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600"
                            />
                            <span className="min-w-0">
                              <span className="block font-medium leading-snug text-slate-900">{i.title}</span>
                              {i.description && <span className="mt-0.5 block truncate text-xs text-slate-400">{i.description}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </fieldset>
            <div className="flex items-center justify-end gap-2 pt-3">
              <button type="button" onClick={() => setFindingModalOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={savingFinding} className="btn-primary disabled:opacity-60">{savingFinding ? "Saving…" : editingFindingId ? "Save Changes" : "Create Idea"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* IDEA MODAL (create + edit) — wide: the findings checklist
          needs the room, or the project names wrap into a mess. */}
      {ideaModalOpen && (
        <Modal wide title={editingIdeaId ? `Edit Finding — ${ideaForm.title || "Untitled"}` : "Create Finding"} onClose={() => setIdeaModalOpen(false)}>
          <form onSubmit={handleSaveIdea} className="space-y-3">
            <div>
              <label htmlFor="idea-title" className="field-label">Finding Title</label>
              <input id="idea-title" type="text" required placeholder="e.g. One-tap bill payment" value={ideaForm.title} onChange={(e) => setIdeaForm((f) => ({ ...f, title: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="idea-desc" className="field-label">Description</label>
              <textarea id="idea-desc" rows={3} placeholder="What is the finding?" value={ideaForm.description} onChange={(e) => setIdeaForm((f) => ({ ...f, description: e.target.value }))} className="input w-full" />
            </div>
            <fieldset>
              <legend className="field-label">Image evidence</legend>
              <p className="mb-2 text-xs text-slate-500">Upload a screenshot or photo from your device (JPEG, JPG or PNG, max 5 MB). It shows when someone opens this finding from the Ideas table.</p>
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload image evidence — drag an image here or press Enter to browse"
                onClick={() => imageInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    imageInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(true);
                }}
                onDragLeave={() => setIsDraggingImage(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleImageFile(f);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${isDraggingImage ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50"}`}
              >
                {ideaForm.imageUrl ? (
                  <div className="w-full">
                    <img src={ideaForm.imageUrl} alt="Image evidence preview" className="mx-auto max-h-56 w-auto rounded-lg object-contain" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIdeaForm((f) => ({ ...f, imageUrl: null }));
                        setImageError(null);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" /> Remove image
                    </button>
                    <p className="mt-2 text-xs text-slate-400">Click or drop another image to replace it.</p>
                  </div>
                ) : (
                  <>
                    <ImagePlus className="h-8 w-8 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {isDraggingImage ? "Drop the image here" : "Drag & drop an image here"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">or click to browse your device · JPEG, JPG, PNG · max 5 MB</p>
                  </>
                )}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,.jpeg,.jpg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImageFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {imageError && <p className="mt-2 text-xs font-medium text-rose-600">{imageError}</p>}
            </fieldset>
            <fieldset>
              <legend className="field-label">Sumber</legend>
              <div className="flex flex-wrap gap-4">
                {SUMBER_OPTIONS.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={ideaForm.sumber.includes(opt)} onChange={(e) => setIdeaForm((f) => ({ ...f, sumber: e.target.checked ? [...f.sumber, opt] : f.sumber.filter((s) => s !== opt) }))} className="h-4 w-4 rounded accent-emerald-600" />
                    <span className="text-sm text-slate-700">{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="field-label">Linked Ideas</legend>
              <p className="mb-2 text-xs text-slate-500">Tick the ideas this finding relates to. A finding can be linked to one or many ideas.</p>
              {poolFindings.length === 0 ? (
                <p className="text-sm italic text-slate-500">No ideas yet — add an idea first (Ideas &amp; Tags tab).</p>
              ) : (
                <>
                  <input
                    type="search"
                    placeholder="Search ideas…"
                    aria-label="Search ideas"
                    value={ideaFindingSearch}
                    onChange={(e) => setIdeaFindingSearch(e.target.value)}
                    className="input mb-2 w-full"
                  />
                  {(() => {
                    const q = ideaFindingSearch.trim().toLowerCase();
                    const shown = q
                      ? poolFindings.filter((f: any) =>
                          `${f.title || ""} ${f.projectName || ""}`.toLowerCase().includes(q)
                        )
                      : poolFindings;
                    if (shown.length === 0) {
                      return <p className="rounded-xl border border-slate-200 px-3 py-3 text-sm italic text-slate-500">No ideas match “{ideaFindingSearch.trim()}”.</p>;
                    }
                    return (
                      <div className="max-h-96 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                        {shown.map((f: any) => (
                          <label key={f.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={ideaFindingIds.includes(f.id)}
                              onChange={() => toggleIdeaFinding(f.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600"
                            />
                            <span className="min-w-0">
                              <span className="block font-medium leading-snug text-slate-900">{f.title}</span>
                              {f.projectName && <span className="mt-0.5 block text-xs text-slate-400">{f.projectName}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </fieldset>
            <div className="flex items-center justify-end gap-2 pt-3">
              <button type="button" onClick={() => setIdeaModalOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={savingIdea} className="btn-primary disabled:opacity-60">{savingIdea ? "Saving…" : editingIdeaId ? "Save Changes" : "Create Finding"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* USER MODAL (create + edit) */}
      {userModalOpen && (
        <Modal title={editingUser ? `Edit User — ${editingUser.name}` : "Create User"} onClose={() => setUserModalOpen(false)}>
          <form onSubmit={handleSaveUser} className="space-y-3">
            <div>
              <label htmlFor="user-name" className="field-label">Full Name</label>
              <input id="user-name" type="text" required placeholder="Full Name" value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="user-email" className="field-label">Email Address</label>
              <input id="user-email" type="email" required disabled={!!editingUser} placeholder="Email Address" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} className="input w-full disabled:bg-slate-100" />
              {editingUser && <p className="mt-1 text-xs text-slate-500">Email cannot be changed.</p>}
            </div>
            <div>
              <label htmlFor="user-password" className="field-label">{editingUser ? "New Password (leave blank to keep current)" : "Password"}</label>
              <input id="user-password" type="password" required={!editingUser} placeholder="Password" value={userForm.password} onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))} className="input w-full" autoComplete="new-password" />
            </div>
            <div>
              <label htmlFor="user-role" className="field-label">Role</label>
              <select id="user-role" value={userForm.role} onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))} className="input w-full">
                <option value="FACILITATOR">Facilitator</option>
                <option value="ADMIN">Admin</option>
                <option value="Group">Group (scores in their assigned group)</option>
                <option value="Participant">Participant (scores in their assigned group)</option>
                <option value="Business & Ops">Business &amp; Ops</option>
                <option value="Product">Product</option>
                <option value="Tech">Tech</option>
              </select>
            </div>
            <div>
              <label htmlFor="user-project" className="field-label">Project</label>
              <select id="user-project" value={userForm.projectId} onChange={(e) => {
                const projectId = e.target.value;
                const projectName = projects.find((p: any) => p.id === projectId)?.name ?? "";
                // Clearing the project also clears the group (a group
                // belongs to a project); picking another project clears
                // a group that does not belong to it (see the effect
                // above, which runs once that project's groups load).
                setUserForm((f) => ({ ...f, projectId, projectName, groupId: projectId === "" ? "" : f.groupId, groupName: projectId === "" ? "" : f.groupName }));
              }} className="input w-full">
                <option value="">— No project —</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Label-role users can only score in their assigned project. Leave empty for no project.</p>
            </div>
            <div>
              <label htmlFor="user-group" className="field-label">Group — {formProject?.name || "selected project"}</label>
              <select id="user-group" value={userForm.groupId} onChange={(e) => setUserForm((f) => ({ ...f, groupId: e.target.value }))} className="input w-full">
                <option value="">— No group —</option>
                {formGroups.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
                {userForm.groupId && !formGroups.some((g: any) => g.id === userForm.groupId) && (
                  <option value={userForm.groupId}>{userForm.groupName ? `${userForm.groupName} (other project)` : "Assigned group (other project)"}</option>
                )}
              </select>
              <p className="mt-1 text-xs text-slate-500">Assign this user to a group so their votes land in that group (marked “Me” in the scoring table). Leave empty for no group.</p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setUserModalOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editingUser ? "Save Changes" : "Create User"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* GROUP EDIT MODAL */}
      {editingGroup && (
        <Modal title="Edit Group" onClose={() => setEditingGroup(null)}>
          <form onSubmit={handleSaveGroup} className="space-y-3">
            <div>
              <label htmlFor="edit-group-name" className="field-label">Group name</label>
              <input id="edit-group-name" type="text" required value={editingGroup.name} onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })} className="input w-full" />
            </div>
            <div>
              <label htmlFor="edit-group-label" className="field-label">Assigned role — this group only scores aspects with this label</label>
              <select id="edit-group-label" value={editingGroup.label || ""} onChange={(e) => setEditingGroup({ ...editingGroup, label: e.target.value || null })} className="input w-full">
                <option value="">No role assigned</option>
                <option value="Product">Product</option>
                <option value="Tech">Tech</option>
                <option value="Business & Ops">Business &amp; Ops</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingGroup(null)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* PARTICIPANT EDIT MODAL */}
      {editingParticipant && (
        <Modal title="Edit Participant" onClose={() => setEditingParticipant(null)}>
          <form onSubmit={handleSaveParticipant} className="space-y-3">
            <div>
              <label htmlFor="edit-participant-name" className="field-label">Participant name</label>
              <input id="edit-participant-name" type="text" required value={editingParticipant.name} onChange={(e) => setEditingParticipant({ ...editingParticipant, name: e.target.value })} className="input w-full" />
            </div>
            <div>
              <label htmlFor="edit-participant-role" className="field-label">Role / Title</label>
              <input id="edit-participant-role" type="text" value={editingParticipant.roleTitle} onChange={(e) => setEditingParticipant({ ...editingParticipant, roleTitle: e.target.value })} className="input w-full" />
            </div>
            <div>
              <label htmlFor="edit-participant-group" className="field-label">Group</label>
              <select id="edit-participant-group" value={editingParticipant.groupId} onChange={(e) => setEditingParticipant({ ...editingParticipant, groupId: e.target.value })} className="input w-full">
                {activeProject?.groups?.map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingParticipant(null)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ASPECT EDIT MODAL */}
      {editingAspect && (
        <Modal title="Edit Aspect" onClose={() => setEditingAspect(null)}>
          <form onSubmit={handleSaveAspect} className="space-y-3">
            <div>
              <label htmlFor="edit-aspect-name" className="field-label">Aspect name</label>
              <input id="edit-aspect-name" type="text" required value={editingAspect.name} onChange={(e) => setEditingAspect({ ...editingAspect, name: e.target.value })} className="input w-full" />
            </div>
            <div>
              <label htmlFor="edit-aspect-desc" className="field-label">Description / Guidance</label>
              <input id="edit-aspect-desc" type="text" value={editingAspect.description} onChange={(e) => setEditingAspect({ ...editingAspect, description: e.target.value })} className="input w-full" />
            </div>
            <div>
              <label htmlFor="edit-aspect-framework" className="field-label">Framework — which score do votes on this aspect feed?</label>
              <select id="edit-aspect-framework" value={editingAspect.framework} onChange={(e) => setEditingAspect({ ...editingAspect, framework: e.target.value })} className="input w-full">
                {FRAMEWORK_OPTIONS.map((fw) => (
                  <option key={fw} value={fw}>{fw}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-aspect-label" className="field-label">Label — which group does this aspect belong to?</label>
              <select id="edit-aspect-label" value={editingAspect.label} onChange={(e) => setEditingAspect({ ...editingAspect, label: e.target.value })} className="input w-full">
                <option value="">— No label —</option>
                {ASPECT_LABEL_OPTIONS.map((lb) => (
                  <option key={lb} value={lb}>{lb}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingAspect(null)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* CONFIRM DIALOG */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => confirmAction.current?.()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
