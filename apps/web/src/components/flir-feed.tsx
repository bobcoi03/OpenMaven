"use client";

/**
 * flir-feed.tsx
 *
 * Procedural FLIR thermal camera feed rendered on a Canvas.
 * - Animated thermal noise grain
 * - Terrain heat blob patches (seeded from lat/lon, move with drone)
 * - Bright pulsing heat signature at target position when locked
 * - Corner-bracket reticles drawn on canvas
 * - Scanlines + vignette
 * - Static noise animation on drone destroy
 */

import { useEffect, useRef } from "react";

interface FlirFeedProps {
  lat: number;
  lon: number;
  targetLat?: number | null;
  targetLon?: number | null;
  isStatic?: boolean;
}

// ── Seeded RNG (LCG) ─────────────────────────────────────────────────────────

function seedRng(seed: number) {
  let s = Math.abs(Math.round(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Canvas helpers ───────────────────────────────────────────────────────────

function drawReticle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  label?: string,
) {
  const arm = size * 0.4;
  const gap = size * 0.12;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // TL
  ctx.moveTo(cx - arm, cy - gap);
  ctx.lineTo(cx - arm, cy - arm);
  ctx.lineTo(cx - gap, cy - arm);
  // TR
  ctx.moveTo(cx + gap, cy - arm);
  ctx.lineTo(cx + arm, cy - arm);
  ctx.lineTo(cx + arm, cy - gap);
  // BL
  ctx.moveTo(cx - arm, cy + gap);
  ctx.lineTo(cx - arm, cy + arm);
  ctx.lineTo(cx - gap, cy + arm);
  // BR
  ctx.moveTo(cx + gap, cy + arm);
  ctx.lineTo(cx + arm, cy + arm);
  ctx.lineTo(cx + arm, cy + gap);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Cross stubs
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - arm + 3, cy); ctx.lineTo(cx - gap - 2, cy);
  ctx.moveTo(cx + gap + 2, cy); ctx.lineTo(cx + arm - 3, cy);
  ctx.moveTo(cx, cy - arm + 3); ctx.lineTo(cx, cy - gap - 2);
  ctx.moveTo(cx, cy + gap + 2); ctx.lineTo(cx, cy + arm - 3);
  ctx.stroke();

  if (label) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, cx, cy + arm + 14);
  }
  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TerrainBlob {
  dlat: number;
  dlon: number;
  radiusKm: number;
  heat: number;
  oscSpeed: number;
  oscPhase: number;
}

const NOISE_W = 200;
const NOISE_H = 120;

