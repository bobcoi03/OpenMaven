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
  targetDestroyed?: boolean;
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

// Screen-space blobs — positions are 0-1 fractions of canvas size.
// radiusPx is fixed pixel size so they're always visible at any altitude.
interface TerrainBlob {
  rx: number;       // 0-1 screen x at initial view
  ry: number;       // 0-1 screen y at initial view
  radiusPx: number; // fixed pixel radius (altitude-independent)
  heat: number;
  oscSpeed: number;
  oscPhase: number;
}

const NOISE_W = 200;
const NOISE_H = 120;

export function FlirFeed({ lat, lon, targetLat, targetLon, isStatic = false, targetDestroyed = false }: FlirFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const terrainRef = useRef<TerrainBlob[]>([]);
  const noiseRef = useRef<Uint8ClampedArray<ArrayBuffer> | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Last known target screen position — used as explosion center
  const lastTargetPxRef = useRef<{ x: number; y: number } | null>(null);
  // Explosion state: set when target is destroyed
  const explosionRef = useRef<{ startT: number; cx: number; cy: number } | null>(null);
  const prevDestroyedRef = useRef(false);

  // ── Init terrain + noise (once) ──────────────────────────────────────────
  useEffect(() => {
    startTimeRef.current = performance.now();

    const rng = seedRng(Math.round(lat * 137 + lon * 251));
    terrainRef.current = Array.from({ length: 14 }, () => ({
      rx: rng(),           // 0-1
      ry: rng(),           // 0-1
      radiusPx: rng() * 180 + 60,  // 60-240px — always visible
      heat: rng() * 55 + 38,       // 38-93 brightness
      oscSpeed: rng() * 0.35 + 0.06,
      oscPhase: rng() * Math.PI * 2,
    }));

    const nd = new Uint8ClampedArray(new ArrayBuffer(NOISE_W * NOISE_H * 4));
    const rng2 = seedRng(99);
    for (let i = 0; i < NOISE_W * NOISE_H; i++) {
      const v = Math.round(rng2() * 50 + 18); // brighter: 18-68
      nd[i * 4] = v; nd[i * 4 + 1] = v; nd[i * 4 + 2] = v; nd[i * 4 + 3] = 255;
    }
    noiseRef.current = nd;

    const nc = document.createElement("canvas");
    nc.width = NOISE_W;
    nc.height = NOISE_H;
    noiseCanvasRef.current = nc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Trigger explosion when target is destroyed ───────────────────────────
  useEffect(() => {
    if (targetDestroyed && !prevDestroyedRef.current) {
      const pos = lastTargetPxRef.current;
      if (pos && explosionRef.current === null) {
        explosionRef.current = {
          startT: (performance.now() - startTimeRef.current) / 1000,
          cx: pos.x,
          cy: pos.y,
        };
      }
    }
    prevDestroyedRef.current = targetDestroyed;
  }, [targetDestroyed]);

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
      ctx.fillStyle = "#1c1c24";
      ctx.fillRect(0, 0, W, H);

      // ── 2. Terrain heat patches (screen-space — visible at any altitude) ──
      // Blobs drift slowly as drone moves (parallax at fixed 80 px/km)
      const TERRAIN_DRIFT = 80; // px/km — decoupled from target zoom scale
      const dlatKmDrift = (lat - (terrainRef.current[0]?.rx ?? lat)) * 0; // we use cosLat below
      void dlatKmDrift; // terrain drift is applied per blob using drone delta from start
      for (const blob of terrainRef.current) {
        const pulse = Math.sin(t * blob.oscSpeed + blob.oscPhase) * 7;
        const heat = Math.round(Math.min(255, blob.heat + pulse));
        // Screen-space position, slowly shifting based on drone movement
        const bx = blob.rx * W + ((lon - (lon | 0)) * 111 * cosLat * TERRAIN_DRIFT) % W;
        const by = blob.ry * H - ((lat - (lat | 0)) * 111 * TERRAIN_DRIFT) % H;
        const br = blob.radiusPx;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(${heat},${heat},${heat + 3},0.75)`);
        g.addColorStop(0.5, `rgba(${Math.round(heat * 0.5)},${Math.round(heat * 0.5)},${Math.round(heat * 0.5)},0.4)`);
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
            const v = Math.round(Math.random() * 55 + 15); // brighter grain
            nd[i * 4] = v; nd[i * 4 + 1] = v; nd[i * 4 + 2] = v;
          }
          const imgData = nctx.createImageData(NOISE_W, NOISE_H);
          imgData.data.set(nd);
          nctx.putImageData(imgData, 0, 0);
          ctx.save();
          ctx.globalAlpha = 0.52;
          ctx.drawImage(nc, 0, 0, W, H);
          ctx.restore();
        }
      }

      // Track last known target screen position for explosion center
      if (tx != null && ty != null) {
        lastTargetPxRef.current = { x: tx, y: ty };
      }

      // ── 4. Target heat signature ──
      if (tx != null && ty != null && !targetDestroyed) {
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

      // ── 4b. Explosion effect ──
      if (explosionRef.current) {
        const { startT, cx, cy } = explosionRef.current;
        const elapsed = t - startT;

        // Initial white flash (0 – 0.15s)
        if (elapsed < 0.15) {
          const alpha = 0.95 * (1 - elapsed / 0.15);
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fillRect(0, 0, W, H);
        }

        // Expanding shockwave ring (0 – 2.5s)
        if (elapsed < 2.5) {
          const ringR = elapsed * 180 + 10;
          const ringA = Math.max(0, 0.75 - elapsed * 0.3);
          const ring = ctx.createRadialGradient(cx, cy, ringR * 0.75, cx, cy, ringR);
          ring.addColorStop(0, "rgba(0,0,0,0)");
          ring.addColorStop(0.6, `rgba(255,230,180,${ringA})`);
          ring.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = ring;
          ctx.fillRect(0, 0, W, H);
        }

        // Fireball bloom (0 – 3.5s, cools and fades)
        if (elapsed < 3.5) {
          const bloomR = Math.min(110, elapsed * 80 + 18);
          const bloomA = Math.max(0, 1 - elapsed / 3.5);
          const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
          bloom.addColorStop(0, `rgba(255,255,220,${bloomA})`);
          bloom.addColorStop(0.25, `rgba(255,200,120,${bloomA * 0.85})`);
          bloom.addColorStop(0.55, `rgba(200,130,60,${bloomA * 0.55})`);
          bloom.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = bloom;
          ctx.fillRect(0, 0, W, H);
        }

        // Lingering heat ember (3.5 – 7s)
        if (elapsed >= 3.5 && elapsed < 7) {
          const emberA = Math.max(0, 0.45 * (1 - (elapsed - 3.5) / 3.5));
          const ember = ctx.createRadialGradient(cx, cy, 0, cx, cy, 35);
          ember.addColorStop(0, `rgba(220,180,120,${emberA})`);
          ember.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = ember;
          ctx.fillRect(0, 0, W, H);
        }

        // Clear after 7s
        if (elapsed > 7) {
          explosionRef.current = null;
        }
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
      vig.addColorStop(1, "rgba(0,0,0,0.42)");
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
  }, [lat, lon, targetLat, targetLon, isStatic, targetDestroyed]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
