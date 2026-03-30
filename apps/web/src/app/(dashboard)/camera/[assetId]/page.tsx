"use client";

/**
 * camera/[assetId]/page.tsx
 *
 * Fullscreen drone FLIR camera feed page.
 * Left 70%: synthetic FLIR feed (MapLibre satellite + CSS filters + reticles)
 * Right 30%: tactical HUD (telemetry, health, target info)
 */

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useSimulation } from "@/lib/use-simulation";
import { FlirFeed } from "@/components/flir-feed";
import { DroneHud } from "@/components/drone-hud";

interface PageProps {
  params: Promise<{ assetId: string }>;
}

export default function CameraPage({ params }: PageProps) {
  const { assetId } = use(params);
  const router = useRouter();
  const sim = useSimulation();

  const [isStatic, setIsStatic] = useState(false);
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drone = sim.assets[assetId] ?? null;

  // Watch for drone destruction → play static, then navigate back
  useEffect(() => {
    if (!drone || drone.status !== "destroyed") return;
    if (destroyTimerRef.current) return; // already scheduled

    setIsStatic(true);
    destroyTimerRef.current = setTimeout(() => {
      router.push("/map");
    }, 2000);

    return () => {
      if (destroyTimerRef.current) clearTimeout(destroyTimerRef.current);
    };
  }, [drone, router]);

  // Find the first active detection that this drone is sensing
  const trackedDetection =
    Object.values(sim.detections).find((d) => d.sensor_asset_id === assetId) ?? null;

  // ── Render: feed unavailable ────────────────────────────────────────────

  if (!sim.connected && !drone) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--om-bg-deep)] gap-4">
        <div className="text-[var(--om-text-muted)] text-sm font-mono">FEED UNAVAILABLE</div>
        <button
          onClick={() => router.push("/map")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold cursor-pointer text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] transition-colors"
          style={{ border: "1px solid var(--om-border)" }}
        >
          <ArrowLeft size={12} />
          Back to Map
        </button>
      </div>
    );
  }

  if (sim.connected && !drone) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--om-bg-deep)] gap-4">
        <div className="text-[var(--om-text-muted)] text-sm font-mono">ASSET NOT FOUND</div>
        <button
          onClick={() => router.push("/map")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold cursor-pointer text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] transition-colors"
          style={{ border: "1px solid var(--om-border)" }}
        >
          <ArrowLeft size={12} />
          Back to Map
        </button>
      </div>
    );
  }

  if (!drone) {
    // Still waiting for first snapshot
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--om-bg-deep)]">
        <div className="text-[var(--om-text-muted)] text-[11px] font-mono">Connecting...</div>
      </div>
    );
  }

  // ── Render: live feed ──────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col bg-[var(--om-bg-deep)] overflow-hidden">
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b border-[var(--om-border)]"
        style={{ background: "var(--om-bg-primary)" }}
      >
        <button
          onClick={() => router.push("/map")}
          className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--om-text-muted)] hover:text-[var(--om-text-primary)] cursor-pointer transition-colors"
        >
          <ArrowLeft size={11} />
          MAP
        </button>
        <div className="w-px h-3 bg-[var(--om-border)]" />
        <div className="text-[10px] font-semibold tracking-widest text-[var(--om-blue-light)]">
          {drone.callsign}
        </div>
        <div className="text-[10px] text-[var(--om-text-muted)]">/ FLIR FEED</div>
        {!sim.connected && (
          <div
            className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-sm"
            style={{
              background: "rgba(205,66,70,0.1)",
              border: "1px solid rgba(205,66,70,0.3)",
              color: "var(--om-red-light)",
            }}
          >
            OFFLINE
          </div>
        )}
      </div>

      {/* Feed + HUD */}
      <div className="flex-1 flex min-h-0">
        {/* FLIR feed — 70% */}
        <div className="flex-[7] min-w-0">
          <FlirFeed
            lat={drone.position.latitude}
            lon={drone.position.longitude}
            targetLat={trackedDetection?.lat ?? null}
            targetLon={trackedDetection?.lon ?? null}
            isStatic={isStatic}
          />
        </div>

        {/* Tactical HUD — 30% */}
        <div className="flex-[3] min-w-[220px] max-w-[320px]">
          <DroneHud
            drone={drone}
            target={trackedDetection}
            connected={sim.connected}
          />
        </div>
      </div>
    </div>
  );
}