export function FlirFeed({ lat, lon, targetLat, targetLon, isStatic = false }: FlirFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const terrainRef = useRef<TerrainBlob[]>([]);
  const noiseRef = useRef<Uint8ClampedArray<ArrayBuffer> | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Init terrain + noise (once) ──────────────────────────────────────────
  useEffect(() => {
    startTimeRef.current = performance.now();

    const rng = seedRng(Math.round(lat * 137 + lon * 251));
    terrainRef.current = Array.from({ length: 10 }, () => ({
      dlat: (rng() - 0.5) * 0.08,
      dlon: (rng() - 0.5) * 0.08,
      radiusKm: rng() * 0.7 + 0.15,
      heat: rng() * 38 + 18,
      oscSpeed: rng() * 0.4 + 0.08,
      oscPhase: rng() * Math.PI * 2,
    }));

    const nd = new Uint8ClampedArray(new ArrayBuffer(NOISE_W * NOISE_H * 4));
    const rng2 = seedRng(99);
    for (let i = 0; i < NOISE_W * NOISE_H; i++) {
      const v = Math.round(rng2() * 22 + 4);
      nd[i * 4] = v; nd[i * 4 + 1] = v; nd[i * 4 + 2] = v; nd[i * 4 + 3] = 255;
    }
    noiseRef.current = nd;

    const nc = document.createElement("canvas");
    nc.width = NOISE_W;
    nc.height = NOISE_H;
    noiseCanvasRef.current = nc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Animation loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const cosLat = Math.cos((lat * Math.PI) / 180);

    const animate = (now: number) => {
      const t = (now - startTimeRef.current) / 1000;

      // Sync canvas pixel size to CSS size
      const W = canvas.offsetWidth || 960;
      const H = canvas.offsetHeight || 540;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }

      // ── Scale: auto-zoom to keep target on screen ──
      let scale = 450; // px/km default
      let tx: number | null = null;
      let ty: number | null = null;

      if (targetLat != null && targetLon != null) {
        const dlatKm = (targetLat - lat) * 111;
        const dlonKm = (targetLon - lon) * 111 * cosLat;
        const distKm = Math.sqrt(dlatKm * dlatKm + dlonKm * dlonKm);
        if (distKm > 0.02) {
          scale = Math.max(40, Math.min(2000, (Math.min(W, H) * 0.36) / distKm));
        }
        tx = W / 2 + dlonKm * scale;
        ty = H / 2 - dlatKm * scale;
      }

      // ── 1. Background ──
      ctx.fillStyle = "#0a0a0c";
      ctx.fillRect(0, 0, W, H);

      // ── 2. Terrain blobs ──
      for (const blob of terrainRef.current) {
        const pulse = Math.sin(t * blob.oscSpeed + blob.oscPhase) * 5;
        const heat = Math.round(blob.heat + pulse);
        const bx = W / 2 + blob.dlon * 111 * cosLat * scale;
        const by = H / 2 - blob.dlat * 111 * scale;
        const br = Math.max(8, blob.radiusKm * scale);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(${heat},${heat},${heat + 2},0.5)`);
        g.addColorStop(0.55, `rgba(${Math.round(heat * 0.45)},${Math.round(heat * 0.45)},${Math.round(heat * 0.45)},0.25)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // ── 3. Grain noise ──
      const nc = noiseCanvasRef.current;
      const nd = noiseRef.current;
      if (nc && nd) {
        const nctx = nc.getContext("2d");
        if (nctx) {
          const count = Math.round(NOISE_W * NOISE_H * 0.18);
          for (let k = 0; k < count; k++) {
            const i = Math.floor(Math.random() * NOISE_W * NOISE_H);
            const v = Math.round(Math.random() * 30 + 3);
            nd[i * 4] = v; nd[i * 4 + 1] = v; nd[i * 4 + 2] = v;
          }
          const imgData = nctx.createImageData(NOISE_W, NOISE_H);
          imgData.data.set(nd);
          nctx.putImageData(imgData, 0, 0);
          ctx.save();
          ctx.globalAlpha = 0.28;
          ctx.drawImage(nc, 0, 0, W, H);
          ctx.restore();
        }
      }

      // ── 4. Target heat signature ──
      if (tx != null && ty != null) {
        const pulse = 0.78 + Math.sin(t * 3.8) * 0.13;
        const pulseFast = 0.9 + Math.sin(t * 7) * 0.1;

        // Outer warm halo
        const halo = ctx.createRadialGradient(tx, ty, 0, tx, ty, 90);
        halo.addColorStop(0, `rgba(160,165,185,${pulse * 0.22})`);
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, W, H);

        // Mid heat ring
        const mid = ctx.createRadialGradient(tx, ty, 0, tx, ty, 32);
        mid.addColorStop(0, `rgba(240,242,255,${pulse * 0.88})`);
        mid.addColorStop(0.45, `rgba(190,195,215,${pulse * 0.5})`);
        mid.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = mid;
        ctx.fillRect(0, 0, W, H);

        // Hot white core
        const core = ctx.createRadialGradient(tx, ty, 0, tx, ty, 9);
        core.addColorStop(0, `rgba(255,255,255,${pulseFast})`);
        core.addColorStop(1, "rgba(210,215,235,0)");
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, W, H);

        // Target reticle
        drawReticle(ctx, tx, ty, 38, `rgba(248,113,113,${0.7 + Math.sin(t * 4) * 0.15})`, "TGT");
      }

      // ── 5. Drone center reticle ──
      drawReticle(ctx, W / 2, H / 2, 52, "rgba(255,255,255,0.82)");

      // ── 6. Scanlines ──
      ctx.save();
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = "#000";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      ctx.restore();

      // ── 7. Vignette ──
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.min(W, H) * 0.78);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.68)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // ── 8. Coords overlay ──
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${lat.toFixed(4)}N  ${lon.toFixed(4)}E`, 12, H - 12);
      ctx.restore();

      // ── 9. Static / destroy effect ──
      if (isStatic) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.55 + 0.1})`;
        ctx.fillRect(0, 0, W, H);
        const bands = Math.floor(Math.random() * 6) + 2;
        for (let b = 0; b < bands; b++) {
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.85})`;
          ctx.fillRect(0, Math.random() * H, W, Math.random() * 22 + 4);
        }
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, targetLat, targetLon, isStatic]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
