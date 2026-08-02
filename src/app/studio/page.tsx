"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Sparkles,
  Plus,
  Edit3,
  Trash2,
  ArrowRight,
  Layers,
  Clock,
  Film,
  X,
  Bot,
  Award,
  BookOpen,
  Target,
  FileText,
  Compass,
  Check,
  Brain,
  Sliders,
  Send,
  Loader2,
  Paperclip,
  Mic,
  MessageSquare,
  Sparkle,
  Settings2,
  GitMerge,
  Cpu,
  ImagePlus
} from "lucide-react";
import { Button } from "@/components/studio/creator-button";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  cover_image?: string | null;
  default_style?: string;
  default_aspect?: string;
}
interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  routedAgent?: {
    name: string;
    iconColor: string;
  } | null;
}

interface ChatSession {
  id: string;
  title: string;
  agentId: string; // "orchestrator", "writer", "strategist", or custom ID
  messages: Message[];
}

interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  instructions: string;
  iconColor: string; // "purple" | "pink" | "blue" | "emerald" | "amber"
}

interface BootstrapData {
  userId: string;
  projectId: string;
  episodeId: string;
  sessionId: string;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs navigation
  const [activeTab, setActiveTab] = useState<"bases" | "brand" | "content">("bases");

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false);
  const [isCustomInstructionsOpen, setIsCustomInstructionsOpen] = useState(false);

  // Form State
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Cover image state
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Action Loading states
  const [actionLoading, setActionLoading] = useState(false);

  // --- BRAND TAB STATE ---
  const [brandGoals, setBrandGoals] = useState(
    "1. Increase cinematic brand engagement by 45% using generative video content.\n2. Maintain consistent photorealistic visual outputs for product storytelling.\n3. Streamline script-to-video workflow efficiency down to 10 minutes per episode."
  );
  const [brandGuidelines, setBrandGuidelines] = useState(
    "Visual Style: Clean, minimalist, cyberpunk elements, neon violet accents.\nTone of Voice: Cynical, futuristic, direct, professional, immersive.\nResolution: 16:9 cinematic horizontal aspect ratio, 1080p outputs."
  );
  const [isBrandSaved, setIsBrandSaved] = useState(false);

  // --- BOOTSTRAP DATA FOR CLAUDE AGENT SDK ---
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);

  // --- AGENT REGISTRY STATE ---
  const defaultAgents: Agent[] = [
    {
      id: "writer",
      name: "viral script writer",
      role: "Writer",
      description: "Generates high-engagement screenplays in Unicorn AI hook formats.",
      instructions: "Write the script in the Unicorn AI standard screen-recording script format:\n- Opening line / hook\n- What to say while showing the screen\n- Step-by-step explanation\n- Simple wording\n- Pausing timestamps\n- UI Highlights\n- Transitions\n- CTA/recap",
      iconColor: "purple"
    },
    {
      id: "strategist",
      name: "content strategist",
      role: "Strategist",
      description: "Compiles distribution launch roadmaps and social media strategies.",
      instructions: "Compile a Content Strategist Campaign Roadmap highlighting days, distribution formats, targets, and launch focus.",
      iconColor: "pink"
    }
  ];

  const [customAgents, setCustomAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>("orchestrator");

  // Create Agent Form State
  const [agentName, setAgentName] = useState("");
  const [agentRole, setAgentRole] = useState("");
  const [agentDesc, setAgentDesc] = useState("");
  const [agentInst, setAgentInst] = useState("");
  const [agentColor, setAgentColor] = useState("blue");

  // --- CONTENT AGENTS CHAT STATE ---
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // --- CUSTOM INSTRUCTIONS STATE ---
  const [tempInstructions, setTempInstructions] = useState("");

  const allAgents = [...defaultAgents, ...customAgents];
  const activeAgent = allAgents.find((a) => a.id === activeAgentId);

  useEffect(() => {
    fetchProjects();
    const savedGoals = localStorage.getItem("creator_brand_goals");
    const savedGuidelines = localStorage.getItem("creator_brand_guidelines");
    if (savedGoals) setBrandGoals(savedGoals);
    if (savedGuidelines) setBrandGuidelines(savedGuidelines);

    // Load custom agents
    const savedAgents = localStorage.getItem("creator_custom_agents");
    if (savedAgents) {
      try {
        setCustomAgents(JSON.parse(savedAgents));
      } catch (e) {
        console.error(e);
      }
    }

    // Bootstrap demo project to hook up Claude Agent SDK
    (async () => {
      try {
        const res = await fetch("/api/studio/bootstrap");
        const j = await res.json();
        if (j.ok) {
          const data: BootstrapData = {
            userId: j.userId,
            projectId: j.projectId,
            episodeId: j.episodeId,
            sessionId: j.sessionId
          };
          setBootstrapData(data);

          // Load existing sessions or create the default orchestrator session
          const initialSessions: ChatSession[] = [
            {
              id: j.sessionId,
              title: "unicorn ai orchestrator",
              agentId: "orchestrator",
              messages: [
                {
                  role: "assistant",
                  content: "Welcome to the Unified Unicorn AI Orchestrator! You can chat with all agents simultaneously here.\n\nType your request (e.g. write a script beat, map a calendar, or invoke a custom agent) and I will route it to the best expert agent automatically.",
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
              ]
            }
          ];

          setChatSessions(initialSessions);
          setActiveSessionId(j.sessionId);
        }
      } catch (err) {
        console.error("Bootstrap error", err);
      }
    })();
  }, []);

  const handleCoverImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverImageFile(file);
    setCoverImagePreview(URL.createObjectURL(file));
  };

  const uploadCoverImage = async (): Promise<string | null> => {
    if (!coverImageFile || !bootstrapData) return null;
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append("file", coverImageFile);
      form.append("userId", bootstrapData.userId);
      const res = await fetch("/api/studio/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.url as string;
    } catch (err) {
      console.error("Cover upload failed", err);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const resetCoverImage = () => {
    setCoverImageFile(null);
    setCoverImagePreview(null);
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/studio/projects");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load bases");
      }
      setProjects(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    try {
      setActionLoading(true);
      const coverUrl = await uploadCoverImage();
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, description: projectDesc, cover_image: coverUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create base");
      }
      await fetchProjects();
      setIsCreateOpen(false);
      setProjectName("");
      setProjectDesc("");
      resetCoverImage();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating base");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !projectName.trim()) return;

    try {
      setActionLoading(true);
      const coverUrl = await uploadCoverImage();
      const patchBody: Record<string, any> = { name: projectName, description: projectDesc };
      if (coverUrl) patchBody.cover_image = coverUrl;
      const res = await fetch(`/api/studio/projects/${selectedProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update base");
      }
      await fetchProjects();
      setIsEditOpen(false);
      setSelectedProject(null);
      setProjectName("");
      setProjectDesc("");
      resetCoverImage();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating base");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/studio/projects/${selectedProject.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete base");
      }
      await fetchProjects();
      setIsDeleteOpen(false);
      setSelectedProject(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting base");
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (project: Project) => {
    setSelectedProject(project);
    setProjectName(project.name);
    setProjectDesc(project.description || "");
    setCoverImagePreview(project.cover_image || null);
    setCoverImageFile(null);
    setIsEditOpen(true);
  };

  const openDeleteModal = (project: Project) => {
    setSelectedProject(project);
    setIsDeleteOpen(true);
  };

  const handleSaveBrand = () => {
    localStorage.setItem("creator_brand_goals", brandGoals);
    localStorage.setItem("creator_brand_guidelines", brandGuidelines);
    setIsBrandSaved(true);
    setTimeout(() => setIsBrandSaved(false), 2000);
  };

  // --- AGENT CREATION ---
  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName.trim() || !agentInst.trim()) return;

    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: agentName.trim().toLowerCase(),
      role: agentRole.trim() || "Expert",
      description: agentDesc.trim() || "User created custom expert agent.",
      instructions: agentInst.trim(),
      iconColor: agentColor
    };

    const updated = [...customAgents, newAgent];
    setCustomAgents(updated);
    localStorage.setItem("creator_custom_agents", JSON.stringify(updated));

    // Reset Form
    setAgentName("");
    setAgentRole("");
    setAgentDesc("");
    setAgentInst("");
    setAgentColor("blue");
    setIsCreateAgentOpen(false);
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    const session = chatSessions.find((s) => s.id === sessionId);
    if (session) {
      setActiveAgentId(session.agentId);
    }
  };

  const handleCreateNewChat = async () => {
    if (!bootstrapData) return;
    try {
      setActionLoading(true);
      const res = await fetch("/api/studio/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: bootstrapData.episodeId,
          userId: bootstrapData.userId,
          mode: "manual"
        }),
      });
      if (!res.ok) throw new Error("Failed to create chat session");
      const session = await res.json();

      const defaultMsg = activeAgentId === "orchestrator"
        ? "Orchestration thread started. Tell me what visual screenplays or platform campaigns you need generated."
        : `Agent ${activeAgent?.name} loaded. Ask me anything about ${activeAgent?.description}`;

      const newSession: ChatSession = {
        id: session.id,
        title: `new ${activeAgentId} session`,
        agentId: activeAgentId,
        messages: [
          {
            role: "assistant",
            content: defaultMsg,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]
      };

      setChatSessions([newSession, ...chatSessions]);
      setActiveSessionId(session.id);
    } catch (e) {
      console.error(e);
      alert("Error starting new session in database");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectContextBase = async (projId: string) => {
    try {
      const res = await fetch(`/api/studio/projects/${projId}`);
      const j = await res.json();
      if (res.ok) {
        setBootstrapData({
          userId: j.project.user_id,
          projectId: projId,
          episodeId: j.activeEpisode.id,
          sessionId: j.activeSessionId
        });
        setActiveSessionId(j.activeSessionId);

        // Add this session to local sessions state if it's not already tracked
        const exists = chatSessions.some((s) => s.id === j.activeSessionId);
        if (!exists) {
          setChatSessions([
            ...chatSessions,
            {
              id: j.activeSessionId,
              title: `${j.project.name} context chat`,
              agentId: activeAgentId,
              messages: j.chatMessages.map((m: any) => ({
                role: m.role,
                content: m.content || "",
                timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }))
            }
          ]);
        }
      }
    } catch (e) {
      console.error("error switching base context", e);
    }
  };

  const handleOpenCustomInstructions = () => {
    if (activeAgentId === "orchestrator") {
      alert("Custom Instructions are configured per individual Agent. Select a specific agent to customize its prompt.");
      return;
    }
    const currentVal = activeAgent?.instructions || "";
    setTempInstructions(currentVal);
    setIsCustomInstructionsOpen(true);
  };

  const handleSaveCustomInstructions = () => {
    if (activeAgentId === "orchestrator") return;

    // Save locally to custom agent list or local overrides
    const isDefault = defaultAgents.some((a) => a.id === activeAgentId);
    if (isDefault) {
      localStorage.setItem(`creator_custom_instructions_${activeAgentId}`, tempInstructions);
    } else {
      const updated = customAgents.map((agent) => {
        if (agent.id === activeAgentId) {
          return { ...agent, instructions: tempInstructions };
        }
        return agent;
      });
      setCustomAgents(updated);
      localStorage.setItem("creator_custom_agents", JSON.stringify(updated));
    }
    setIsCustomInstructionsOpen(false);
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || chatLoading || !bootstrapData) return;

    const userText = inputVal.trim();
    setInputVal("");

    // 1. Determine Routed Agent
    let targetAgentId = activeAgentId;
    let routingDetails = null;

    if (activeAgentId === "orchestrator") {
      // Orchestrator Classification Layer: Check keywords or agent names
      const textLower = userText.toLowerCase();
      let matchedAgent = allAgents[0]; // fallback to Script Writer

      // Check if user mentions a specific agent handle (e.g. "@voicedirector" or matching custom names)
      const mentioned = allAgents.find((a) => textLower.includes(`@${a.name}`) || textLower.includes(a.name));
      if (mentioned) {
        matchedAgent = mentioned;
      } else if (textLower.includes("calendar") || textLower.includes("campaign") || textLower.includes("social") || textLower.includes("roadmap") || textLower.includes("strateg")) {
        matchedAgent = allAgents.find((a) => a.id === "strategist") || allAgents[0];
      } else {
        // Find custom agent match by description/keywords
        const customMatch = customAgents.find((ca) => textLower.includes(ca.name) || textLower.includes(ca.role.toLowerCase()));
        if (customMatch) matchedAgent = customMatch;
      }

      targetAgentId = matchedAgent.id;
      routingDetails = {
        name: matchedAgent.name,
        iconColor: matchedAgent.iconColor
      };
    }

    const targetAgent = allAgents.find((a) => a.id === targetAgentId) || allAgents[0];

    // Load any override instructions
    const overrideInst = localStorage.getItem(`creator_custom_instructions_${targetAgentId}`) || targetAgent.instructions;

    const promptPrefix = `[Agent Context: ${targetAgent.name} (${targetAgent.role})]\nAgent Instructions: ${overrideInst}\n\nUser query details:\n`;
    const fullMessage = promptPrefix + userText;

    // 2. Add user message
    setChatSessions((prev) =>
      prev.map((session) => {
        if (session.id === activeSessionId) {
          return {
            ...session,
            title: session.title.startsWith("new ") ? userText.substring(0, 20) : session.title,
            messages: [
              ...session.messages,
              {
                role: "user" as const,
                content: userText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]
          };
        }
        return session;
      })
    );

    setChatLoading(true);

    // Append streaming block for assistant response
    setChatSessions((prev) =>
      prev.map((session) => {
        if (session.id === activeSessionId) {
          return {
            ...session,
            messages: [
              ...session.messages,
              {
                role: "assistant" as const,
                content: "",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                routedAgent: routingDetails
              }
            ]
          };
        }
        return session;
      })
    );

    try {
      const res = await fetch("/api/studio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          projectId: bootstrapData.projectId,
          episodeId: bootstrapData.episodeId,
          userId: bootstrapData.userId,
          message: fullMessage,
          mode: "manual"
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let event = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) dataLine += line.slice(6);
          }
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine);
            if (event === "message" && payload && typeof payload === "object") {
              const p = payload as Record<string, any>;
              if (p.type === "assistant" && "message" in p) {
                const contents = p.message?.content ?? [];
                for (const block of contents) {
                  if (block.type === "text" && typeof block.text === "string") {
                    const chunkText = block.text;
                    setChatSessions((prev) =>
                      prev.map((session) => {
                        if (session.id === activeSessionId) {
                          const msgs = [...session.messages];
                          const lastMsg = msgs[msgs.length - 1];
                          if (lastMsg && lastMsg.role === "assistant") {
                            lastMsg.content += chunkText;
                          }
                          return { ...session, messages: msgs };
                        }
                        return session;
                      })
                    );
                  }
                }
              }
            } else if (event === "error") {
              const errMsg = payload.message || "Streaming error";
              setChatSessions((prev) =>
                prev.map((session) => {
                  if (session.id === activeSessionId) {
                    const msgs = [...session.messages];
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg && lastMsg.role === "assistant") {
                      lastMsg.content += `\n\n⚠️ Error: ${errMsg}`;
                    }
                    return { ...session, messages: msgs };
                  }
                  return session;
                })
              );
            }
          } catch (e) {
            // ignore partial parse errors
          }
        }
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setChatSessions((prev) =>
        prev.map((session) => {
          if (session.id === activeSessionId) {
            const msgs = [...session.messages];
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
              lastMsg.content += `\n\n⚠️ Connection Failed: ${msg}`;
            }
            return { ...session, messages: msgs };
          }
          return session;
        })
      );
    } finally {
      setChatLoading(false);
    }
  };

  const activeSession = chatSessions.find((s) => s.id === activeSessionId) || chatSessions[0];

  const getColorClasses = (color: string) => {
    switch (color) {
      case "purple": return { text: "text-purple-400", border: "border-purple-500/20", bg: "bg-purple-600/10" };
      case "pink": return { text: "text-pink-400", border: "border-pink-500/20", bg: "bg-pink-600/10" };
      case "blue": return { text: "text-blue-400", border: "border-blue-500/20", bg: "bg-blue-600/10" };
      case "emerald": return { text: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-600/10" };
      case "amber": return { text: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-600/10" };
      default: return { text: "text-blue-400", border: "border-blue-500/20", bg: "bg-blue-600/10" };
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-500/30 selection:text-purple-200">

      {/* Dynamic glow backgrounds */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-pink-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <header className="h-16 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-heading text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            UNICORN AI
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 text-xs border border-slate-800">
            Creator Hub
          </span>
        </div>

        {/* Dashboard Navigation Tabs */}
        <nav className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-900 px-1.5 py-1 rounded-xl backdrop-blur-xs">
          <button
            onClick={() => setActiveTab("bases")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === "bases"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Bases
          </button>
          <button
            onClick={() => setActiveTab("brand")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === "brand"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Brand Kit
          </button>
          <button
            onClick={() => setActiveTab("content")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === "content"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Content Agents
          </button>
        </nav>

        <div className="flex items-center gap-4">
          {activeTab === "bases" && (
            <Button
              onClick={() => {
                setProjectName("");
                setProjectDesc("");
                setIsCreateOpen(true);
              }}
              className="bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm flex items-center gap-2 rounded-lg px-4 py-2 shadow-lg shadow-purple-600/20 transition-all active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              Create Base
            </Button>
          )}

          <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/20 flex items-center justify-center text-purple-300 font-bold text-sm">
            D
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 max-w-6xl w-full mx-auto z-10 ${activeTab === "content" ? "p-0 max-w-none flex flex-col h-[calc(100vh-4rem)]" : "px-8 py-12"}`}>

        {/* ================================== TAB 1: BASES ================================== */}
        {activeTab === "bases" && (
          <div className="space-y-12">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Your Studio Bases
              </h1>
              <p className="text-slate-400 mt-2 max-w-md">
                Sandbox environments for scripts, characters, storyboards, and AI cinematic generations.
              </p>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-48 rounded-2xl bg-slate-900/30 border border-slate-900/50 animate-pulse flex flex-col p-6 justify-between">
                    <div className="space-y-3">
                      <div className="h-6 w-2/3 bg-slate-800 rounded-md" />
                      <div className="h-4 w-5/6 bg-slate-800 rounded-md" />
                    </div>
                    <div className="h-8 w-1/3 bg-slate-800 rounded-md" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center max-w-lg mx-auto">
                <h3 className="text-lg font-semibold text-destructive">Failed to load bases</h3>
                <p className="text-slate-400 text-sm mt-2">{error}</p>
                <Button onClick={fetchProjects} className="mt-4 bg-slate-900 hover:bg-slate-850 text-slate-200">
                  Retry
                </Button>
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/40 p-16 text-center max-w-xl mx-auto flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-6">
                  <Layers className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-100">Create your first Base</h2>
                <p className="text-slate-400 text-sm mt-2 max-w-sm">
                  Get started by creating a base. Each base acts as a separate creative production folder for characters, scripts, and video generations.
                </p>
                <Button
                  onClick={() => setIsCreateOpen(true)}
                  className="mt-6 bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-2 rounded-xl px-5 py-2.5 shadow-lg shadow-purple-600/20 transition-all active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  Create Base
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="group relative rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-sm flex flex-col justify-between hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/[0.02] overflow-hidden"
                  >
                    {/* Thumbnail */}
                    {project.cover_image ? (
                      <div className="relative w-full h-40 bg-slate-900">
                        <Image
                          src={project.cover_image}
                          alt={project.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
                      </div>
                    ) : (
                      <div className="w-full h-32 bg-gradient-to-br from-slate-900 via-slate-900/80 to-purple-950/30 flex items-center justify-center">
                        <Film className="w-10 h-10 text-slate-700" />
                      </div>
                    )}

                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start gap-4 mb-3">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-555 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-900">
                            {project.default_aspect || "16:9"} • {project.default_style || "photoreal"}
                          </span>

                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(project);
                              }}
                              title="Edit Base Details"
                              className="p-1.5 rounded-md hover:bg-slate-850 text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteModal(project);
                              }}
                              title="Delete Base"
                              className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <h3 className="text-xl font-bold text-slate-100 group-hover:text-white transition-colors line-clamp-1">
                          {project.name}
                        </h3>

                        <p className="text-slate-400 text-sm mt-2 line-clamp-2 leading-relaxed">
                          {project.description || "No description provided. Click edit to describe this cinematic playground."}
                        </p>
                      </div>

                      <div className="mt-5 pt-4 border-t border-slate-900/60 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{new Date(project.created_at).toLocaleDateString()}</span>
                        </div>

                        <Link
                          href={`/studio/project/${project.id}`}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-400 hover:text-purple-300 group/link transition-colors"
                        >
                          Enter Workspace
                          <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================== TAB 2: BRAND KIT ================================== */}
        {activeTab === "brand" && (
          <div className="space-y-12 max-w-4xl mx-auto">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  Brand Kit
                </h1>
                <p className="text-slate-400 mt-2 max-w-md">
                  Establish core creative goals and aesthetic parameters used by your AI production agents.
                </p>
              </div>

              <Button
                onClick={handleSaveBrand}
                className="bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-2 rounded-xl px-5 shadow-lg shadow-purple-600/20 transition-all active:scale-[0.98]"
              >
                {isBrandSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved
                  </>
                ) : (
                  "Save Brand Kit"
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Brand Goals Card */}
              <div className="rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-sm p-6 space-y-4">
                <div className="flex items-center gap-2 text-purple-400">
                  <Target className="w-5 h-5" />
                  <h2 className="text-lg font-bold text-slate-100">Brand Goals</h2>
                </div>
                <p className="text-xs text-slate-500">
                  Define targeted marketing outcomes, user actions, or audience priorities.
                </p>
                <textarea
                  rows={8}
                  value={brandGoals}
                  onChange={(e) => setBrandGoals(e.target.value)}
                  placeholder="Enter strategic goals..."
                  className="w-full bg-slate-900/40 border border-slate-800/80 rounded-xl px-4 py-3 text-sm font-mono leading-relaxed text-slate-100 focus:outline-none focus:border-purple-500/60 resize-none"
                />
              </div>

              {/* Brand Guidelines Card */}
              <div className="rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-sm p-6 space-y-4">
                <div className="flex items-center gap-2 text-pink-400">
                  <BookOpen className="w-5 h-5" />
                  <h2 className="text-lg font-bold text-slate-100">Brand Guidelines</h2>
                </div>
                <p className="text-xs text-slate-500">
                  Visual standards, aesthetic constraints, tone guidelines, and styling instructions.
                </p>
                <textarea
                  rows={8}
                  value={brandGuidelines}
                  onChange={(e) => setBrandGuidelines(e.target.value)}
                  placeholder="Enter design guidelines..."
                  className="w-full bg-slate-900/40 border border-slate-800/80 rounded-xl px-4 py-3 text-sm font-mono leading-relaxed text-slate-100 focus:outline-none focus:border-purple-500/60 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================================== TAB 3: CONTENT AGENTS (CHATGPT SIDEBAR LAYOUT) ================================== */}
        {activeTab === "content" && (
          <div className="flex-1 flex overflow-hidden w-full h-full bg-[#0a0d16]/40">

            {/* Sidebar (ChatGPT Left Panel) */}
            <aside className="w-64 border-r border-slate-900 bg-[#070b12] flex flex-col justify-between shrink-0">

              <div className="p-3.5 space-y-4">
                {/* New Chat & Create Agent Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCreateNewChat}
                    className="py-2 border border-slate-850 hover:bg-slate-900/80 text-slate-200 hover:text-white rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-400" />
                    New Chat
                  </button>
                  <button
                    onClick={() => setIsCreateAgentOpen(true)}
                    className="py-2 border border-slate-850 hover:bg-slate-900/80 text-slate-200 hover:text-white rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-all"
                  >
                    <Bot className="w-3.5 h-3.5 text-pink-400" />
                    + Agent
                  </button>
                </div>

                {/* Orchestrator Select */}
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
                    Orchestration
                  </div>
                  <button
                    onClick={() => {
                      setActiveAgentId("orchestrator");
                      const s = chatSessions.find((x) => x.agentId === "orchestrator");
                      if (s) setActiveSessionId(s.id);
                    }}
                    className={`w-full px-3 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold tracking-wide text-left transition-all ${
                      activeAgentId === "orchestrator"
                        ? "bg-purple-600/10 text-purple-300 border border-purple-500/20"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                    }`}
                  >
                    <Cpu className="w-4 h-4 text-purple-400 animate-pulse" />
                    Unicorn AI Orchestrator
                  </button>
                </div>

                {/* Agents list */}
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
                    Custom Expert Agents
                  </div>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                    {allAgents.map((agent) => {
                      const isSelected = activeAgentId === agent.id;
                      const config = getColorClasses(agent.iconColor);

                      return (
                        <button
                          key={agent.id}
                          onClick={() => {
                            setActiveAgentId(agent.id);
                            const s = chatSessions.find((x) => x.agentId === agent.id);
                            if (s) setActiveSessionId(s.id);
                          }}
                          className={`w-full px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-medium tracking-wide text-left transition-all ${
                            isSelected
                              ? `${config.bg} ${config.text} border ${config.border}`
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                          }`}
                        >
                          <Bot className={`w-3.5 h-3.5 ${config.text}`} />
                          <span className="truncate">{agent.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recents list */}
                <div className="space-y-1 pt-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
                    Recents
                  </div>
                  <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
                    {chatSessions
                      .filter((s) => s.agentId === activeAgentId)
                      .map((session) => (
                        <button
                          key={session.id}
                          onClick={() => handleSelectSession(session.id)}
                          className={`w-full px-3 py-1.5 rounded-lg text-left truncate text-xs flex items-center gap-2 transition-all ${
                            session.id === activeSessionId
                              ? "bg-slate-900 text-slate-200 font-semibold"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-950/40"
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                          <span className="truncate">{session.title}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Bottom profile info */}
              <div className="p-4 border-t border-slate-900/80 bg-slate-950/20 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">
                  R
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold text-slate-300 truncate">Ravinder Mann</div>
                  <div className="text-[10px] text-slate-500 truncate">Plus Account</div>
                </div>
              </div>
            </aside>

            {/* Chat Workspace (ChatGPT Right Panel) */}
            <section className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-950/40 relative">

              {/* Chat Header */}
              <header className="h-14 border-b border-slate-900/80 px-6 flex items-center justify-between bg-[#070b12]/50 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="font-heading font-bold text-sm tracking-tight text-slate-200">
                    {activeSession?.title || (activeAgentId === "orchestrator" ? "Unicorn AI Orchestrator" : activeAgent?.name)}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-900 uppercase">
                    ORCHESTRATOR
                  </span>
                  <div className="w-px h-4 bg-slate-800" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Base Context:</span>
                  <select
                    value={bootstrapData?.projectId || ""}
                    onChange={(e) => handleSelectContextBase(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-slate-300 rounded px-2.5 py-1 text-xs focus:outline-none cursor-pointer hover:border-slate-700 transition-colors"
                  >
                    <option value="" disabled>Select Base...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-550">
                  {activeAgentId !== "orchestrator" && (
                    <button
                      onClick={handleOpenCustomInstructions}
                      className="p-1.5 rounded-lg border border-slate-800/80 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 font-semibold"
                      title="Customize Agent Prompt Rules"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      Instructions
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <span>Orchestrator Routing Layer</span>
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  </div>
                </div>
              </header>

              {/* Message History list */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {activeSession?.messages.map((msg, idx) => {
                    const routingConfig = msg.routedAgent ? getColorClasses(msg.routedAgent.iconColor) : null;
                    return (
                      <div
                        key={idx}
                        className={`flex flex-col gap-1.5 ${
                          msg.role === "user" ? "items-end" : "items-start"
                        }`}
                      >
                        {/* Routing Header */}
                        {msg.routedAgent && (
                          <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ml-12 ${routingConfig?.text} ${routingConfig?.border} ${routingConfig?.bg}`}>
                            <GitMerge className="w-2.5 h-2.5" />
                            Routed by Orchestrator to: {msg.routedAgent.name}
                          </span>
                        )}

                        <div className="flex gap-4 w-full">
                          {/* Avatar */}
                          {msg.role === "assistant" && (
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-lg ${
                              activeAgentId === "orchestrator"
                                ? "bg-purple-600/10 border border-purple-500/20 text-purple-400"
                                : getColorClasses(activeAgent?.iconColor || "blue").bg
                            }`}>
                              {activeAgentId === "orchestrator" ? <Cpu className="w-4 h-4 text-purple-400" /> : <Bot className="w-4 h-4" />}
                            </div>
                          )}

                          {/* Text Bubble */}
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-purple-600/15 text-slate-200 border border-purple-500/20"
                              : "text-slate-350"
                          }`}>
                            {msg.content}
                          </div>

                          {/* User Avatar */}
                          {msg.role === "user" && (
                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                              R
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing Loader Indicator */}
                  {chatLoading && (
                    <div className="flex gap-4 justify-start">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-purple-600/10 text-purple-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                      <div className="text-xs font-mono text-slate-500 italic flex items-center gap-1.5 pt-2">
                        Unicorn AI routing logic & Claude agent querying is running...
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Input form area */}
              <div className="p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent shrink-0">
                <div className="max-w-3xl mx-auto space-y-3">
                  <form
                    onSubmit={handleSendChatMessage}
                    className="relative bg-[#0d121f] border border-slate-900 focus-within:border-slate-800 rounded-2xl p-2 flex flex-col gap-2 transition-all shadow-2xl"
                  >
                    <textarea
                      rows={2}
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      placeholder={
                        activeAgentId === "orchestrator"
                          ? "Ask Unicorn AI Orchestrator anything (triggers routing)..."
                          : `Message ${activeAgent?.name}...`
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendChatMessage(e);
                        }
                      }}
                      className="w-full bg-transparent outline-none border-none text-sm text-slate-100 placeholder-slate-550 resize-none px-3 pt-2"
                    />

                    {/* Bottom toolbar inside input box */}
                    <div className="flex justify-between items-center px-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="p-2 rounded-xl text-slate-500 hover:text-slate-355 hover:bg-slate-900/50 transition-colors"
                          title="Attach files"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-xl text-slate-500 hover:text-slate-355 hover:bg-slate-900/50 transition-colors"
                          title="Voice message"
                        >
                          <Mic className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={!inputVal.trim() || chatLoading || !bootstrapData}
                        className={`p-2 rounded-xl transition-all ${
                          inputVal.trim() && !chatLoading && bootstrapData
                            ? "bg-white text-slate-950 hover:opacity-90"
                            : "bg-slate-900 text-slate-600 cursor-not-allowed"
                        }`}
                      >
                        <Send className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  </form>

                  <div className="text-[10px] text-center text-slate-600 font-medium">
                    UNICORN AI Content Agent. Connected to Claude Agent SDK.
                  </div>
                </div>
              </div>

            </section>

          </div>
        )}
      </main>

      {/* CREATE BASE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900">
              <h2 className="text-lg font-bold text-slate-100">Create New Base</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Base Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cyberpunk Alley Scene"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-550 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Description (Optional)</label>
                  <textarea
                    rows={4}
                    placeholder="Describe the aesthetic, genre, or mood of this project..."
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-550 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all resize-none"
                  />
                </div>

                {/* Cover Image Upload */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Thumbnail Image (Optional)</label>
                  {coverImagePreview ? (
                    <div className="relative w-full h-36 rounded-xl overflow-hidden border border-slate-800/80">
                      <img src={coverImagePreview} alt="Cover preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => resetCoverImage()}
                        className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-slate-800/80 bg-slate-900/30 cursor-pointer hover:border-purple-500/40 hover:bg-slate-900/50 transition-all">
                      <ImagePlus className="w-6 h-6 text-slate-500 mb-1.5" />
                      <span className="text-xs text-slate-500">Click to upload thumbnail</span>
                      <span className="text-[10px] text-slate-600 mt-0.5">JPG, PNG, WebP (max 10MB)</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverImageSelect} />
                    </label>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-900/20 border-t border-slate-900 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsCreateOpen(false); resetCoverImage(); }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {actionLoading ? "Creating..." : "Create Base"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900">
              <h2 className="text-lg font-bold text-slate-100">Edit Base Details</h2>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditProject}>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Base Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Rename your base..."
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-550 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Description (Optional)</label>
                  <textarea
                    rows={4}
                    placeholder="Describe the aesthetic, genre, or mood..."
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-550 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all resize-none"
                  />
                </div>

                {/* Cover Image Upload */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Thumbnail Image</label>
                  {coverImagePreview ? (
                    <div className="relative w-full h-36 rounded-xl overflow-hidden border border-slate-800/80">
                      <img src={coverImagePreview} alt="Cover preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => resetCoverImage()}
                        className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-slate-800/80 bg-slate-900/30 cursor-pointer hover:border-purple-500/40 hover:bg-slate-900/50 transition-all">
                      <ImagePlus className="w-6 h-6 text-slate-500 mb-1.5" />
                      <span className="text-xs text-slate-500">Click to upload thumbnail</span>
                      <span className="text-[10px] text-slate-600 mt-0.5">JPG, PNG, WebP (max 10MB)</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverImageSelect} />
                    </label>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-900/20 border-t border-slate-900 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsEditOpen(false); resetCoverImage(); }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={actionLoading || uploadingImage}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {actionLoading || uploadingImage ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden animate-zoom-in">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-slate-100">Delete Base?</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Are you sure you want to delete <span className="font-semibold text-slate-200">"{selectedProject?.name}"</span>? This action is permanent and will delete all episodes, characters, shots, and messages inside it.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-900/20 border-t border-slate-900 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <Button
                onClick={handleDeleteProject}
                disabled={actionLoading}
                className="bg-red-650 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {actionLoading ? "Deleting..." : "Delete Base"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CUSTOM AGENT MODAL */}
      {isCreateAgentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-950 border border-slate-900 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900">
              <div className="flex items-center gap-2 text-pink-400">
                <Bot className="w-5 h-5" />
                <h2 className="text-base font-bold text-slate-100">Create Custom Agent</h2>
              </div>
              <button
                onClick={() => setIsCreateAgentOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAgent}>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agent Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. voice director"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 transition-all font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Role/Category</label>
                    <input
                      type="text"
                      placeholder="e.g. Voice Over"
                      value={agentRole}
                      onChange={(e) => setAgentRole(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Sets tone of voice and matches prompt pacing..."
                    value={agentDesc}
                    onChange={(e) => setAgentDesc(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Prompt Instructions</label>
                  <textarea
                    rows={4}
                    required
                    placeholder="e.g. You are the voice director. Ensure dialogue pacing is adjusted..."
                    value={agentInst}
                    onChange={(e) => setAgentInst(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800/80 rounded-2xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 transition-all resize-none font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agent Theme Color</label>
                  <div className="flex gap-2.5 pt-1">
                    {["blue", "emerald", "amber", "purple", "pink"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAgentColor(c)}
                        className={`w-6 h-6 rounded-full border transition-all ${
                          c === "blue" ? "bg-blue-600 border-blue-400" :
                          c === "emerald" ? "bg-emerald-600 border-emerald-400" :
                          c === "amber" ? "bg-amber-600 border-amber-400" :
                          c === "purple" ? "bg-purple-600 border-purple-400" :
                          "bg-pink-600 border-pink-400"
                        } ${agentColor === c ? "ring-2 ring-white scale-110" : "opacity-60"}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-900/20 border-t border-slate-900 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateAgentOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Create Agent
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM INSTRUCTIONS MODAL */}
      {isCustomInstructionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-950 border border-slate-900 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900">
              <div className="flex items-center gap-2 text-purple-400">
                <Settings2 className="w-5 h-5" />
                <h2 className="text-base font-bold text-slate-100">
                  Custom Instructions: {activeAgent?.name}
                </h2>
              </div>
              <button
                onClick={() => setIsCustomInstructionsOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Add style rules, custom frameworks, script format preferences, platform-specific guidelines, or content parameters. These instructions are automatically fed to Claude whenever you message this agent.
              </p>

              <textarea
                rows={8}
                value={tempInstructions}
                onChange={(e) => setTempInstructions(e.target.value)}
                placeholder="e.g. Overwrite instructions for the active expert agent..."
                className="w-full bg-slate-900/50 border border-slate-800/80 rounded-2xl px-4 py-3.5 text-sm text-slate-250 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all resize-none font-mono"
              />
            </div>

            <div className="px-6 py-4 bg-slate-900/20 border-t border-slate-900 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCustomInstructionsOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <Button
                onClick={handleSaveCustomInstructions}
                className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                Save Instructions
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
