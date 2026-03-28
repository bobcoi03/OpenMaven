"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppData } from "@/lib/data-context";
import { useMapLayers } from "@/lib/map-layer-context";
import { AssetDetailPanel } from "@/components/asset-detail-panel";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { searchObjects, queryKnowledgeGraphStream, type QueryChatMessage, type QueryStreamEvent } from "@/lib/api-client";
import type { ObjectInstance } from "@/lib/api-types";
import { MOCK_TACTICAL_ASSETS, MOCK_TARGETING_ALERTS, type AssetClass } from "@/lib/tactical-mock";
import {
  Search,
  Filter,
  Network,
  Map as MapIcon,
  MessageSquare,
  Table,
  FileText,
  SlidersHorizontal,
  Send,
  Sparkles,
  Circle,
  Loader2,
  User,
  Bot,
  Layers,
  ChevronRight,
  Crosshair,
} from "lucide-react";

const TABS = [
  { name: "Graph", href: "/graph", icon: Network },
  { name: "Table", href: "/table", icon: Table },
  { name: "Map", href: "/map", icon: MapIcon },
  { name: "Query", href: "/query", icon: MessageSquare },
  { name: "Sources", href: "/sources", icon: FileText },
  { name: "Assets", href: "/assets", icon: Crosshair },
  { name: "Decisions", href: "/decisions", icon: SlidersHorizontal },
] as const;

const TYPE_COLORS: Record<string, string> = {
  company: "#06b6d4",
  founder: "#a78bfa",
  industry: "#f59e0b",
  batch: "#10b981",
  location: "#f87171",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ rid: string; name: string; type: string }>;
}

interface QueryProgressItem {
  id: string;
  label: string;
}

// ── Layer config for the tactical sidebar ─────────────────────────────────────

