"use client";

import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";

interface GraphViewProps {
  onNodeClick?: (nodeId: string) => void;
  onNodeExpand?: (nodeId: string) => void;
  expandedNodes?: Set<string>;
  loadingNode?: string | null;
  selectedId?: string | null;
  className?: string;
  compact?: boolean;
  graphNodes?: Array<{ id: string; label: string; type: string; color: string }>;
  graphEdges?: Array<{ id: string; source: string; target: string; label: string }>;
}

const TYPE_COLORS: Record<string, string> = {
  company: "#06b6d4",
  founder: "#a78bfa",
  industry: "#f59e0b",
  batch: "#10b981",
  location: "#f87171",
};

const TYPE_SIZES: Record<string, number> = {
  company: 6,
  founder: 4,
  industry: 10,
  batch: 10,
};

interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

export function GraphViewInner({
  onNodeClick,
  onNodeExpand,
  expandedNodes,
  loadingNode,
  selectedId,
  className = "",
  graphNodes: nodesProp,
  graphEdges: edgesProp,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>(undefined);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingClickNodeRef = useRef<string | null>(null);
  const pulseRef = useRef(0);

  // Keep a stable map of node objects so we preserve x/y positions across updates
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map());
  const prevNodeCountRef = useRef(0);

  const rawNodes = nodesProp ?? [];
  const rawEdges = edgesProp ?? [];

  const graphData = useMemo(() => {
    const nodeMap = nodeMapRef.current;
    const nodeIds = new Set(rawNodes.map((n) => n.id));

    // Remove nodes that are no longer in the data
    for (const id of nodeMap.keys()) {
      if (!nodeIds.has(id)) nodeMap.delete(id);
    }

    // Add or update nodes, preserving existing x/y/fx/fy
    for (const n of rawNodes) {
      const existing = nodeMap.get(n.id);
      if (existing) {
        // Update labels/colors but keep position
        existing.label = n.label;
        existing.type = n.type;
        existing.color = TYPE_COLORS[n.type?.toLowerCase()] ?? n.color ?? "#a1a1aa";
      } else {
        nodeMap.set(n.id, {
          id: n.id,
          label: n.label,
          type: n.type,
          color: TYPE_COLORS[n.type?.toLowerCase()] ?? n.color ?? "#a1a1aa",
        });
      }
    }

    const nodes = Array.from(nodeMap.values());
    const links: GraphLink[] = rawEdges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    return { nodes, links };
  }, [rawNodes, rawEdges]);

  // Resize handler
  const [dimensions, setDimensions] = useDimensions(containerRef);

  // Gently reheat (not reset) when new nodes are added
  useEffect(() => {
    const currentCount = graphData.nodes.length;
    if (currentCount > prevNodeCountRef.current && prevNodeCountRef.current > 0) {
      // New nodes added — gentle reheat to settle them in
      fgRef.current?.d3ReheatSimulation();
    }
    prevNodeCountRef.current = currentCount;
  }, [graphData]);

  // Zoom to fit only on first meaningful data
  const hasZoomedRef = useRef(false);
  useEffect(() => {
    if (graphData.nodes.length > 0 && !hasZoomedRef.current) {
      hasZoomedRef.current = true;
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 60);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [graphData.nodes.length]);

  // Pulse animation for loading node
  useEffect(() => {
    if (!loadingNode) return;
    let raf: number;
    const animate = () => {
      pulseRef.current = (pulseRef.current + 0.05) % (2 * Math.PI);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    fgRef.current?.d3ReheatSimulation();
    return () => cancelAnimationFrame(raf);
  }, [loadingNode]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (clickTimerRef.current && pendingClickNodeRef.current === node.id) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        pendingClickNodeRef.current = null;
        onNodeExpand?.(node.id);
      } else {
        pendingClickNodeRef.current = node.id;
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          pendingClickNodeRef.current = null;
          onNodeClick?.(node.id);
        }, 300);
      }
    },
    [onNodeClick, onNodeExpand],
  );

  const drawNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      const size = TYPE_SIZES[node.type?.toLowerCase()] ?? 5;
      const isSelected = node.id === selectedId;
      const isExpanded = expandedNodes?.has(node.id) ?? false;
      const isLoading = node.id === loadingNode;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Loading pulse ring
      if (isLoading) {
        const pulseSize = size + 8 + Math.sin(pulseRef.current) * 3;
        ctx.beginPath();
        ctx.arc(x, y, pulseSize, 0, 2 * Math.PI);
        ctx.strokeStyle = `${node.color}88`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Expanded indicator — dashed outer ring
      if (isExpanded && !isLoading) {
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, 2 * Math.PI);
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = `${node.color}99`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Glow for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, size + 6, 0, 2 * Math.PI);
        ctx.fillStyle = `${node.color}44`;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? node.color : `${node.color}cc`;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label
      const fontSize = node.type === "industry" || node.type === "batch" ? 4 : 3.2;
      ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isSelected ? "#ffffff" : "#d4d4d8";
      ctx.fillText(node.label, x, y + size + 2);
    },
    [selectedId, expandedNodes, loadingNode],
  );

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      {dimensions.width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#09090b"
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
            const size = TYPE_SIZES[node.type?.toLowerCase()] ?? 5;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, size + 4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          onNodeClick={handleNodeClick}
          onNodeDragEnd={(node: GraphNode) => {
            node.fx = node.x;
            node.fy = node.y;
          }}
          onNodeRightClick={(node: GraphNode) => {
            node.fx = undefined;
            node.fy = undefined;
          }}
          linkColor={() => "#27272a"}
          linkWidth={0.5}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.3}
          cooldownTicks={200}
          enableNodeDrag={true}
        />
      )}
    </div>
  );
}

// ── Hook: track container dimensions ───────────────────────────────────────

function useDimensions(ref: React.RefObject<HTMLDivElement | null>) {
  const [dims, setDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setDims({ width: el.clientWidth, height: el.clientHeight });
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return [dims, setDims] as const;
}
