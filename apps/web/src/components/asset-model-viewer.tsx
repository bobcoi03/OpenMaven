"use client";

import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Html } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import * as THREE from "three";

interface AssetModelViewerProps {
  modelPath: string;
  heading: number;
  pitch?: number;
  roll?: number;
  embedUrl?: string;
}

// ── Loading fallback ─────────────────────────────────────────────────────────

function LoadingFallback() {
  return (
    <Html center>
      <div className="flex items-center gap-2 text-[var(--om-text-muted)]">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-[11px]">Loading model...</span>
      </div>
    </Html>
  );
}

// ── 3D Model ─────────────────────────────────────────────────────────────────

function Model({ modelPath, heading, pitch = 0, roll = 0 }: AssetModelViewerProps) {
  const { scene } = useGLTF(modelPath);
  const { camera } = useThree();

  const normalizedScene = useMemo(() => {
    const clone = scene.clone();
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2 / maxDim;

    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    return clone;
  }, [scene]);

  useEffect(() => {
    camera.position.set(5, 2.5, 5);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  const headingRad = (heading * Math.PI) / 180;
  const pitchRad = (pitch * Math.PI) / 180;
  const rollRad = (roll * Math.PI) / 180;

  return (
    <group rotation={[pitchRad, -headingRad, rollRad]}>
      <primitive object={normalizedScene} />
    </group>
  );
}

// ── Camera azimuth tracker ───────────────────────────────────────────────────

function CameraAzimuthTracker({ onAzimuthChange }: { onAzimuthChange: (azimuth: number) => void }) {
  const { camera } = useThree();
  const prevAzimuth = useRef(0);

  useFrame(() => {
    const azimuth = Math.atan2(camera.position.x, camera.position.z);
    const azimuthDeg = (azimuth * 180) / Math.PI;

    if (Math.abs(azimuthDeg - prevAzimuth.current) > 0.5) {
      prevAzimuth.current = azimuthDeg;
      onAzimuthChange(azimuthDeg);
    }
  });

  return null;
}

// ── Compass rose ─────────────────────────────────────────────────────────────

function CompassRose({ heading, cameraAzimuth }: { heading: number; cameraAzimuth: number }) {
  const directions = [
    { label: "N", angle: 0 },
    { label: "E", angle: 90 },
    { label: "S", angle: 180 },
    { label: "W", angle: 270 },
  ];

  return (
    <div className="absolute bottom-3 left-3 w-24 h-24">
      <svg viewBox="0 0 96 96" className="w-full h-full">
        {/* Background */}
        <circle cx="48" cy="48" r="44" fill="rgba(0,0,0,0.6)" />
        <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* Rotating group — cardinal directions rotate with camera */}
        <g transform={`rotate(${-cameraAzimuth}, 48, 48)`}>
          {/* Tick marks every 30 degrees */}
          {Array.from({ length: 12 }, (_, i) => {
            const angle = i * 30;
            const rad = (angle * Math.PI) / 180;
            const isMajor = angle % 90 === 0;
            const innerR = isMajor ? 36 : 39;
            return (
              <line
                key={angle}
                x1={48 + innerR * Math.sin(rad)}
                y1={48 - innerR * Math.cos(rad)}
                x2={48 + 42 * Math.sin(rad)}
                y2={48 - 42 * Math.cos(rad)}
                stroke={isMajor ? "#71717a" : "#3f3f46"}
                strokeWidth={isMajor ? 1.5 : 0.75}
              />
            );
          })}

          {/* Cardinal direction labels */}
          {directions.map(({ label, angle }) => {
            const rad = (angle * Math.PI) / 180;
            const r = 30;
            const x = 48 + r * Math.sin(rad);
            const y = 48 - r * Math.cos(rad);
            const isNorth = label === "N";
            return (
              <text
                key={label}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={isNorth ? "#ef4444" : "#a1a1aa"}
                fontSize="9"
                fontWeight="700"
              >
                {label}
              </text>
            );
          })}

          {/* Heading indicator — shows where the asset is pointing */}
          <line
            x1="48"
            y1="48"
            x2={48 + 22 * Math.sin((heading * Math.PI) / 180)}
            y2={48 - 22 * Math.cos((heading * Math.PI) / 180)}
            stroke="#2D72D2"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Heading arrowhead */}
          <circle
            cx={48 + 22 * Math.sin((heading * Math.PI) / 180)}
            cy={48 - 22 * Math.cos((heading * Math.PI) / 180)}
            r="2.5"
            fill="#2D72D2"
          />
        </g>

        {/* Fixed center — camera direction indicator (always points up) */}
        <polygon
          points="48,22 45,28 51,28"
          fill="none"
          stroke="#71717a"
          strokeWidth="1"
        />

        {/* Center dot */}
        <circle cx="48" cy="48" r="2" fill="#2D72D2" opacity="0.6" />

        {/* Heading readout */}
        <text
          x="48"
          y="64"
          textAnchor="middle"
          fill="#2D72D2"
          fontSize="8"
          fontFamily="monospace"
          fontWeight="600"
        >
          {heading.toFixed(0)}°
        </text>
      </svg>
    </div>
  );
}

