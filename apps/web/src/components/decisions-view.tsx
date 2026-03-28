"use client";

import { useState } from "react";
import {
  decisions,
  companies,
  type Decision,
  type DecisionStage,
} from "@/lib/mock-data";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Plus,
  Filter,
  ChevronDown,
  Clock,
  ArrowUpDown,
  X,
  CheckCircle2,
  AlertTriangle,
  CircleDot,
  Timer,
  Ban,
  Zap,
  User,
} from "lucide-react";

const stageConfig: Record<DecisionStage, { label: string; color: string; border: string; count?: number }> = {
  Proposed: { label: "PROPOSED", color: "text-[var(--om-text-secondary)]", border: "border-l-[var(--om-text-muted)]" },
  "Under Review": { label: "UNDER REVIEW", color: "text-amber-400", border: "border-l-amber-500" },
  Approved: { label: "APPROVED", color: "text-[var(--om-blue-light)]", border: "border-l-[var(--om-blue)]" },
  "In Execution": { label: "IN EXECUTION", color: "text-[var(--om-blue-light)]", border: "border-l-[var(--om-blue)]" },
  Complete: { label: "COMPLETE", color: "text-emerald-400", border: "border-l-emerald-500" },
  Rejected: { label: "REJECTED", color: "text-[var(--om-red-light)]", border: "border-l-[var(--om-red)]" },
};

const stageIcons: Record<DecisionStage, LucideIcon> = {
  Proposed: CircleDot,
  "Under Review": Timer,
  Approved: CheckCircle2,
  "In Execution": Zap,
  Complete: CheckCircle2,
  Rejected: Ban,
};

const priorityConfig: Record<string, { dot: string; text: string }> = {
  Critical: { dot: "bg-[var(--om-red)]", text: "text-[var(--om-red-light)]" },
  High: { dot: "bg-amber-400", text: "text-amber-400" },
  Medium: { dot: "bg-[var(--om-blue)]", text: "text-[var(--om-blue-light)]" },
  Low: { dot: "bg-[var(--om-text-muted)]", text: "text-[var(--om-text-secondary)]" },
};

const stageOrder: DecisionStage[] = ["Proposed", "Under Review", "Approved", "In Execution", "Complete", "Rejected"];

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface DecisionsViewProps {
  onDecisionSelect?: (decision: Decision) => void;
}

