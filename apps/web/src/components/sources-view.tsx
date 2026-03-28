"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  uploadFile,
  ingestUrl,
  fetchSources,
  deleteSource,
  type IngestionResult,
  type SourceRecord,
} from "@/lib/api-client";
import {
  Upload,
  Globe,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Database,
  Link2,
  X,
  Trash2,
} from "lucide-react";

type Status = "idle" | "uploading" | "success" | "error";

const ACCEPTED_EXTENSIONS = ".csv,.xlsx,.xls,.json,.pdf,.docx,.pptx,.html,.htm";

interface SourcesViewProps {
  onIngestComplete?: () => void;
}

export function SourcesView({ onIngestComplete }: SourcesViewProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [url, setUrl] = useState("");
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSources = useCallback(async () => {
    try {
      const data = await fetchSources();
      setSources(data);
    } catch {
      // Sources endpoint may not be available yet
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setStatus("uploading");
    setResult(null);
    setErrorMsg("");

    let totalObjects = 0;
    let totalLinks = 0;
    const allErrors: string[] = [];
    let lastTypeName = "";

    for (const file of files) {
      try {
        const res = await uploadFile(file);
        totalObjects += res.objects_created;
        totalLinks += res.links_created;
        allErrors.push(...res.errors);
        lastTypeName = res.type_name;
      } catch (err) {
        allErrors.push(`${file.name}: ${err}`);
      }
    }

    const combined: IngestionResult = {
      source_id: "",
      type_name: files.length === 1 ? lastTypeName : `${files.length} files`,
      objects_created: totalObjects,
      links_created: totalLinks,
      errors: allErrors,
    };
    setResult(combined);
    setStatus(allErrors.length > 0 ? "error" : "success");
    loadSources();
    onIngestComplete?.();
  };

  const handleUrl = async () => {
    if (!url.trim()) return;
    setStatus("uploading");
    setResult(null);
    setErrorMsg("");
    try {
      const res = await ingestUrl(url.trim());
      setResult(res);
      setStatus(res.errors.length > 0 ? "error" : "success");
      setUrl("");
      loadSources();
      onIngestComplete?.();
    } catch (err) {
      setErrorMsg(String(err));
      setStatus("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFiles(files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleFiles(files);
    e.target.value = "";
  };

  const handleDelete = async (sourceId: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its data?`)) return;
    setDeletingId(sourceId);
    try {
      await deleteSource(sourceId);
      loadSources();
      onIngestComplete?.();
    } catch {
      // Silently handle — source may already be gone
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--om-bg-deep)] min-w-0 overflow-hidden">
      {/* Upload Area */}
      <div className="p-4 border-b border-[var(--om-border)] bg-[var(--om-bg-primary)] space-y-3">
        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 py-6 rounded-sm border-2 border-dashed cursor-pointer transition-colors ${
            dragOver
              ? "border-[var(--om-blue)]/50 bg-[var(--om-blue)]/5"
              : "border-[var(--om-border-strong)] hover:border-[var(--om-text-muted)] bg-[var(--om-bg-deep)]/30"
          }`}
        >
          <Upload size={20} className={dragOver ? "text-[var(--om-blue-light)]" : "text-[var(--om-text-muted)]"} />
          <div className="text-[11px] text-[var(--om-text-secondary)]">
            Drop a file here or <span className="text-[var(--om-text-primary)] font-medium">browse</span>
          </div>
          <div className="text-[10px] text-[var(--om-text-muted)]">
            CSV, XLSX, JSON, PDF, DOCX, PPTX, HTML
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleInputChange}
            multiple
            className="hidden"
          />
        </div>

        {/* URL Input */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Globe size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--om-text-muted)]" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrl()}
              placeholder="https://example.com"
              className="w-full pl-7 pr-3 py-1.5 text-[11px] rounded-sm bg-[var(--om-bg-deep)]/80 border border-[var(--om-border-strong)] text-[var(--om-text-secondary)] placeholder:text-[var(--om-text-disabled)] focus:outline-none focus:border-[var(--om-text-muted)]"
            />
          </div>
          <button
            onClick={handleUrl}
            disabled={!url.trim() || status === "uploading"}
            className="px-3 py-1.5 text-[11px] font-medium text-[var(--om-text-primary)] bg-[var(--om-bg-elevated)] border border-[var(--om-border-strong)] rounded-sm hover:bg-[var(--om-bg-hover)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Fetch
          </button>
        </div>

        {/* Status Banner */}
        {status === "uploading" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-[var(--om-bg-elevated)] border border-[var(--om-border)]">
            <Loader2 size={13} className="text-[var(--om-blue-light)] animate-spin" />
            <span className="text-[11px] text-[var(--om-text-secondary)]">Processing...</span>
          </div>
        )}

        {status === "success" && result && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-sm bg-emerald-500/10 border border-emerald-500/20 overflow-hidden">
            <CheckCircle size={13} className="text-emerald-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-emerald-300 font-medium truncate">
                Ingested as &ldquo;{result.type_name}&rdquo;
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-emerald-400/80">
                <span className="flex items-center gap-1"><Database size={10} />{result.objects_created} objects</span>
                <span className="flex items-center gap-1"><Link2 size={10} />{result.links_created} links</span>
              </div>
            </div>
            <button onClick={() => setStatus("idle")} className="text-emerald-400/60 hover:text-emerald-300 cursor-pointer">
              <X size={12} />
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-sm bg-red-500/10 border border-red-500/20 overflow-hidden">
            <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-red-300 font-medium">
                {result ? `Ingested with ${result.errors.length} error(s)` : "Ingestion failed"}
              </div>
              {errorMsg && <div className="text-[10px] text-red-400/80 mt-0.5">{errorMsg}</div>}
              {result?.errors.map((e, i) => (
                <div key={i} className="text-[10px] text-red-400/80 mt-0.5">{e}</div>
              ))}
            </div>
            <button onClick={() => setStatus("idle")} className="text-red-400/60 hover:text-red-300 cursor-pointer">
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Stats Strip */}
      <div className="flex items-center gap-6 px-4 py-2 border-b border-[var(--om-border)] bg-[var(--om-bg-elevated)]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--om-text-muted)] uppercase tracking-[0.1em]">Sources</span>
          <span className="text-[12px] text-[var(--om-text-primary)] font-semibold font-[family-name:var(--font-mono)]">
            {sources.length}
          </span>
        </div>
        <div className="w-px h-3.5 bg-[var(--om-border-strong)]" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--om-text-muted)] uppercase tracking-[0.1em]">Total Records</span>
          <span className="text-[12px] text-[var(--om-text-primary)] font-semibold font-[family-name:var(--font-mono)]">
            {sources.reduce((s, r) => s + r.row_count, 0)}
          </span>
        </div>
      </div>

      {/* Sources Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto min-w-0">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--om-text-muted)]">
            <FileText size={24} />
            <span className="text-[11px]">No sources ingested yet</span>
          </div>
        ) : (
          <table className="w-full text-[11px] table-fixed">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="sticky top-0 bg-[var(--om-bg-primary)] z-10">
              <tr className="border-b border-[var(--om-border)]">
                <th className="text-left px-4 py-2 text-[10px] text-[var(--om-text-muted)] font-semibold uppercase tracking-[0.08em]">File</th>
                <th className="text-left px-3 py-2 text-[10px] text-[var(--om-text-muted)] font-semibold uppercase tracking-[0.08em]">Type</th>
                <th className="text-right px-3 py-2 text-[10px] text-[var(--om-text-muted)] font-semibold uppercase tracking-[0.08em]">Records</th>
                <th className="text-left px-3 py-2 text-[10px] text-[var(--om-text-muted)] font-semibold uppercase tracking-[0.08em]">Ingested</th>
                <th className="text-left px-3 py-2 text-[10px] text-[var(--om-text-muted)] font-semibold uppercase tracking-[0.08em]">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sources.map((src) => (
                <tr key={src.id} className="border-b border-[var(--om-border)] hover:bg-[var(--om-bg-hover)] transition-colors">
                  <td className="px-4 py-2 text-[var(--om-text-primary)] font-medium truncate" title={src.name}>{src.name}</td>
                  <td className="px-3 py-2 text-[var(--om-text-secondary)] truncate">{src.type_name}</td>
                  <td className="px-3 py-2 text-right text-[var(--om-text-secondary)] font-[family-name:var(--font-mono)]">{src.row_count}</td>
                  <td className="px-3 py-2 text-[var(--om-text-secondary)] font-[family-name:var(--font-mono)]">
                    {formatDate(src.ingested_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-medium ${
                      src.status === "ingested"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-red-400"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        src.status === "ingested" ? "bg-emerald-400" : "bg-red-400"
                      }`} />
                      {src.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => handleDelete(src.id, src.name)}
                      disabled={deletingId === src.id}
                      className="p-1 rounded-sm text-[var(--om-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                      title="Delete source"
                    >
                      {deletingId === src.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