// ── Main viewer ──────────────────────────────────────────────────────────────

export function AssetModelViewer({ modelPath, heading, pitch = 0, roll = 0, embedUrl }: AssetModelViewerProps) {
  const [cameraAzimuth, setCameraAzimuth] = useState(45);

  const handleAzimuthChange = useCallback((azimuth: number) => {
    setCameraAzimuth(azimuth);
  }, []);

  // Sketchfab embed mode
  if (embedUrl) {
    const src = embedUrl + (embedUrl.includes("?") ? "&" : "?")
      + "autostart=1&transparent=1&ui_theme=dark&ui_controls=1&ui_infos=0&ui_watermark_link=0&ui_watermark=0";

    return (
      <div className="relative w-full h-full bg-[var(--om-bg-deep)] rounded-none overflow-hidden border border-[var(--om-border)]">
        <iframe
          title="Asset 3D Model"
          src={src}
          className="w-full h-full"
          allow="autoplay; fullscreen; xr-spatial-tracking"
          allowFullScreen
          style={{ border: "none", background: "#1E2229" }}
        />
        <CompassRose heading={heading} cameraAzimuth={0} />
        <div className="absolute bottom-3 right-3 text-[9px] text-[var(--om-text-disabled)] italic">
          Notional model — may not reflect actual asset type
        </div>
      </div>
    );
  }

  // Local GLB mode
  return (
    <div className="relative w-full h-full bg-[var(--om-bg-deep)] rounded-none overflow-hidden border border-[var(--om-border)]">
      <Canvas
        camera={{ position: [5, 2.5, 5], fov: 45, near: 0.01, far: 1000 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <directionalLight position={[-3, 4, -3]} intensity={0.4} />

        <Suspense fallback={<LoadingFallback />}>
          <Model modelPath={modelPath} heading={heading} pitch={pitch} roll={roll} />
          <Environment preset="night" />
        </Suspense>

        <CameraAzimuthTracker onAzimuthChange={handleAzimuthChange} />

        <OrbitControls
          enablePan={true}
          minDistance={1}
          maxDistance={100}
          target={[0, 0, 0]}
        />
      </Canvas>

      <CompassRose heading={heading} cameraAzimuth={cameraAzimuth} />

      {/* Navigation instructions */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1">
        <div className="flex items-center gap-3 text-[9px] text-[var(--om-text-muted)]">
          <span><span className="text-[var(--om-text-muted)]">Left drag</span> Orbit</span>
          <span><span className="text-[var(--om-text-muted)]">Right drag</span> Pan</span>
          <span><span className="text-[var(--om-text-muted)]">Scroll</span> Zoom</span>
        </div>
        <span className="text-[9px] text-[var(--om-text-disabled)] italic">
          Notional model — may not reflect actual asset type
        </span>
      </div>
    </div>
  );
}