export function DecisionsView({ onDecisionSelect }: DecisionsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = decisions.filter((d) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return d.title.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || d.description.toLowerCase().includes(q);
  });

  const handleSelect = (dec: Decision) => {
    setSelectedId(dec.id === selectedId ? null : dec.id);
    onDecisionSelect?.(dec);
  };

  const selectedDecision = decisions.find((d) => d.id === selectedId);

  return (
    <div className="h-full flex bg-[var(--om-bg-deep)]">
      {/* Kanban Board */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--om-border)] bg-[var(--om-bg-primary)]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--om-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search decisions..."
                className="pl-7 pr-3 py-1.5 text-[11px] rounded-sm bg-[var(--om-bg-deep)]/80 border border-[var(--om-border-strong)] text-[var(--om-text-secondary)] placeholder:text-[var(--om-text-disabled)] focus:outline-none focus:border-[var(--om-text-muted)] w-52"
              />
            </div>
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)] rounded-sm transition-colors cursor-pointer">
              <Filter size={11} />
              Filter
            </button>
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)] rounded-sm transition-colors cursor-pointer">
              <ArrowUpDown size={11} />
              Sort by
              <ChevronDown size={10} />
            </button>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[var(--om-text-primary)] bg-[var(--om-bg-elevated)] border border-[var(--om-border-strong)] rounded-sm hover:bg-[var(--om-bg-hover)] transition-colors cursor-pointer">
            <Plus size={11} />
            Add Decision
          </button>
        </div>

        {/* Kanban columns */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-0 h-full min-w-max">
            {stageOrder.map((stage) => {
              const stageDecs = filtered.filter((d) => d.stage === stage);
              const conf = stageConfig[stage];
              const StageIcon = stageIcons[stage];

              return (
                <div
                  key={stage}
                  className="flex flex-col w-[220px] border-r border-[var(--om-border)] last:border-r-0"
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--om-bg-elevated)] border-b border-[var(--om-border)]">
                    <StageIcon size={12} className={conf.color} />
                    <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${conf.color}`}>
                      {conf.label}
                    </span>
                    <span className="ml-auto text-[10px] text-[var(--om-text-muted)] font-[family-name:var(--font-mono)]">
                      {stageDecs.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {stageDecs.map((dec) => {
                      const pri = priorityConfig[dec.priority];
                      const isSelected = selectedId === dec.id;
                      const linkedCompanies = dec.entities
                        .map((eid) => companies.find((c) => c.id === eid))
                        .filter(Boolean);

                      return (
                        <div
                          key={dec.id}
                          onClick={() => handleSelect(dec)}
                          className={`border-l-2 ${stageConfig[dec.stage].border} bg-[var(--om-bg-primary)] border border-[var(--om-border)] rounded-r-sm px-3 py-2.5 cursor-pointer transition-all hover:border-[var(--om-border-strong)] ${
                            isSelected ? "ring-1 ring-[var(--om-text-muted)] bg-white/[0.03]" : ""
                          }`}
                        >
                          {/* Priority + Type */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />
                            <span className="text-[9px] text-[var(--om-text-muted)] uppercase tracking-[0.1em] font-semibold">{dec.type}</span>
                          </div>

                          {/* Title */}
                          <div className="text-[11px] text-[var(--om-text-primary)] font-medium leading-snug mb-1.5">
                            {dec.title}
                          </div>

                          {/* Linked entities */}
                          {linkedCompanies.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {linkedCompanies.slice(0, 2).map((c) => (
                                <span
                                  key={c!.id}
                                  className="text-[9px] px-1.5 py-0.5 rounded-sm bg-[var(--om-bg-elevated)] text-[var(--om-text-secondary)] border border-[var(--om-border)]"
                                >
                                  {c!.name}
                                </span>
                              ))}
                              {linkedCompanies.length > 2 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-[var(--om-bg-elevated)] text-[var(--om-text-muted)]">
                                  +{linkedCompanies.length - 2}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Footer: assignee + time */}
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1.5">
                              <User size={9} className="text-[var(--om-text-muted)]" />
                              <span className="text-[9px] text-[var(--om-text-muted)]">
                                {dec.assignee === "unassigned" ? "Unassigned" : dec.assignee}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={9} className="text-[var(--om-text-muted)]" />
                              <span className="text-[9px] text-[var(--om-text-muted)] font-[family-name:var(--font-mono)]">
                                {timeAgo(dec.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {stageDecs.length === 0 && (
                      <div className="flex items-center justify-center h-20 text-[10px] text-[var(--om-text-disabled)]">
                        No items
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail sidebar */}
      {selectedDecision && (
        <div className="w-[300px] bg-[var(--om-bg-primary)] border-l border-[var(--om-border)] flex flex-col shrink-0 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--om-border)]">
            <div className="flex items-center gap-2">
              {(() => {
                const StIcon = stageIcons[selectedDecision.stage];
                return <StIcon size={13} className={stageConfig[selectedDecision.stage].color} />;
              })()}
              <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${stageConfig[selectedDecision.stage].color}`}>
                {stageConfig[selectedDecision.stage].label}
              </span>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="text-[var(--om-text-muted)] hover:text-[var(--om-text-secondary)] transition-colors p-0.5 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Title + Priority */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${priorityConfig[selectedDecision.priority].dot}`} />
              <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${priorityConfig[selectedDecision.priority].text}`}>
                {selectedDecision.priority} Priority
              </span>
            </div>
            <h2 className="text-[13px] font-semibold text-[var(--om-text-primary)] leading-snug">{selectedDecision.title}</h2>
            <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-sm bg-[var(--om-bg-elevated)] text-[var(--om-text-secondary)] border border-[var(--om-border)]">
              {selectedDecision.type}
            </span>
          </div>

          {/* Description */}
          <div className="px-3 pb-3">
            <p className="text-[11px] text-[var(--om-text-secondary)] leading-[1.6]">{selectedDecision.description}</p>
          </div>

          {/* Properties */}
          <div className="border-t border-[var(--om-border)]">
            <div className="px-3 py-2 text-[10px] font-semibold text-[var(--om-text-secondary)] uppercase tracking-[0.12em]">
              Properties
            </div>
            <div className="px-3 pb-3 space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-[var(--om-text-muted)] uppercase tracking-[0.08em]">Assignee</span>
                <span className="text-[11px] text-[var(--om-text-secondary)]">{selectedDecision.assignee === "unassigned" ? "—" : selectedDecision.assignee}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-[var(--om-text-muted)] uppercase tracking-[0.08em]">Created</span>
                <span className="text-[11px] text-[var(--om-text-secondary)] font-[family-name:var(--font-mono)]">{timeAgo(selectedDecision.createdAt)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-[var(--om-text-muted)] uppercase tracking-[0.08em]">Updated</span>
                <span className="text-[11px] text-[var(--om-text-secondary)] font-[family-name:var(--font-mono)]">{timeAgo(selectedDecision.updatedAt)}</span>
              </div>
              {selectedDecision.approvedBy && (
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-[var(--om-text-muted)] uppercase tracking-[0.08em]">Approved By</span>
                  <span className="text-[11px] text-emerald-400">{selectedDecision.approvedBy}</span>
                </div>
              )}
            </div>
          </div>

          {/* Linked Entities */}
          {selectedDecision.entities.length > 0 && (
            <div className="border-t border-[var(--om-border)]">
              <div className="px-3 py-2 text-[10px] font-semibold text-[var(--om-text-secondary)] uppercase tracking-[0.12em]">
                Linked Entities
              </div>
              <div className="px-3 pb-3 space-y-1">
                {selectedDecision.entities.map((eid) => {
                  const c = companies.find((co) => co.id === eid);
                  if (!c) return null;
                  return (
                    <div
                      key={eid}
                      className="flex items-center gap-2 px-2 py-1.5 bg-[var(--om-bg-deep)]/40 rounded-sm border border-[var(--om-border)] cursor-pointer hover:bg-[var(--om-bg-hover)] transition-colors"
                    >
                      <div className="w-5 h-5 rounded-sm bg-[var(--om-bg-elevated)] border border-[var(--om-border-strong)] flex items-center justify-center text-[9px] text-[var(--om-text-secondary)] font-semibold">
                        {c.name[0]}
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--om-text-secondary)]">{c.name}</div>
                        <div className="text-[9px] text-[var(--om-text-muted)]">{c.industry} · {c.batch}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto px-3 py-2.5 border-t border-[var(--om-border)] space-y-1.5">
            {selectedDecision.stage === "Proposed" && (
              <button className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-sm hover:bg-amber-500/20 transition-colors cursor-pointer">
                <AlertTriangle size={11} />
                Move to Review
              </button>
            )}
            {selectedDecision.stage === "Under Review" && (
              <button className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-sm hover:bg-emerald-500/20 transition-colors cursor-pointer">
                <CheckCircle2 size={11} />
                Approve
              </button>
            )}
            {selectedDecision.stage === "Approved" && (
              <button className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[var(--om-blue-light)] bg-[var(--om-blue)]/10 border border-[var(--om-blue)]/20 rounded-sm hover:bg-[var(--om-blue)]/20 transition-colors cursor-pointer">
                <Zap size={11} />
                Begin Execution
              </button>
            )}
            {selectedDecision.stage === "In Execution" && (
              <button className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-sm hover:bg-emerald-500/20 transition-colors cursor-pointer">
                <CheckCircle2 size={11} />
                Mark Complete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
