"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AdminSidebar, { type AdminTab } from "@/components/AdminSidebar";
import { Modal, ConfirmDialog } from "@/components/Modal";
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
        await apiCall(`/api/projects/${editingProjectSlug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectForm.name, description: projectForm.description, isActive: projectForm.isActive }),
        });
      } else {
        await apiCall("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectForm.name, slug: projectForm.slug, description: projectForm.description }),
        });
      }
      setProjectModalOpen(false);
      await initData();
      if (!editingProjectSlug) {
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
