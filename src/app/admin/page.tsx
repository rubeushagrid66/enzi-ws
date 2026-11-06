"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AdminSidebar, { type AdminTab } from "@/components/AdminSidebar";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { slugify } from "@/lib/slugify";
import {
  Shield,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  Sparkles,
  Menu,
} from "lucide-react";

async function apiCall(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const SUMBER_OPTIONS = ["Wawancara", "Survey"];
const PLATFORM_OPTIONS = ["CMS", "DVC"];

export default function AdminDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Projects
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string>("");
  const [activeProject, setActiveProject] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("findings");

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

  // Framework Weights
  const [weightInputs, setWeightInputs] = useState<Array<{ name: string; weight: number }>>([
    { name: "Desirability", weight: 40 },
    { name: "Viability", weight: 30 },
    { name: "Feasibility", weight: 30 },
  ]);
  const [weightSaveStatus, setWeightSaveStatus] = useState<string | null>(null);

  // Finding form (create + edit)
  const [findingModalOpen, setFindingModalOpen] = useState(false);
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  const [findingForm, setFindingForm] = useState({ title: "", description: "", sumber: [] as string[], fitur: "", platform: [] as string[] });

  // Groups and Participants
  const [newGroupName, setNewGroupName] = useState("");
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantRole, setNewParticipantRole] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<{ id: string; name: string; roleTitle: string; groupId: string } | null>(null);

  // Aspects
  const [newAspectName, setNewAspectName] = useState("");
  const [newAspectDesc, setNewAspectDesc] = useState("");
  const [editingAspect, setEditingAspect] = useState<{ id: string; name: string; description: string } | null>(null);

  // Parameters L1/L2/L3
  const [newL1Name, setNewL1Name] = useState("");
  const [newL2Name, setNewL2Name] = useState("");
  const [newL2ParentL1Id, setNewL2ParentL1Id] = useState("");
  const [newL3Name, setNewL3Name] = useState("");
  const [newL3ParentL2Id, setNewL3ParentL2Id] = useState("");
  const [editingParam, setEditingParam] = useState<{ level: "L1" | "L2" | "L3"; id: string; name: string } | null>(null);

  // Users
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "FACILITATOR" });

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
    try {
      const res = await fetch(`/api/projects/${slug}`);
      if (!res.ok) throw new Error("Failed to load project details");
      const data = await res.json();
      setActiveProject(data.project);
      if (data.project?.frameworkWeights) {
        setWeightInputs(data.project.frameworkWeights.map((w: any) => ({ name: w.name, weight: w.weight })));
      }
    } catch (err: any) {
      setError(err.message || "Failed to load project details");
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
      const userRes = await fetch("/api/auth/me");
      const userData = await userRes.json();
      if (!userData?.user) {
        router.push("/admin/login");
        return;
      }
      setCurrentUser(userData.user);
      const projData = await apiCall("/api/projects");
      const loadedProjects = projData.projects || [];
      setProjects(loadedProjects);
      if (loadedProjects.length > 0) {
        const firstSlug = loadedProjects[0].slug;
        setSelectedProjectSlug(firstSlug);
        await loadProjectDetails(firstSlug);
      }
      if (userData.user.role === "ADMIN") await reloadUsers();
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
    loadProjectDetails(slug);
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
      setError(err.message || "Failed to save project");
    }
  };

  const handleDeleteProject = (p: any) => {
    askConfirm(
      "Delete project?",
      `“${p.name}” and all of its findings, groups, participants, aspects and parameters will be permanently deleted. This cannot be undone.`,
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

  // Framework Weights — saved exactly as entered, no auto-calibration.
  const totalRawWeight = weightInputs.reduce((sum, w) => sum + (Number(w.weight) || 0), 0);

  const handleSaveWeights = async () => {
    if (!selectedProjectSlug) return;
    try {
      setError(null);
      setWeightSaveStatus("Saving weights...");
      await apiCall(`/api/projects/${selectedProjectSlug}/weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights: weightInputs }),
      });
      setWeightSaveStatus("Weights saved!");
      await loadProjectDetails(selectedProjectSlug);
      setTimeout(() => setWeightSaveStatus(null), 3000);
    } catch (e: any) {
      setWeightSaveStatus("Failed to save weights");
      setError(e.message || "Failed to save weights");
    }
  };

  // ── Findings ────────────────────────────────────────────────────────────────
  const openCreateFinding = () => {
    setEditingFindingId(null);
    setFindingForm({ title: "", description: "", sumber: [], fitur: "", platform: [] });
    setFindingModalOpen(true);
  };

  const openEditFinding = (f: any) => {
    setEditingFindingId(f.id);
    setFindingForm({
      title: f.title || "",
      description: f.description || "",
      sumber: f.sumber || [],
      fitur: f.fitur || "",
      platform: f.platform || [],
    });
    setFindingModalOpen(true);
  };

  const handleSaveFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!findingForm.title || !selectedProjectSlug) return;
    try {
      setError(null);
      const body = JSON.stringify(findingForm);
      if (editingFindingId) {
        await apiCall(`/api/projects/${selectedProjectSlug}/findings/${editingFindingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } else {
        await apiCall(`/api/projects/${selectedProjectSlug}/findings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      }
      setFindingModalOpen(false);
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to save finding");
    }
  };

  const handleDeleteFinding = (f: any) => {
    askConfirm("Delete finding?", `“${f.title}” will be permanently deleted.`, "Delete finding", async () => {
      try {
        await apiCall(`/api/projects/${selectedProjectSlug}/findings/${f.id}`, { method: "DELETE" });
        setConfirm(null);
        await loadProjectDetails(selectedProjectSlug);
      } catch (err: any) {
        setError(err.message || "Failed to delete finding");
      }
    });
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
        body: JSON.stringify({ name: editingGroup.name.trim() }),
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

  const handleCreateParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipantName || !selectedGroupId) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "PARTICIPANT", name: newParticipantName, roleTitle: newParticipantRole, groupId: selectedGroupId }),
      });
      setNewParticipantName("");
      setNewParticipantRole("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to create participant");
    }
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
        body: JSON.stringify({ name: newAspectName, description: newAspectDesc }),
      });
      setNewAspectName("");
      setNewAspectDesc("");
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
        body: JSON.stringify({ name: editingAspect.name.trim(), description: editingAspect.description }),
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

  // ── Parameters L1/L2/L3 ─────────────────────────────────────────────────────
  const handleCreateL1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newL1Name) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/parameters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "L1", name: newL1Name }),
      });
      setNewL1Name("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to create parameter");
    }
  };

  const handleCreateL2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newL2Name || !newL2ParentL1Id) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/parameters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "L2", name: newL2Name, parentId: newL2ParentL1Id }),
      });
      setNewL2Name("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to create parameter");
    }
  };

  const handleCreateL3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newL3Name || !newL3ParentL2Id) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/parameters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "L3", name: newL3Name, parentId: newL3ParentL2Id }),
      });
      setNewL3Name("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to create parameter");
    }
  };

  const handleSaveParam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParam || !editingParam.name.trim()) return;
    try {
      setError(null);
      await apiCall(`/api/projects/${selectedProjectSlug}/parameters/${editingParam.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: editingParam.level, name: editingParam.name.trim() }),
      });
      setEditingParam(null);
      await loadProjectDetails(selectedProjectSlug);
    } catch (err: any) {
      setError(err.message || "Failed to update parameter");
    }
  };

  const handleDeleteParam = (level: "L1" | "L2" | "L3", item: any) => {
    const childNote = level === "L1" ? " Its subcategories and segments will be deleted too." : level === "L2" ? " Its segments will be deleted too." : "";
    askConfirm("Delete parameter?", `“${item.name}” (${level}) will be permanently deleted.${childNote}`, "Delete parameter", async () => {
      try {
        await apiCall(`/api/projects/${selectedProjectSlug}/parameters/${item.id}?level=${level}`, { method: "DELETE" });
        setConfirm(null);
        await loadProjectDetails(selectedProjectSlug);
      } catch (err: any) {
        setError(err.message || "Failed to delete parameter");
      }
    });
  };

  // ── Users ───────────────────────────────────────────────────────────────────
  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({ name: "", email: "", password: "", role: "FACILITATOR" });
    setUserModalOpen(true);
  };

  const openEditUser = (u: any) => {
    setEditingUser({ id: u.id, name: u.name, role: u.role });
    setUserForm({ name: u.name, email: u.email, password: "", role: u.role });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      if (editingUser) {
        const body: any = { name: userForm.name, role: userForm.role };
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
          body: JSON.stringify({ name: userForm.name, email: userForm.email, password: userForm.password, role: userForm.role }),
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
    findings: activeProject?.findings?.length,
    groups: activeProject?.groups?.length,
    parameters: activeProject?.parametersL1?.length,
    aspects: activeProject?.viabilityAspects?.length,
    projects: projects.length,
    users: usersList.length,
  };

  const selectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setError(null);
    setSidebarOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
            <p className="text-sm font-semibold text-slate-600">Loading Admin Dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar
        activeTab={activeTab}
        onSelect={selectTab}
        projects={projects}
        selectedProjectSlug={selectedProjectSlug}
        onSelectProject={handleProjectSelect}
        onNewProject={openCreateProject}
        activeProject={activeProject}
        counts={sidebarCounts}
        isAdmin={currentUser?.role === "ADMIN"}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar projectSlug={selectedProjectSlug} projectName={activeProject?.name} />

        {/* Admin header */}
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
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
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 sm:block">
                <Shield className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-bold text-slate-900">Admin Configuration Center</h1>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    Logged in: {currentUser?.name} ({currentUser?.role})
                  </span>
                </div>
                <p className="text-sm text-slate-600">Configure projects, findings, participants, parameters, and scoring logic.</p>
              </div>
            </div>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          {error && (
            <div role="alert" className="mb-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="btn-icon shrink-0 !p-1">
                ×
              </button>
            </div>
          )}

          {/* TAB: FINDINGS */}
          {activeTab === "findings" && (
            <section aria-labelledby="findings-heading" className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="findings-heading" className="section-title">Findings (User Needs &amp; Pain Points)</h2>
                  <p className="section-sub">Manage workshop findings with structured tagging (Sumber, Platform, Feature) and scoring linkage.</p>
                </div>
                <button type="button" onClick={openCreateFinding} className="btn-primary">
                  <Plus className="h-4 w-4" /> Add Finding
                </button>
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <caption className="sr-only">Workshop findings for the selected project</caption>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th scope="col" className="px-4 py-3 font-bold text-slate-700">Finding Title</th>
                        <th scope="col" className="px-4 py-3 font-bold text-slate-700">Tags</th>
                        <th scope="col" className="px-4 py-3 font-bold text-slate-700">Quadrant</th>
                        <th scope="col" className="px-4 py-3 text-center font-bold text-slate-700">DVF Score</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeProject?.findings?.length > 0 ? (
                        activeProject.findings.map((f: any) => (
                          <tr key={f.id} className="transition hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{f.title}</div>
                              {f.description && <div className="mt-0.5 line-clamp-1 text-xs text-slate-600">{f.description}</div>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {f.tagsList?.map((t: any, i: number) => (
                                  <span key={i} className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                    {t.category}: {t.value}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {f.scoringStatus?.scored ? (
                                <span className={`rounded border px-2 py-0.5 text-xs font-bold ${
                                  f.feasibilityQuadrant === "QUICK_WINS" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : f.feasibilityQuadrant === "BIG_BETS" ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : f.feasibilityQuadrant === "AVOID" ? "border-rose-200 bg-rose-50 text-rose-800"
                                  : "border-blue-200 bg-blue-50 text-blue-800"
                                }`}>
                                  {f.feasibilityQuadrant?.replace("_", " ") ?? "QUICK WINS"}
                                </span>
                              ) : (
                                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                                  Awaiting scoring
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-mono font-bold text-emerald-700">
                              {f.scores?.composite != null ? f.scores.composite : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button type="button" onClick={() => openEditFinding(f)} aria-label={`Edit finding ${f.title}`} className="btn-icon">
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => handleDeleteFinding(f)} aria-label={`Delete finding ${f.title}`} className="btn-icon-danger">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-8 text-center italic text-slate-600">No findings created yet. Click “Add Finding” above.</td>
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
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                    <Sparkles className="h-4 w-4" /> Framework Weighting
                  </div>
                  <h2 id="weights-heading" className="mt-1 text-xl font-bold text-slate-900">DVF Framework Allocation</h2>
                  <p className="mt-1 text-sm text-slate-600">Enter any number for Desirability, Viability, and Feasibility. Weights are saved exactly as you type them — nothing is recalculated or forced to total 100.</p>
                  <p className="mt-1 text-sm text-slate-600">The composite DVF score uses these weights as-is, so if the total is not 100 the composite will not be out of 100 either.</p>
                </div>

                <div className="space-y-5 pt-2">
                  {weightInputs.map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor={`weight-number-${item.name}`} className="text-sm font-bold text-slate-800">{item.name}</label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Input:</span>
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
                            className="input w-24 px-2 py-1 text-right font-bold"
                          />
                          <span className="font-semibold text-slate-600">%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-bold uppercase tracking-wider text-slate-700">
                      Total: <span className="text-slate-900">{totalRawWeight}%</span>
                    </span>
                    <span className="font-semibold text-slate-600">
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
                    {weightSaveStatus && <span className="text-sm font-semibold text-emerald-700">{weightSaveStatus}</span>}
                  </div>
                  <button type="button" onClick={handleSaveWeights} className="btn-primary">Save Weights</button>
                </div>
              </div>
            </section>
          )}

          {/* TAB: GROUPS & PARTICIPANTS */}
          {activeTab === "groups" && (
            <section aria-labelledby="groups-heading" className="space-y-6">
              <div>
                <h2 id="groups-heading" className="section-title">Groups &amp; Participants</h2>
                <p className="section-sub">Create groups, add participants, and edit or remove them.</p>
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="card space-y-4 p-5">
                  <h3 className="text-sm font-bold text-slate-900">Create New Group</h3>
                  <form onSubmit={handleCreateGroup} className="flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="new-group-name" className="sr-only">Group name</label>
                    <input id="new-group-name" type="text" required placeholder="e.g. Core Product & Strategy" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="input flex-1" />
                    <button type="submit" className="btn-primary">Add Group</button>
                  </form>

                  <div className="border-t border-slate-100 pt-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-900">Add Participant to Group</h3>
                    <form onSubmit={handleCreateParticipant} className="space-y-3">
                      <div>
                        <label htmlFor="participant-group" className="field-label">Target group</label>
                        <select id="participant-group" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} required className="input w-full">
                          <option value="">Select Target Group...</option>
                          {activeProject?.groups?.map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="participant-name" className="field-label">Participant name</label>
                        <input id="participant-name" type="text" required placeholder="Participant Name (e.g. Budi Hartono)" value={newParticipantName} onChange={(e) => setNewParticipantName(e.target.value)} className="input w-full" />
                      </div>
                      <div>
                        <label htmlFor="participant-role" className="field-label">Role / Title</label>
                        <input id="participant-role" type="text" placeholder="Role / Title (e.g. Head of Product)" value={newParticipantRole} onChange={(e) => setNewParticipantRole(e.target.value)} className="input w-full" />
                      </div>
                      <button type="submit" className="btn-dark w-full justify-center">Add Participant</button>
                    </form>
                  </div>
                </div>

                <div className="card space-y-4 p-5">
                  <h3 className="text-sm font-bold text-slate-900">Active Groups &amp; Participants</h3>
                  {activeProject?.groups?.length > 0 ? (
                    <div className="max-h-[500px] space-y-4 overflow-y-auto pr-1">
                      {activeProject.groups.map((group: any) => (
                        <div key={group.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">{group.name} ({group.participants?.length || 0} participants)</span>
                            <span className="flex items-center gap-1">
                              <button type="button" onClick={() => setEditingGroup({ id: group.id, name: group.name })} aria-label={`Edit group ${group.name}`} className="btn-icon"><Edit2 className="h-4 w-4" /></button>
                              <button type="button" onClick={() => handleDeleteGroup(group)} aria-label={`Delete group ${group.name}`} className="btn-icon-danger"><Trash2 className="h-4 w-4" /></button>
                            </span>
                          </div>
                          <div className="space-y-1.5 border-l-2 border-slate-200 pl-2">
                            {group.participants?.map((p: any) => (
                              <div key={p.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                                <span className="min-w-0"><span className="font-medium">{p.name}</span>{p.roleTitle && <span className="text-xs text-slate-500"> — {p.roleTitle}</span>}</span>
                                <span className="flex shrink-0 items-center gap-1">
                                  <button type="button" onClick={() => setEditingParticipant({ id: p.id, name: p.name, roleTitle: p.roleTitle || "", groupId: group.id })} aria-label={`Edit participant ${p.name}`} className="btn-icon !p-1"><Edit2 className="h-3.5 w-3.5" /></button>
                                  <button type="button" onClick={() => handleDeleteParticipant(p)} aria-label={`Delete participant ${p.name}`} className="btn-icon-danger !p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                                </span>
                              </div>
                            ))}
                            {(!group.participants || group.participants.length === 0) && <p className="text-xs italic text-slate-500">No participants yet.</p>}
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

          {/* TAB: PARAMETERS */}
          {activeTab === "parameters" && (
            <section aria-labelledby="parameters-heading" className="space-y-6">
              <div>
                <h2 id="parameters-heading" className="section-title">L1-L3 Parameters &amp; Rules</h2>
                <p className="section-sub">Build the parameter hierarchy used for Desirability scoring.</p>
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="card space-y-5 p-5">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Add Level 1 Category</h3>
                    <p className="mt-0.5 text-sm text-slate-600">Category dimension for Desirability occurrence calculation (e.g. “Sumber Riset”, “Platform”).</p>
                    <form onSubmit={handleCreateL1} className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <label htmlFor="new-l1-name" className="sr-only">Level 1 category name</label>
                      <input id="new-l1-name" type="text" required placeholder="Category Name (e.g. Sumber Riset)" value={newL1Name} onChange={(e) => setNewL1Name(e.target.value)} className="input flex-1" />
                      <button type="submit" className="btn-primary">Add L1</button>
                    </form>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <h3 className="text-sm font-bold text-slate-900">Add Level 2 Subcategory</h3>
                    <form onSubmit={handleCreateL2} className="mt-3 space-y-2">
                      <div>
                        <label htmlFor="l2-parent" className="field-label">Parent L1 category</label>
                        <select id="l2-parent" value={newL2ParentL1Id} onChange={(e) => setNewL2ParentL1Id(e.target.value)} required className="input w-full">
                          <option value="">Select Parent L1 Category...</option>
                          {activeProject?.parametersL1?.map((l1: any) => (<option key={l1.id} value={l1.id}>{l1.name}</option>))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <label htmlFor="new-l2-name" className="sr-only">Level 2 subcategory name</label>
                        <input id="new-l2-name" type="text" required placeholder="Subcategory Name (e.g. Wawancara)" value={newL2Name} onChange={(e) => setNewL2Name(e.target.value)} className="input flex-1" />
                        <button type="submit" className="btn-dark">Add L2</button>
                      </div>
                    </form>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <h3 className="text-sm font-bold text-slate-900">Add Level 3 Segment</h3>
                    <form onSubmit={handleCreateL3} className="mt-3 space-y-2">
                      <div>
                        <label htmlFor="l3-parent" className="field-label">Parent L2 subcategory</label>
                        <select id="l3-parent" value={newL3ParentL2Id} onChange={(e) => setNewL3ParentL2Id(e.target.value)} required className="input w-full">
                          <option value="">Select Parent L2 Subcategory...</option>
                          {activeProject?.parametersL1?.flatMap((l1: any) =>
                            (l1.subCategories || []).map((l2: any) => (
                              <option key={l2.id} value={l2.id}>{l1.name} → {l2.name}</option>
                            ))
                          )}
                        </select>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <label htmlFor="new-l3-name" className="sr-only">Level 3 segment name</label>
                        <input id="new-l3-name" type="text" required placeholder="Segment Name (e.g. Cash Management)" value={newL3Name} onChange={(e) => setNewL3Name(e.target.value)} className="input flex-1" />
                        <button type="submit" className="btn-primary">Add L3</button>
                      </div>
                    </form>
                  </div>
                </div>

                <div className="card space-y-4 p-5">
                  <h3 className="text-sm font-bold text-slate-900">Configured Hierarchy (L1 → L2 → L3)</h3>
                  <div className="max-h-[500px] space-y-4 overflow-y-auto pr-1">
                    {activeProject?.parametersL1?.length > 0 ? activeProject.parametersL1.map((l1: any) => (
                      <div key={l1.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">L1: {l1.name}</span>
                          <span className="flex items-center gap-1">
                            <span className="mr-1 hidden font-mono text-xs text-slate-500 sm:inline">Rules: &gt;66%=3, &gt;33%=2, &lt;=33%=1</span>
                            <button type="button" onClick={() => setEditingParam({ level: "L1", id: l1.id, name: l1.name })} aria-label={`Edit L1 ${l1.name}`} className="btn-icon !p-1"><Edit2 className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => handleDeleteParam("L1", l1)} aria-label={`Delete L1 ${l1.name}`} className="btn-icon-danger !p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                          </span>
                        </div>
                        <div className="mt-2.5 space-y-2 border-l-2 border-emerald-300 pl-3">
                          {l1.subCategories?.map((l2: any) => (
                            <div key={l2.id} className="text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800">↳ L2: {l2.name}</span>
                                <span className="flex items-center gap-1">
                                  <button type="button" onClick={() => setEditingParam({ level: "L2", id: l2.id, name: l2.name })} aria-label={`Edit L2 ${l2.name}`} className="btn-icon !p-1"><Edit2 className="h-3.5 w-3.5" /></button>
                                  <button type="button" onClick={() => handleDeleteParam("L2", l2)} aria-label={`Delete L2 ${l2.name}`} className="btn-icon-danger !p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                                </span>
                              </div>
                              {l2.segments?.length > 0 && (
                                <div className="mt-1 space-y-1 pl-4 text-xs text-slate-600">
                                  {l2.segments.map((l3: any) => (
                                    <div key={l3.id} className="flex items-center justify-between gap-2">
                                      <span>• L3: {l3.name}</span>
                                      <span className="flex items-center gap-1">
                                        <button type="button" onClick={() => setEditingParam({ level: "L3", id: l3.id, name: l3.name })} aria-label={`Edit L3 ${l3.name}`} className="btn-icon !p-1"><Edit2 className="h-3.5 w-3.5" /></button>
                                        <button type="button" onClick={() => handleDeleteParam("L3", l3)} aria-label={`Delete L3 ${l3.name}`} className="btn-icon-danger !p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          {(!l1.subCategories || l1.subCategories.length === 0) && <p className="text-xs italic text-slate-500">No subcategories yet.</p>}
                        </div>
                      </div>
                    )) : (
                      <p className="py-4 text-sm italic text-slate-600">No parameters configured yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* TAB: ASPECTS */}
          {activeTab === "aspects" && (
            <section aria-labelledby="aspects-heading" className="max-w-2xl space-y-6">
              <div className="card space-y-5 p-6">
                <div>
                  <h2 id="aspects-heading" className="text-base font-bold text-slate-900">Viability Aspects (Aspek)</h2>
                  <p className="mt-0.5 text-sm text-slate-600">Define business/market aspects for the participant validation voting matrix.</p>
                </div>
                <form onSubmit={handleCreateAspect} className="space-y-3">
                  <div>
                    <label htmlFor="new-aspect-name" className="field-label">Aspect name</label>
                    <input id="new-aspect-name" type="text" required placeholder="Aspect Name (e.g. Market Demand)" value={newAspectName} onChange={(e) => setNewAspectName(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label htmlFor="new-aspect-desc" className="field-label">Description / Guidance</label>
                    <input id="new-aspect-desc" type="text" placeholder="Description / Guidance (e.g. Customer adoption and willingness to pay)" value={newAspectDesc} onChange={(e) => setNewAspectDesc(e.target.value)} className="input w-full" />
                  </div>
                  <button type="submit" className="btn-primary">Add Aspect</button>
                </form>
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Active Aspects ({activeProject?.viabilityAspects?.length || 0})</h3>
                  {activeProject?.viabilityAspects?.map((aspect: any) => (
                    <div key={aspect.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{aspect.name}</div>
                        {aspect.description && <div className="mt-0.5 text-xs text-slate-600">{aspect.description}</div>}
                      </div>
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setEditingAspect({ id: aspect.id, name: aspect.name, description: aspect.description || "" })} aria-label={`Edit aspect ${aspect.name}`} className="btn-icon"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => handleDeleteAspect(aspect)} aria-label={`Delete aspect ${aspect.name}`} className="btn-icon-danger"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* TAB: PROJECTS */}
          {activeTab === "projects" && (
            <section aria-labelledby="projects-heading" className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="projects-heading" className="section-title">All Workshop Projects</h2>
                  <p className="section-sub">Switch between workshops or create new project workspaces.</p>
                </div>
                <button type="button" onClick={openCreateProject} className="btn-primary"><Plus className="h-4 w-4" /> Create Project</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((p) => (
                  <div key={p.id} className={`card flex flex-col justify-between p-5 transition ${p.slug === selectedProjectSlug ? "border-emerald-500 ring-2 ring-emerald-500/20" : "hover:border-slate-300"}`}>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">/{p.slug}</span>
                        <span className="text-xs font-semibold text-emerald-600">{p.isActive ? "Active" : "Archived"}</span>
                      </div>
                      <h3 className="mt-3 text-base font-bold text-slate-900">{p.name}</h3>
                      {p.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <button type="button" onClick={() => handleProjectSelect(p.slug)} className="text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                        Manage Config →
                      </button>
                      <span className="flex items-center gap-1">
                        <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800">
                          <span>Viewer</span><ExternalLink className="h-3 w-3" />
                        </a>
                        <button type="button" onClick={() => openEditProject(p)} aria-label={`Edit project ${p.name}`} className="btn-icon !p-1"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => handleDeleteProject(p)} aria-label={`Delete project ${p.name}`} className="btn-icon-danger !p-1"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TAB: USERS (ADMIN ONLY) */}
          {activeTab === "users" && currentUser?.role === "ADMIN" && (
            <section aria-labelledby="users-heading" className="max-w-3xl space-y-6">
              <div className="card space-y-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id="users-heading" className="text-base font-bold text-slate-900">User Management</h2>
                    <p className="mt-0.5 text-sm text-slate-600">Create and manage facilitator and admin credentials.</p>
                  </div>
                  <button type="button" onClick={openCreateUser} className="btn-primary"><Plus className="h-4 w-4" /> Create User</button>
                </div>
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Existing Credentials ({usersList.length})</h3>
                  {usersList.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{u.name}{u.id === currentUser?.id && <span className="ml-2 text-xs font-medium text-slate-500">(you)</span>}</div>
                        <div className="font-mono text-xs text-slate-600">{u.email}</div>
                      </div>
                      <span className="flex items-center gap-2">
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-700">{u.role}</span>
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
                      Saving will move this project to <span className="font-mono font-bold">/{preview}</span> — the old link <span className="font-mono">/{editingProjectSlug}</span> will stop working.
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
        <Modal title={editingFindingId ? "Edit Finding" : "Create New Finding"} onClose={() => setFindingModalOpen(false)} wide>
          <form onSubmit={handleSaveFinding} className="space-y-3">
            <div>
              <label htmlFor="finding-title" className="field-label">Finding Title (User Need / Pain Point)</label>
              <input id="finding-title" type="text" required placeholder="e.g. Tampilan Membingungkan" value={findingForm.title} onChange={(e) => setFindingForm((f) => ({ ...f, title: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label htmlFor="finding-desc" className="field-label">Description</label>
              <textarea id="finding-desc" rows={2} placeholder="Elaborate on participant feedback..." value={findingForm.description} onChange={(e) => setFindingForm((f) => ({ ...f, description: e.target.value }))} className="input w-full" />
            </div>
            <fieldset>
              <legend className="field-label">Sumber</legend>
              <div className="flex flex-wrap gap-4">
                {SUMBER_OPTIONS.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={findingForm.sumber.includes(opt)} onChange={(e) => setFindingForm((f) => ({ ...f, sumber: e.target.checked ? [...f.sumber, opt] : f.sumber.filter((s) => s !== opt) }))} className="h-4 w-4 rounded accent-emerald-600" />
                    <span className="text-sm text-slate-700">{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
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
            <div className="flex items-center justify-end gap-2 pt-3">
              <button type="button" onClick={() => setFindingModalOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editingFindingId ? "Save Changes" : "Create Finding"}</button>
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
              </select>
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
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingAspect(null)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* PARAMETER EDIT MODAL */}
      {editingParam && (
        <Modal title={`Edit ${editingParam.level} Parameter`} onClose={() => setEditingParam(null)}>
          <form onSubmit={handleSaveParam} className="space-y-3">
            <div>
              <label htmlFor="edit-param-name" className="field-label">{editingParam.level} name</label>
              <input id="edit-param-name" type="text" required value={editingParam.name} onChange={(e) => setEditingParam({ ...editingParam, name: e.target.value })} className="input w-full" />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingParam(null)} className="btn-secondary">Cancel</button>
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
