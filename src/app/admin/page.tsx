"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import {
  Shield,
  Layers,
  FolderGit2,
  Users2,
  Sliders,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Tag,
  ExternalLink,
  ChevronRight,
  Sparkles,
  UserCheck,
  ListFilter,
  CheckCircle2,
} from "lucide-react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Projects
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string>("");
  const [activeProject, setActiveProject] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    "projects" | "findings" | "weights" | "groups" | "parameters" | "aspects" | "users"
  >("findings");

  // Project creation modal state
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSlug, setNewProjectSlug] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Framework Weights & Auto-Calibration State
  const [weightInputs, setWeightInputs] = useState<
    Array<{ name: string; weight: number }>
  >([
    { name: "Desirability", weight: 40 },
    { name: "Viability", weight: 30 },
    { name: "Feasibility", weight: 30 },
  ]);
  const [weightSaveStatus, setWeightSaveStatus] = useState<string | null>(null);

  // Finding creation modal state
  const [newFindingTitle, setNewFindingTitle] = useState("");
  const [newFindingDesc, setNewFindingDesc] = useState("");
  const [newFindingSumber, setNewFindingSumber] = useState<string[]>([]);
  const [newFindingFitur, setNewFindingFitur] = useState("");
  const [newFindingPlatform, setNewFindingPlatform] = useState<string[]>([]);
  const [isCreatingFinding, setIsCreatingFinding] = useState(false);

  // Groups and Participants state
  const [newGroupName, setNewGroupName] = useState("");
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantRole, setNewParticipantRole] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");

  // Aspects state
  const [newAspectName, setNewAspectName] = useState("");
  const [newAspectDesc, setNewAspectDesc] = useState("");

  // Parameters L1/L2/L3 state
  const [newL1Name, setNewL1Name] = useState("");
  const [newL2Name, setNewL2Name] = useState("");
  const [newL2ParentL1Id, setNewL2ParentL1Id] = useState("");
  const [newL3Name, setNewL3Name] = useState("");
  const [newL3ParentL2Id, setNewL3ParentL2Id] = useState("");

  // Users state
  const [usersList, setUsersList] = useState<any[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("FACILITATOR");

  // Load user session and projects
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

      // Load projects
      const projRes = await fetch("/api/projects");
      const projData = await projRes.json();
      const loadedProjects = projData.projects || [];
      setProjects(loadedProjects);

      if (loadedProjects.length > 0) {
        const firstSlug = loadedProjects[0].slug;
        setSelectedProjectSlug(firstSlug);
        await loadProjectDetails(firstSlug);
      }

      // If admin, load users
      if (userData.user.role === "ADMIN") {
        const usersRes = await fetch("/api/users");
        if (usersRes.ok) {
          const uData = await usersRes.json();
          setUsersList(uData.users || []);
        }
      }
    } catch (e) {
      console.error("Initialization error:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDetails = async (slug: string) => {
    try {
      const res = await fetch(`/api/projects/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setActiveProject(data.project);

        // Pre-fill weights
        if (data.project?.frameworkWeights) {
          const weights = data.project.frameworkWeights.map((w: any) => ({
            name: w.name,
            weight: w.weight,
          }));
          setWeightInputs(weights);
        }
      }
    } catch (err) {
      console.error("Failed to load project details:", err);
    }
  };

  useEffect(() => {
    initData();
  }, []);

  const handleProjectSelect = (slug: string) => {
    setSelectedProjectSlug(slug);
    loadProjectDetails(slug);
  };

  // Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName || !newProjectSlug) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName,
          slug: newProjectSlug,
          description: newProjectDesc,
        }),
      });
      if (res.ok) {
        setIsCreatingProject(false);
        setNewProjectName("");
        setNewProjectSlug("");
        setNewProjectDesc("");
        initData();
      }
    } catch (e) {
      console.error("Failed to create project:", e);
    }
  };

  // Auto-Calibration of Framework Weights
  const totalRawWeight = weightInputs.reduce((sum, w) => sum + (Number(w.weight) || 0), 0);
  const normalizedPreview = weightInputs.map((w) => ({
    name: w.name,
    weight: totalRawWeight > 0 ? Number(((w.weight / totalRawWeight) * 100).toFixed(1)) : 0,
  }));

  const handleSaveWeights = async () => {
    if (!selectedProjectSlug) return;
    try {
      setWeightSaveStatus("Saving & Auto-calibrating...");
      const res = await fetch(`/api/projects/${selectedProjectSlug}/weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights: weightInputs }),
      });
      if (res.ok) {
        setWeightSaveStatus("Successfully calibrated to 100% and saved!");
        await loadProjectDetails(selectedProjectSlug);
        setTimeout(() => setWeightSaveStatus(null), 3000);
      }
    } catch (e) {
      setWeightSaveStatus("Failed to save weights");
    }
  };

  // Create Finding
  const handleCreateFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFindingTitle || !selectedProjectSlug) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectSlug}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newFindingTitle,
          description: newFindingDesc,
          sumber: newFindingSumber,
          fitur: newFindingFitur,
          platform: newFindingPlatform,
        }),
      });
      if (res.ok) {
        setIsCreatingFinding(false);
        setNewFindingTitle("");
        setNewFindingDesc("");
        setNewFindingSumber([]);
        setNewFindingFitur("");
        setNewFindingPlatform([]);
        await loadProjectDetails(selectedProjectSlug);
      }
    } catch (e) {
      console.error("Failed to create finding:", e);
    }
  };

  // Delete Finding
  const handleDeleteFinding = async (id: string) => {
    if (!confirm("Are you sure you want to delete this finding?")) return;
    try {
      await fetch(`/api/projects/${selectedProjectSlug}/findings/${id}`, {
        method: "DELETE",
      });
      await loadProjectDetails(selectedProjectSlug);
    } catch (e) {
      console.error("Failed to delete finding:", e);
    }
  };

  // Create Group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    try {
      await fetch(`/api/projects/${selectedProjectSlug}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "GROUP", name: newGroupName }),
      });
      setNewGroupName("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (e) {
      console.error(e);
    }
  };

  // Create Participant
  const handleCreateParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipantName || !selectedGroupId) return;
    try {
      await fetch(`/api/projects/${selectedProjectSlug}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PARTICIPANT",
          name: newParticipantName,
          roleTitle: newParticipantRole,
          groupId: selectedGroupId,
        }),
      });
      setNewParticipantName("");
      setNewParticipantRole("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (e) {
      console.error(e);
    }
  };

  // Create Aspect
  const handleCreateAspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAspectName) return;
    try {
      await fetch(`/api/projects/${selectedProjectSlug}/aspects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newAspectName, description: newAspectDesc }),
      });
      setNewAspectName("");
      setNewAspectDesc("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (e) {
      console.error(e);
    }
  };

  // Create Parameter L1
  const handleCreateL1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newL1Name) return;
    try {
      await fetch(`/api/projects/${selectedProjectSlug}/parameters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "L1", name: newL1Name }),
      });
      setNewL1Name("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (e) {
      console.error(e);
    }
  };

  // Create Parameter L2
  const handleCreateL2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newL2Name || !newL2ParentL1Id) return;
    try {
      await fetch(`/api/projects/${selectedProjectSlug}/parameters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "L2",
          name: newL2Name,
          parentId: newL2ParentL1Id,
        }),
      });
      setNewL2Name("");
      await loadProjectDetails(selectedProjectSlug);
    } catch (e) {
      console.error(e);
    }
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword) return;
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      if (res.ok) {
        setNewUserName("");
        setNewUserEmail("");
        setNewUserPassword("");
        const uRes = await fetch("/api/users");
        if (uRes.ok) {
          const uData = await uRes.json();
          setUsersList(uData.users || []);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
            <p className="text-sm font-semibold text-slate-600">
              Loading Admin Dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar projectSlug={selectedProjectSlug} projectName={activeProject?.name} />

      {/* Admin Subheader & Project Switcher */}
      <section className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  Admin Configuration Center
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Logged in: {currentUser?.name} ({currentUser?.role})
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Configure projects, findings, participants, parameters, and scoring logic.
              </p>
            </div>
          </div>

          {/* Project Switcher & New Project Button */}
          <div className="flex items-center gap-2">
            <select
              value={selectedProjectSlug}
              onChange={(e) => handleProjectSelect(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name} (/{p.slug})
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsCreatingProject(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Project</span>
            </button>

            {selectedProjectSlug && (
              <a
                href={`/${selectedProjectSlug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <span>Open Landing Page</span>
              </a>
            )}
          </div>
        </div>

        {/* Admin Navigation Tabs */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex overflow-x-auto border-t border-slate-100">
          {[
            { id: "findings", label: "Findings & Tags", count: activeProject?.findings?.length },
            { id: "weights", label: "Framework & Weighting", badge: "Auto-Calibrate" },
            { id: "groups", label: "Groups & Participants", count: activeProject?.groups?.length },
            { id: "parameters", label: "L1-L3 Parameters & Rules", count: activeProject?.parametersL1?.length },
            { id: "aspects", label: "Viability Aspects", count: activeProject?.viabilityAspects?.length },
            { id: "projects", label: "All Projects", count: projects.length },
            ...(currentUser?.role === "ADMIN" ? [{ id: "users", label: "Users & Roles", count: usersList.length }] : []),
          ].map((tab: any) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition -mb-px ${
                activeTab === tab.id
                  ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-mono">
                  {tab.count}
                </span>
              )}
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Main Admin Content Body */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 flex-1 w-full">
        {/* TAB 1: FINDINGS & DYNAMIC TAGGING */}
        {activeTab === "findings" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Findings (User Needs & Pain Points)
                </h2>
                <p className="text-xs text-slate-500">
                  Manage workshop findings with dynamic tagging (Sumber, Platform, Feature) and scoring linkage.
                </p>
              </div>
              <button
                onClick={() => setIsCreatingFinding(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs"
              >
                <Plus className="h-4 w-4" />
                <span>Add Finding</span>
              </button>
            </div>

            {/* Findings Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70">
                    <th className="py-3 px-4 font-bold text-slate-700">Finding Title</th>
                    <th className="py-3 px-4 font-bold text-slate-700">Dynamic Tags</th>
                    <th className="py-3 px-4 font-bold text-slate-700">Quadrant</th>
                    <th className="py-3 px-4 font-bold text-slate-700 text-center">DVF Score</th>
                    <th className="py-3 px-4 font-bold text-slate-700 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeProject?.findings?.length > 0 ? (
                    activeProject.findings.map((f: any) => (
                      <tr key={f.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{f.title}</div>
                          {f.description && (
                            <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {f.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {f.tagsList?.map((t: any, i: number) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                {t.category}: {t.value}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              f.feasibilityQuadrant === "QUICK_WINS"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : f.feasibilityQuadrant === "BIG_BETS"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : f.feasibilityQuadrant === "AVOID"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-blue-50 text-blue-800 border-blue-200"
                            }`}
                          >
                            {f.feasibilityQuadrant?.replace("_", " ") ?? "QUICK WINS"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-700 font-mono">
                          {f.scores?.composite ?? 0}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteFinding(f.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Finding"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                        No findings created yet. Click "Add Finding" above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: FRAMEWORK WEIGHTING & AUTO-CALIBRATION ENGINE */}
        {activeTab === "weights" && (
          <div className="space-y-6 max-w-3xl">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                  <Sparkles className="h-4 w-4" />
                  <span>Auto-Calibration Weighting Engine</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  DVF Framework Allocation
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Adjust the relative importance of Desirability, Viability, and Feasibility. If your weights do not equal 100%, the engine automatically normalizes them proportionally.
                </p>
              </div>

              {/* Weight Sliders */}
              <div className="space-y-5 pt-2">
                {weightInputs.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 text-sm">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Input:</span>
                        <input
                          type="number"
                          value={item.weight}
                          min={0}
                          max={100}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const next = [...weightInputs];
                            next[idx].weight = val;
                            setWeightInputs(next);
                          }}
                          className="w-16 px-2 py-1 text-xs text-right font-bold rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-slate-500 font-semibold">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={item.weight}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const next = [...weightInputs];
                        next[idx].weight = val;
                        setWeightInputs(next);
                      }}
                      className="w-full accent-emerald-600"
                    />
                  </div>
                ))}
              </div>

              {/* Auto-Calibration Preview Card */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Raw Total: <span className={totalRawWeight !== 100 ? "text-amber-600" : "text-emerald-600"}>{totalRawWeight}%</span>
                  </span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Auto-Calibrated Total: 100.0%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {normalizedPreview.map((np, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-200 text-center">
                      <div className="text-[10px] text-slate-500 font-medium">{np.name}</div>
                      <div className="text-base font-extrabold text-slate-900 mt-0.5">
                        {np.weight}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  {weightSaveStatus && (
                    <span className="text-xs font-semibold text-emerald-700 animate-fade-in">
                      {weightSaveStatus}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSaveWeights}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs"
                >
                  Save & Calibrate Weights
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: GROUPS & PARTICIPANTS */}
        {activeTab === "groups" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Create Group Form */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm">Create New Group</h3>
                <form onSubmit={handleCreateGroup} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Core Product & Strategy"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                  >
                    Add Group
                  </button>
                </form>

                {/* Create Participant Form */}
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="font-bold text-slate-900 text-sm mb-3">Add Participant to Group</h3>
                  <form onSubmit={handleCreateParticipant} className="space-y-3">
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Select Target Group...</option>
                      {activeProject?.groups?.map((g: any) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      required
                      placeholder="Participant Name (e.g. Budi Hartono)"
                      value={newParticipantName}
                      onChange={(e) => setNewParticipantName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />

                    <input
                      type="text"
                      placeholder="Role / Title (e.g. Head of Product)"
                      value={newParticipantRole}
                      onChange={(e) => setNewParticipantRole(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />

                    <button
                      type="submit"
                      className="w-full py-2 rounded-xl text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900 transition"
                    >
                      Add Participant
                    </button>
                  </form>
                </div>
              </div>

              {/* Right: Existing Groups & Participants List */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm">Active Groups & Participants</h3>
                {activeProject?.groups?.length > 0 ? (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {activeProject.groups.map((group: any) => (
                      <div key={group.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                          {group.name} ({group.participants?.length || 0} participants)
                        </div>
                        <div className="space-y-1.5 pl-2 border-l-2 border-slate-200">
                          {group.participants?.map((p: any) => (
                            <div key={p.id} className="text-xs text-slate-700 flex items-center justify-between">
                              <span className="font-medium">{p.name}</span>
                              <span className="text-[10px] text-slate-400">{p.roleTitle}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-4">No groups created yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: L1-L3 PARAMETERS & RULES */}
        {activeTab === "parameters" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Parameter Form */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Add Level 1 Category</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Category dimension for Desirability occurrence calculation (e.g. "Sumber Riset", "Platform").
                  </p>
                  <form onSubmit={handleCreateL1} className="mt-3 flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Category Name (e.g. Sumber Riset)"
                      value={newL1Name}
                      onChange={(e) => setNewL1Name(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                    >
                      Add L1
                    </button>
                  </form>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h3 className="font-bold text-slate-900 text-sm">Add Level 2 Subcategory</h3>
                  <form onSubmit={handleCreateL2} className="mt-3 space-y-2">
                    <select
                      value={newL2ParentL1Id}
                      onChange={(e) => setNewL2ParentL1Id(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Select Parent L1 Category...</option>
                      {activeProject?.parametersL1?.map((l1: any) => (
                        <option key={l1.id} value={l1.id}>
                          {l1.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Subcategory Name (e.g. Wawancara)"
                        value={newL2Name}
                        onChange={(e) => setNewL2Name(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900 transition"
                      >
                        Add L2
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Hierarchy Tree View */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm">Configured Hierarchy (L1 → L2 → L3)</h3>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  {activeProject?.parametersL1?.map((l1: any) => (
                    <div key={l1.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-800 text-xs uppercase tracking-wider">
                          L1: {l1.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Rules: &gt;66%=3, &gt;33%=2, &lt;=33%=1
                        </span>
                      </div>
                      <div className="mt-2.5 space-y-2 pl-3 border-l-2 border-emerald-300">
                        {l1.subCategories?.map((l2: any) => (
                          <div key={l2.id} className="text-xs">
                            <span className="font-semibold text-slate-800">
                              ↳ L2: {l2.name}
                            </span>
                            {l2.segments?.length > 0 && (
                              <div className="pl-4 mt-1 space-y-0.5 text-[11px] text-slate-500">
                                {l2.segments.map((l3: any) => (
                                  <div key={l3.id}>• L3: {l3.name}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: VIABILITY ASPECTS */}
        {activeTab === "aspects" && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Viability Aspects (Aspek)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define business/market aspects for the participant validation voting matrix.
                </p>
              </div>

              <form onSubmit={handleCreateAspect} className="space-y-3">
                <input
                  type="text"
                  required
                  placeholder="Aspect Name (e.g. Market Demand)"
                  value={newAspectName}
                  onChange={(e) => setNewAspectName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Description / Guidance (e.g. Customer adoption and willingness to pay)"
                  value={newAspectDesc}
                  onChange={(e) => setNewAspectDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  Add Aspect
                </button>
              </form>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Active Aspects ({activeProject?.viabilityAspects?.length || 0})
                </h4>
                {activeProject?.viabilityAspects?.map((aspect: any) => (
                  <div
                    key={aspect.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 text-xs">
                        {aspect.name}
                      </div>
                      {aspect.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {aspect.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ALL PROJECTS */}
        {activeTab === "projects" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">All Workshop Projects</h2>
                <p className="text-xs text-slate-500">
                  Switch between workshops or create new project workspaces.
                </p>
              </div>
              <button
                onClick={() => setIsCreatingProject(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
              >
                <Plus className="h-4 w-4" />
                <span>Create Project</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`p-5 rounded-2xl border transition bg-white ${
                    p.slug === selectedProjectSlug
                      ? "border-emerald-500 ring-2 ring-emerald-500/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                      /{p.slug}
                    </span>
                    <span className="text-xs text-emerald-600 font-semibold">
                      {p.isActive ? "Active" : "Archived"}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-slate-900">{p.name}</h3>
                  {p.description && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => handleProjectSelect(p.slug)}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Manage Config →
                    </button>
                    <a
                      href={`/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                      <span>Viewer</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: USER MANAGEMENT (ADMIN ONLY) */}
        {activeTab === "users" && currentUser?.role === "ADMIN" && (
          <div className="space-y-6 max-w-3xl">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div>
                <h3 className="font-bold text-slate-900 text-base">User Management</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Create and manage facilitator and admin credentials.
                </p>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email Address"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="FACILITATOR">Facilitator</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  Create User
                </button>
              </form>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Existing Credentials ({usersList.length})
                </h4>
                {usersList.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 text-xs">
                        {u.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {u.email}
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CREATE PROJECT MODAL */}
      {isCreatingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Create New Workshop Project
            </h3>
            <form onSubmit={handleCreateProject} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise Cash Management"
                  value={newProjectName}
                  onChange={(e) => {
                    setNewProjectName(e.target.value);
                    if (!newProjectSlug) {
                      setNewProjectSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, "")
                      );
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  URL Slug (Dynamic Routing)
                </label>
                <div className="flex items-center">
                  <span className="px-2.5 py-2 text-xs text-slate-400 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl font-mono">
                    /
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="project-slug"
                    value={newProjectSlug}
                    onChange={(e) => setNewProjectSlug(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-r-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Workshop objectives and context..."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingProject(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE FINDING MODAL WITH DYNAMIC TAGGING */}
      {isCreatingFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Create New Finding
            </h3>
            <form onSubmit={handleCreateFinding} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Finding Title (User Need / Pain Point)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tampilan Membingungkan"
                  value={newFindingTitle}
                  onChange={(e) => setNewFindingTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Elaborate on participant feedback..."
                  value={newFindingDesc}
                  onChange={(e) => setNewFindingDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Structured Fields: Sumber, Fitur, Platform */}
              <div className="space-y-4">
                {/* Sumber */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    Sumber
                  </label>
                  <div className="flex gap-3">
                    {["Wawancara", "Survey"].map((opt) => (
                      <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newFindingSumber.includes(opt)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewFindingSumber([...newFindingSumber, opt]);
                            } else {
                              setNewFindingSumber(newFindingSumber.filter((s) => s !== opt));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded accent-emerald-600"
                        />
                        <span className="text-xs text-slate-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Fitur */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    Fitur
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bulk Payment"
                    value={newFindingFitur}
                    onChange={(e) => setNewFindingFitur(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Platform */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    Platform
                  </label>
                  <div className="flex gap-3">
                    {["CMS", "DVC"].map((opt) => (
                      <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newFindingPlatform.includes(opt)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewFindingPlatform([...newFindingPlatform, opt]);
                            } else {
                              setNewFindingPlatform(newFindingPlatform.filter((p) => p !== opt));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded accent-emerald-600"
                        />
                        <span className="text-xs text-slate-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreatingFinding(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  Create Finding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