const LAYER_CFG: {
  id: AssetClass;
  color: string;
  bg: string;
  description: string;
}[] = [
  { id: "Military",       color: "#00d4ff", bg: "rgba(0,212,255,0.08)",  description: "Armour · Air · Infantry" },
  { id: "Infrastructure", color: "#f59e0b", bg: "rgba(245,158,11,0.08)", description: "Oil · Power · Bridges"  },
  { id: "Logistics",      color: "#94a3b8", bg: "rgba(148,163,184,0.08)",description: "Supply · Air Transport"  },
];

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const { entityCounts, graph } = useAppData();
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
  const [queryProgress, setQueryProgress] = useState<QueryProgressItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    setQueryProgress([{ id: "start", label: "Analyzing your question..." }]);

    try {
      await queryKnowledgeGraphStream(question, nextChatForApi, (event: QueryStreamEvent) => {
        if (event.type === "status") {
          setQueryProgress((prev) => [...prev, { id: crypto.randomUUID(), label: event.message }]);
          return;
        }
        if (event.type === "tool_call") {
          setQueryProgress((prev) => [
            ...prev,
            { id: crypto.randomUUID(), label: `Calling ${event.name}...` },
          ]);
          return;
        }
        if (event.type === "tool_result") {
          setQueryProgress((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              label: event.ok
                ? `${event.name} returned data`
                : `${event.name} returned an error`,
            },
          ]);
          return;
        }
        if (event.type === "final") {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: event.answer,
              sources: event.sources,
            },
          ]);
          setQueryProgress((prev) => [
            ...prev,
            { id: crypto.randomUUID(), label: "Answer ready." },
          ]);
          return;
        }
        if (event.type === "error") {
          setQueryProgress((prev) => [
            ...prev,
            { id: crypto.randomUUID(), label: `Error: ${event.message}` },
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
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#09090b] text-zinc-200">
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <header className="h-10 flex items-center justify-between px-3 bg-[#141417] border-b border-[#27272a] shrink-0 z-20">
        <div className="flex items-center gap-3">
          {/* Tactical classification badge */}
          <div className="flex items-center gap-1.5">
            <span
              className="text-[9px] font-bold px-1.5 py-px rounded"
              style={{ background: "#ef4444", color: "#fff", letterSpacing: "0.05em" }}
            >
              TS
            </span>
            <span className="text-[11px] font-semibold text-zinc-100 tracking-[0.18em] uppercase">
              OpenMaven
            </span>
          </div>
          <div className="w-px h-4 bg-[#27272a]" />
          <nav className="flex gap-0.5">
            {TABS.map(({ name, href, icon: Icon }) => {
              const active = pathname === href;
              const isTactical = href === "/map";
              return (
                <Link
                  key={name}
                  href={href}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded font-medium tracking-wide transition-colors ${
                    active && isTactical
                      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/25"
                      : active
                      ? "bg-white/8 text-zinc-100 border border-white/10"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5 border border-transparent"
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
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            {isSearching && (
              <Loader2 size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />
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
              className="pl-7 pr-3 py-1 text-[11px] rounded bg-[#141417]/80 border border-zinc-800/80 text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 w-56"
            />
            {/* Search dropdown */}
            {showResults && (
              <div className="absolute top-full right-0 mt-1 w-80 bg-[#1a1a1f] border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[11px] text-zinc-500">
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
                              ? "bg-zinc-800/80"
                              : "hover:bg-zinc-800/40"
                          }`}
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: color }}
                          />
                          <span className="text-[11px] text-zinc-200 truncate flex-1">
                            {title}
                          </span>
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
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
        {/* Left Sidebar — Map Layers (on /map) or Entity Types (other pages) */}
        <aside className="w-[240px] bg-[#141417] border-r border-[#27272a] flex flex-col shrink-0 z-10 overflow-y-auto">
          {pathname === "/map" ? (
            /* ── Tactical Map Layers ───────────────────────────────── */
            <>
              {/* Selected asset detail (rendered at top of sidebar) */}
              {selectedAsset && (
                <AssetDetailPanel
                  asset={selectedAsset}
                  onClose={() => setSelectedAsset(null)}
                />
              )}

              <div className="px-3 py-2.5 border-b border-[#27272a]">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.12em]">
                  <Layers size={11} />
                  Map Layers
                </div>
              </div>

              {/* Layer toggles */}
              <div className="px-2 py-2 space-y-1">
                {LAYER_CFG.map(({ id, color, bg, description }) => {
                  const isOn = visibleLayers.has(id);
                  const count = MOCK_TACTICAL_ASSETS.filter((a) => a.asset_class === id).length;
                  return (
                    <button
                      key={id}
                      onClick={() => toggleLayer(id)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded transition-all cursor-pointer group"
                      style={{
                        background: isOn ? bg : "transparent",
                        border: `1px solid ${isOn ? color + "30" : "#27272a"}`,
                        opacity: isOn ? 1 : 0.45,
                      }}
                    >
                      {/* Toggle indicator */}
                      <div
                        className="w-3 h-3 rounded-sm shrink-0 flex items-center justify-center transition-all"
                        style={{
                          background: isOn ? color : "transparent",
                          border: `1.5px solid ${color}`,
                        }}
                      >
                        {isOn && (
                          <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
                            <polyline points="1,2.5 3,4.5 6,1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      <div className="flex-1 text-left min-w-0">
                        <div className="text-[11px] font-semibold truncate" style={{ color: isOn ? color : "#64748b" }}>
                          {id}
                        </div>
                        <div className="text-[9px] text-zinc-600">{description}</div>
                      </div>

                      <span
                        className="text-[10px] font-mono shrink-0"
                        style={{ color: isOn ? color + "bb" : "#334155" }}
                      >
                        {count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Theatre info */}
              <div className="mt-auto px-3 py-3 border-t border-[#27272a]">
                <div className="text-[9px] text-zinc-600 uppercase tracking-[0.1em] mb-2">
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
                      <span className="text-[9px] text-zinc-700 uppercase tracking-[0.08em]">{k}</span>
                      <span className="text-[9px] text-zinc-500 font-mono">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* ── Entity Types (all other pages) ───────────────────── */
            <>
              <div className="px-3 py-2.5 border-b border-zinc-800/60">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.12em]">
                  <Filter size={11} />
                  Entity Types
                </div>
              </div>
              {entityCounts.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-[11px] text-zinc-500">No data yet</p>
                  <p className="text-[10px] text-zinc-600 mt-1">Upload files in the Sources tab</p>
                </div>
              ) : (
                <div className="px-3 py-2 space-y-1.5">
                  {entityCounts.map(({ type, count, color }) => {
                    const maxCount = entityCounts[0]?.count || 1;
                    const pct = (count / maxCount) * 100;
                    return (
                      <div key={type} className="flex items-center gap-2 group">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[11px] text-zinc-300 w-[80px] truncate">{type}</span>
                        <div className="flex-1 h-2.5 bg-zinc-900/80 rounded overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{ width: `${Math.min(pct, 100)}%`, background: color, opacity: 0.5 }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500 w-8 text-right font-[family-name:var(--font-mono)]">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </aside>

        {/* Center Canvas */}
        <main className="flex-1 flex flex-col relative min-w-0">
          {children}
        </main>

        {/* Right Panel — AI Query */}
        <aside className="w-[300px] bg-[#141417] border-l border-[#27272a] flex flex-col shrink-0 z-10">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800/60">
            <Sparkles size={13} className="text-zinc-400" />
            <span className="text-[11px] font-semibold text-zinc-300 tracking-wide">Query</span>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <p className="text-[11px] text-zinc-500 leading-[1.6]">
                Ask questions about your knowledge graph. Upload data via the Sources tab to get started.
              </p>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <div className="shrink-0 mt-0.5">
                    {msg.role === "user" ? (
                      <User size={12} className="text-zinc-500" />
                    ) : (
                      <Bot size={12} className="text-cyan-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-zinc-300 leading-[1.6] break-words">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                          code: ({ children }) => (
                            <code className="px-1 py-0.5 rounded bg-zinc-800/80 text-zinc-200">
                              {children}
                            </code>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-cyan-400 hover:text-cyan-300 underline"
                            >
                              {children}
                            </a>
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
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium hover:opacity-80 transition-opacity cursor-pointer"
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
            {isQuerying && (
              <div className="flex gap-2">
                <Bot size={12} className="text-cyan-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Loader2 size={12} className="animate-spin text-zinc-500" />
                    <span className="text-[10px] text-zinc-500">Working...</span>
                  </div>
                  {queryProgress.length > 0 && (
                    <div className="space-y-1">
                      {queryProgress.slice(-4).map((item) => (
                        <p key={item.id} className="text-[10px] text-zinc-500 leading-[1.4]">
                          {item.label}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-zinc-800/60">
            <div className="flex gap-2">
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleQuerySubmit();
                }}
                placeholder="Ask about the knowledge graph..."
                className="flex-1 px-3 py-1.5 text-[11px] rounded bg-zinc-900/80 border border-zinc-800/80 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <button
                onClick={handleQuerySubmit}
                disabled={isQuerying}
                className="px-2.5 py-1.5 bg-zinc-700 text-zinc-200 rounded hover:bg-zinc-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Send size={11} />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Bottom Status Bar ───────────────────────────────────────── */}
      <footer className="h-7 flex items-center gap-4 px-3 bg-[#141417] border-t border-[#27272a] shrink-0 z-20 overflow-hidden">
        {pathname === "/map" ? (
          /* Tactical status line */
          <>
            {(["Military", "Infrastructure", "Logistics"] as const).map((cls) => {
              const color =
                cls === "Military" ? "#00d4ff" :
                cls === "Infrastructure" ? "#f59e0b" : "#94a3b8";
              const count = MOCK_TACTICAL_ASSETS.filter((a) => a.asset_class === cls).length;
              return (
                <div key={cls} className="flex items-center gap-1.5 text-[10px] shrink-0">
                  <Circle size={7} fill={color} stroke="none" />
                  <span className="font-semibold font-[family-name:var(--font-mono)]" style={{ color }}>{count}</span>
                  <span className="text-zinc-500">{cls}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1 text-[10px] shrink-0">
              <ChevronRight size={10} className="text-red-500" />
              <span className="text-red-400 font-mono">
                {MOCK_TARGETING_ALERTS.filter((a) => a.stage === "DYNAMIC").length} DYNAMIC
              </span>
            </div>
          </>
        ) : (
          entityCounts.map(({ type, count, color }) => (
            <div key={type} className="flex items-center gap-1.5 text-[10px] text-zinc-400 shrink-0 max-w-[180px]">
              <Circle size={8} fill={color} stroke="none" className="shrink-0" />
              <span className="font-semibold font-[family-name:var(--font-mono)]" style={{ color }}>{count}</span>
              <span className="truncate">{type}</span>
            </div>
          ))
        )}
        <div className="ml-auto text-[10px] text-zinc-700 font-[family-name:var(--font-mono)] shrink-0">
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
