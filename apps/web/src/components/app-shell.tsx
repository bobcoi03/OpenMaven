"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppData } from "@/lib/data-context";
import { useMapLayers } from "@/lib/map-layer-context";
import { AssetDetailPanel } from "@/components/asset-detail-panel";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { searchObjects, querySimulationStream, type QueryChatMessage, type QueryStreamEvent } from "@/lib/api-client";
import type { ObjectInstance } from "@/lib/api-types";
import { MOCK_TACTICAL_ASSETS, type AssetClass } from "@/lib/tactical-mock";
import {
  Search,
  Map as MapIcon,
  MessageSquare,
  Table,
  FileText,
  SlidersHorizontal,
  Send,
  Circle,
  Loader2,
  User,
  Bot,
  Layers,
  Crosshair,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Radar,
  Swords,
  Route,
  Shield,
} from "lucide-react";

const TABS = [
  // { name: "Graph", href: "/graph", icon: Network },
  // { name: "Table", href: "/table", icon: Table },
  { name: "Map", href: "/map", icon: MapIcon },
  // { name: "Query", href: "/query", icon: MessageSquare },
  // { name: "Sources", href: "/sources", icon: FileText },
  { name: "Assets", href: "/assets", icon: Crosshair },
  { name: "Decisions", href: "/decisions", icon: SlidersHorizontal },
  { name: "Design", href: "/design", icon: Layers },
] as const;

// Fallback entity-type colors for search results — uses design system categorical palette
const TYPE_COLORS: Record<string, string> = {
  company: "#147EB3",
  founder: "#9D3F9D",
  industry: "#D1980B",
  batch: "#00A396",
  location: "#D33D17",
};


interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ rid: string; name: string; type: string }>;
  toolSteps?: ToolStep[];
  /** True while streaming text deltas — message content is partial. */
  _streaming?: boolean;
}

interface ToolStep {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "complete" | "error";
  preview?: string;
}

// ── Layer config for the tactical sidebar ─────────────────────────────────────

const LAYER_CFG: {
  id: AssetClass;
  description: string;
}[] = [
  { id: "Military",       description: "Armour · Air · Infantry" },
  { id: "Infrastructure", description: "Oil · Power · Bridges"  },
  { id: "Logistics",      description: "Supply · Air Transport"  },
];

// ── Tool labels ──────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  get_battlefield_summary: { running: "Scanning battlefield...", done: "Scanned battlefield" },
  list_factions: { running: "Listing factions...", done: "Listed factions" },
  get_faction_state: { running: "Querying faction...", done: "Queried faction" },
  get_force_disposition: { running: "Loading ORBAT...", done: "Loaded ORBAT" },
  find_assets: { running: "Searching assets...", done: "Found assets" },
  get_assets_near: { running: "Scanning area...", done: "Scanned area" },
  get_asset_details: { running: "Fetching asset details...", done: "Fetched asset details" },
  get_recent_events: { running: "Loading events...", done: "Loaded events" },
  plan_strike: { running: "Planning strike...", done: "Strike planned" },
  execute_strike: { running: "Executing strike...", done: "Strike executed" },
  order_move: { running: "Ordering movement...", done: "Movement ordered" },
  launch_strike_mission: { running: "Launching strike mission...", done: "Mission launched" },
  get_active_missions: { running: "Checking active missions...", done: "Missions loaded" },
  abort_mission: { running: "Aborting mission...", done: "Mission aborted" },
  plan_multi_strike: { running: "Planning multi-target strike...", done: "Strike plan ready" },
  get_schema: { running: "Fetching schema...", done: "Fetched schema" },
  run_cypher: { running: "Running query...", done: "Query complete" },
  search_entities: { running: "Searching entities...", done: "Found entities" },
};

function getToolLabel(name: string, status: string): string {
  const entry = TOOL_LABELS[name];
  if (entry) return status === "running" ? entry.running : entry.done;
  return status === "running" ? `Running ${name}...` : `Ran ${name}`;
}

// ── Tool step components ─────────────────────────────────────────────────────

function ToolStepRow({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-sm border border-[var(--om-border)] bg-[var(--om-bg-deep)]/30 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left cursor-pointer hover:bg-[var(--om-bg-hover)]/30 transition-colors"
      >
        {step.status === "running" && (
          <Loader2 size={10} className="animate-spin text-[var(--om-blue)] shrink-0" />
        )}
        {step.status === "complete" && (
          <CheckCircle2 size={10} className="text-[var(--om-green)] shrink-0" />
        )}
        {step.status === "error" && (
          <XCircle size={10} className="text-[var(--om-red)] shrink-0" />
        )}
        <span className="text-[10px] text-[var(--om-text-secondary)] flex-1 truncate">
          {getToolLabel(step.name, step.status)}
        </span>
        {(step.args || step.preview) && (
          <ChevronDown
            size={10}
            className={`text-[var(--om-text-muted)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && (
        <div className="px-2 py-1.5 border-t border-[var(--om-border)] text-[9px] text-[var(--om-text-muted)] max-h-24 overflow-y-auto">
          {step.args && Object.keys(step.args).length > 0 && (
            <div className="mb-1">
              <span className="text-[var(--om-text-disabled)]">args: </span>
              {Object.entries(step.args).map(([k, v]) => (
                <span key={k} className="mr-2">
                  <span className="text-[var(--om-text-muted)]">{k}=</span>
                  <span className="text-[var(--om-blue)]">{JSON.stringify(v)}</span>
                </span>
              ))}
            </div>
          )}
          {step.preview && (
            <div className="text-[var(--om-text-muted)] break-words">{step.preview}</div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolStepGroup({ steps, live = false }: { steps: ToolStep[]; live?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const allDone = steps.every((s) => s.status !== "running");

  // Auto-collapse completed groups on historical messages
  if (!live && allDone && collapsed === false && steps.length > 0) {
    // rendered collapsed by default for historical messages
  }

  return (
    <div className="mb-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-[10px] text-[var(--om-text-muted)] hover:text-[var(--om-text-primary)] transition-colors cursor-pointer mb-1"
      >
        {live && !allDone ? (
          <Loader2 size={10} className="animate-spin text-[var(--om-blue)]" />
        ) : (
          <CheckCircle2 size={10} className="text-[var(--om-green)]" />
        )}
        <span>
          {live && !allDone
            ? `Using tools (${steps.filter((s) => s.status === "complete").length}/${steps.length})...`
            : `Used ${steps.length} tool${steps.length !== 1 ? "s" : ""}`}
        </span>
        <ChevronDown
          size={10}
          className={`transition-transform ${collapsed ? "" : "rotate-180"}`}
        />
      </button>
      {!collapsed && (
        <div className="ml-1 border-l-2 border-[var(--om-border)] pl-2 space-y-1">
          {steps.map((step) => (
            <ToolStepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const { graph } = useAppData();
  const { visibleLayers, toggleLayer, selectedAsset, setSelectedAsset } = useMapLayers();
  const pathname = usePathname();
  const router = useRouter();

  // ── Search state ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ObjectInstance[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── AI query state ────────────────────────────────────────────────
  const [queryText, setQueryText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);
  const toolStepsRef = useRef<ToolStep[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep tool steps ref in sync for closure access
  useEffect(() => {
    toolStepsRef.current = toolSteps;
  }, [toolSteps]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolSteps]);

  // Debounced search
  const doSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchObjects(query);
      setSearchResults(results.slice(0, 10));
      setShowResults(true);
      setSelectedIndex(-1);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  function handleSelectResult(obj: ObjectInstance) {
    graph.seedNode(obj.rid);
    setShowResults(false);
    setSearchQuery("");
    if (pathname !== "/graph") {
      router.push("/graph");
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (!showResults || searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectResult(searchResults[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowResults(false);
    }
  }

  // Close search on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── AI query handler ──────────────────────────────────────────────

  async function handleQuerySubmit() {
    const question = queryText.trim();
    if (!question || isQuerying) return;

    setQueryText("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: question }];
    const nextChatForApi: QueryChatMessage[] = nextMessages.map((m) => ({ role: m.role, content: m.content }));
    setMessages(nextMessages);
    setIsQuerying(true);
    setToolSteps([]);

    const streamFn = querySimulationStream;

    let streamingText = "";

    try {
      await streamFn(question, nextChatForApi, (event: QueryStreamEvent) => {
        if (event.type === "tool_call") {
          setToolSteps((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              name: event.name,
              args: event.args,
              status: "running",
            },
          ]);
          return;
        }
        if (event.type === "tool_result") {
          setToolSteps((prev) =>
            prev.map((step) =>
              step.name === event.name && step.status === "running"
                ? {
                    ...step,
                    status: event.ok ? "complete" : "error",
                    preview: event.preview,
                  }
                : step,
            ),
          );
          return;
        }
        if (event.type === "text_delta") {
          streamingText += event.content;
          // Show partial text as a streaming message
          const partial = streamingText;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last._streaming) {
              // Update the existing streaming message
              return [...prev.slice(0, -1), { ...last, content: partial }];
            }
            // Create a new streaming message
            return [
              ...prev,
              { role: "assistant" as const, content: partial, _streaming: true, toolSteps: [...toolStepsRef.current] },
            ];
          });
          return;
        }
        if (event.type === "strike_plan") {
          // Dispatch to the map page for visualization
          window.dispatchEvent(
            new CustomEvent("openmaven:strike_plan", { detail: event }),
          );
          return;
        }
        if (event.type === "final") {
          setMessages((prev) => {
            // Remove any streaming message, replace with final
            const filtered = prev.filter((m) => !m._streaming);
            return [
              ...filtered,
              {
                role: "assistant",
                content: event.answer,
                sources: event.sources,
                toolSteps: [...toolStepsRef.current],
              },
            ];
          });
          setToolSteps([]);
          streamingText = "";
          return;
        }
        if (event.type === "error") {
          setToolSteps((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              name: "error",
              status: "error",
              preview: event.message,
            },
          ]);
        }
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't process that query. Make sure the API is running and OPENAI_API_KEY is configured.",
        },
      ]);
    } finally {
      setIsQuerying(false);
      setToolSteps([]);
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--om-bg-deep)] text-[var(--om-text-primary)]">
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <header className="h-9 flex items-center justify-between px-3 bg-[var(--om-bg-elevated)] border-b border-[var(--om-border)] shrink-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold text-[var(--om-text-primary)] tracking-[0.14em] uppercase">
            OpenMaven
          </span>
          <div className="w-px h-4 bg-[var(--om-border)]" />
          <nav className="flex gap-0.5">
            {TABS.map(({ name, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={name}
                  href={href}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-sm tracking-wide transition-colors ${
                    active
                      ? "bg-[var(--om-blue)]/15 text-[var(--om-text-primary)] font-semibold"
                      : "text-[var(--om-text-muted)] hover:text-[var(--om-text-primary)] font-normal"
                  }`}
                >
                  <Icon size={12} />
                  {name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2" ref={searchRef}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--om-text-muted)]" />
            {isSearching && (
              <Loader2 size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--om-text-muted)] animate-spin" />
            )}
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => {
                if (searchResults.length > 0) setShowResults(true);
              }}
              className="pl-7 pr-3 py-1 text-[11px] rounded-sm bg-[var(--om-bg-surface)] border border-[var(--om-border)] text-[var(--om-text-primary)] placeholder:text-[var(--om-text-disabled)] focus:outline-none focus:border-[var(--om-border-strong)] w-56"
            />
            {/* Search dropdown */}
            {showResults && (
              <div className="absolute top-full right-0 mt-1 w-80 bg-[var(--om-bg-elevated)] border border-[var(--om-border-strong)] rounded-sm shadow-xl overflow-hidden z-50">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[11px] text-[var(--om-text-muted)]">
                    No results for &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {searchResults.map((obj, i) => {
                      const title = getTitle(obj);
                      const color = TYPE_COLORS[obj.type.toLowerCase()] ?? "#a1a1aa";
                      return (
                        <button
                          key={obj.rid}
                          onClick={() => handleSelectResult(obj)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                            i === selectedIndex
                              ? "bg-[var(--om-bg-active)]"
                              : "hover:bg-[var(--om-bg-hover)]"
                          }`}
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: color }}
                          />
                          <span className="text-[11px] text-[var(--om-text-primary)] truncate flex-1">
                            {title}
                          </span>
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded-sm font-medium shrink-0"
                            style={{ background: `${color}20`, color }}
                          >
                            {obj.type}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar — Map Layers + Theatre info */}
        <aside className="w-[240px] bg-[var(--om-bg-elevated)] border-r border-[var(--om-border)] flex flex-col shrink-0 z-10 overflow-y-auto">
          {/* Selected asset detail (rendered at top of sidebar on /map) */}
          {pathname === "/map" && selectedAsset && (
            <AssetDetailPanel
              asset={selectedAsset}
              onClose={() => setSelectedAsset(null)}
            />
          )}

          <div className="px-3 py-2 border-b border-[var(--om-border)]">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-[var(--om-text-primary)] uppercase tracking-[0.12em]">
              <Layers size={11} />
              Map Layers
            </div>
          </div>

          {/* Layer toggles */}
          <div className="px-2 py-2 space-y-1">
            {LAYER_CFG.map(({ id, description }) => {
              const isOn = visibleLayers.has(id);
              const count = MOCK_TACTICAL_ASSETS.filter((a) => a.asset_class === id).length;
              return (
                <button
                  key={id}
                  onClick={() => toggleLayer(id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-sm transition-all cursor-pointer"
                  style={{
                    background: isOn ? "var(--om-bg-surface)" : "transparent",
                    border: `1px solid ${isOn ? "var(--om-border-strong)" : "var(--om-border)"}`,
                    opacity: isOn ? 1 : 0.45,
                  }}
                >
                  {/* Toggle indicator */}
                  <div
                    className="w-3 h-3 rounded-sm shrink-0 flex items-center justify-center transition-all"
                    style={{
                      background: isOn ? "var(--om-blue)" : "transparent",
                      border: `1.5px solid ${isOn ? "var(--om-blue)" : "var(--om-text-muted)"}`,
                    }}
                  >
                    {isOn && (
                      <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
                        <polyline points="1,2.5 3,4.5 6,1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <div className={`text-[11px] font-semibold truncate ${isOn ? "text-[var(--om-text-primary)]" : "text-[var(--om-text-muted)]"}`}>
                      {id}
                    </div>
                    <div className="text-[9px] text-[var(--om-text-muted)]">{description}</div>
                  </div>

                  <span className={`text-[10px] shrink-0 ${isOn ? "text-[var(--om-text-primary)]" : "text-[var(--om-text-disabled)]"}`}>
                    {count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Theatre info */}
          <div className="mt-auto px-3 py-3 border-t border-[var(--om-border)]">
            <div className="text-[9px] text-[var(--om-text-muted)] uppercase tracking-[0.1em] mb-2">
              Theatre of Operations
            </div>
            <div className="space-y-1">
              {[
                ["Area",   "E. Syria / W. Iraq"],
                ["Assets", MOCK_TACTICAL_ASSETS.length.toLocaleString()],
                ["Lat",    "29°N – 37°N"],
                ["Lon",    "38°E – 48°E"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between">
                  <span className="text-[9px] text-[var(--om-text-muted)] uppercase tracking-[0.08em]">{k}</span>
                  <span className="text-[9px] text-[var(--om-text-primary)]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Canvas */}
        <main className="flex-1 flex flex-col relative min-w-0">
          {children}
        </main>

        {/* Right Panel — AI Query */}
        <aside className="w-[300px] bg-[var(--om-bg-elevated)] border-l border-[var(--om-border)] flex flex-col shrink-0 z-10">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Bot size={14} className="text-[var(--om-blue)]" />
                  <span className="text-[11px] font-semibold text-[var(--om-text-primary)]">
                    C2 Operator
                  </span>
                </div>
                <p className="text-[10px] text-[var(--om-text-secondary)] leading-[1.6]">
                  Tactical AI assistant with live access to the simulation.
                </p>
                <div className="space-y-1.5">
                  {[
                    { icon: Radar, label: "Battlefield overview", desc: "Force disposition, faction status" },
                    { icon: Search, label: "Find & track assets", desc: "Locate units by name, type, or area" },
                    { icon: Swords, label: "Plan & execute strikes", desc: "Weapon selection, target assessment" },
                    { icon: Route, label: "Order movements", desc: "Reposition assets to coordinates" },
                    { icon: Shield, label: "Faction intelligence", desc: "Doctrine, morale, capabilities" },
                  ].map(({ icon: Icon, label, desc }) => (
                    <div
                      key={label}
                      className="flex items-start gap-2.5 px-2.5 py-2 border border-[var(--om-border)] bg-[var(--om-bg-deep)]/40"
                    >
                      <Icon size={13} className="text-[var(--om-text-secondary)] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-medium text-[var(--om-text-primary)]">{label}</div>
                        <div className="text-[9px] text-[var(--om-text-muted)]">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <div className="shrink-0 mt-0.5">
                    {msg.role === "user" ? (
                      <User size={12} className="text-[var(--om-text-muted)]" />
                    ) : (
                      <Bot size={12} className="text-[var(--om-blue)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Tool steps (for assistant messages) */}
                    {msg.role === "assistant" && msg.toolSteps && msg.toolSteps.length > 0 && (
                      <ToolStepGroup steps={msg.toolSteps} />
                    )}
                    <div className="text-[11px] text-[var(--om-text-primary)] leading-[1.6] break-words">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                          code: ({ children }) => (
                            <code className="px-1 py-0.5 rounded-sm bg-[var(--om-bg-active)]/80 text-[var(--om-text-primary)]">
                              {children}
                            </code>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[var(--om-blue-light)] hover:text-[var(--om-blue)] underline"
                            >
                              {children}
                            </a>
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto mb-2 -mx-1">
                              <table className="w-full text-[10px] border-collapse">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="border-b border-[var(--om-border)]">{children}</thead>
                          ),
                          th: ({ children }) => (
                            <th className="px-1.5 py-1 text-left text-[8px] uppercase tracking-wider text-[var(--om-text-muted)] font-semibold">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-1.5 py-1 text-[var(--om-text-secondary)] border-t border-[var(--om-border)]/30">
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {msg.sources.map((s) => {
                          const color = TYPE_COLORS[s.type.toLowerCase()] ?? "#a1a1aa";
                          return (
                            <button
                              key={s.rid}
                              onClick={() => {
                                graph.seedNode(s.rid);
                                if (pathname !== "/graph") router.push("/graph");
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-medium hover:opacity-80 transition-opacity cursor-pointer"
                              style={{ background: `${color}15`, color }}
                            >
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {/* In-progress tool steps */}
            {isQuerying && (
              <div className="flex gap-2">
                <Bot size={12} className="text-[var(--om-blue)] shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  {toolSteps.length > 0 ? (
                    <ToolStepGroup steps={toolSteps} live />
                  ) : (
                    <div className="flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin text-[var(--om-text-muted)]" />
                      <span className="text-[10px] text-[var(--om-text-muted)]">Thinking...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-[var(--om-border)]">
            <div className="bg-[var(--om-bg-surface)] border border-[var(--om-border)] focus-within:border-[var(--om-border-strong)] transition-colors rounded-sm">
              <textarea
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleQuerySubmit();
                  }
                }}
                placeholder="Ask about the battlefield..."
                rows={1}
                className="w-full px-3 pt-2 pb-1 text-[11px] text-[var(--om-text-primary)] placeholder:text-[var(--om-text-disabled)] bg-transparent border-none outline-none resize-none leading-[1.6]"
                style={{ minHeight: "28px", maxHeight: "120px", fieldSizing: "content" } as React.CSSProperties}
              />
              <div className="flex justify-end px-2 pb-1.5">
                <button
                  onClick={handleQuerySubmit}
                  disabled={isQuerying || !queryText.trim()}
                  className="p-1.5 text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Bottom Status Bar ───────────────────────────────────────── */}
      <footer className="h-7 flex items-center gap-4 px-3 bg-[var(--om-bg-elevated)] border-t border-[var(--om-border)] shrink-0 z-20 overflow-hidden">
        {[
          { label: "BLUFOR", count: MOCK_TACTICAL_ASSETS.filter((a) => a.asset_class === "Military").length, color: "var(--om-friendly)" },
          { label: "INFRA", count: MOCK_TACTICAL_ASSETS.filter((a) => a.asset_class === "Infrastructure").length, color: "var(--om-orange)" },
          { label: "LOGI", count: MOCK_TACTICAL_ASSETS.filter((a) => a.asset_class === "Logistics").length, color: "var(--om-text-secondary)" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[10px] shrink-0">
            <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: item.color }} />
            <span className="font-semibold" style={{ color: item.color }}>{item.count}</span>
            <span className="text-[var(--om-text-muted)]">{item.label}</span>
          </div>
        ))}
        <div className="ml-auto text-[10px] text-[var(--om-text-muted)] shrink-0">
          v0.1.0
        </div>
      </footer>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTitle(obj: ObjectInstance): string {
  const p = obj.properties;
  return (p.name ?? p.title ?? p.label ?? obj.rid) as string;
}
