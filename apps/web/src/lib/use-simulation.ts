"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

export interface SimPosition {
  latitude: number;
  longitude: number;
  altitude_m: number;
  heading_deg: number;
  pitch_deg: number;
  roll_deg: number;
}

export interface SimMovementOrder {
  destination: SimPosition;
  start_tick: number;
  arrive_tick: number;
  origin_lat: number;
  origin_lon: number;
}

export interface SimAsset {
  asset_id: string;
  callsign: string;
  asset_type: string;
  faction_id: string;
  position: SimPosition;
  speed_kmh: number;
  max_speed_kmh: number;
  status: string;
  health: number;
  sensor_type: string | null;
  sensor_range_km: number;
  weapons: string[];
  movement_order: SimMovementOrder | null;
}

export interface SimFaction {
  faction_id: string;
  name: string;
  side: string;
  doctrine: string;
  capability: number;
  morale: number;
}

export interface SimSnapshot {
  tick: number;
  speed: number;
  assets: Record<string, SimAsset>;
  factions: Record<string, SimFaction>;
  pending_events: number;
}

export interface DetectionEntry {
  target_id: string;
  confidence: number;
  sensor_asset_id: string;
  lat: number;
  lon: number;
}

export interface GhostEntry {
  target_id: string;
  last_lat: number;
  last_lon: number;
  last_seen_tick: number;
  confidence_at_loss: number;
}

export interface MissionResult {
  outcome?: string;
  hit?: boolean;
  destroyed?: boolean;
  damage_percent?: number;
  description?: string;
  target_status?: string;
  target_health?: number;
  target_asset_type?: string;
  target_lat?: number;
  target_lon?: number;
  shooter_callsign?: string;
  shooter_asset_type?: string;
  distance_km?: number;
}

export interface MissionUpdate {
  mission_id: string;
  shooter_id: string;
  weapon_id: string;
  target_id: string;
  status: "en_route" | "complete" | "aborted";
  result: MissionResult | null;
}

export interface StrikeLogEntry {
  mission_id: string;
  shooter_callsign: string;
  weapon_id: string;
  target_callsign: string;
  target_id: string;
  status: string;
  result: MissionResult | null;
  tick: number;
}

export interface StateDiff {
  tick: number;
  asset_updates: Array<Record<string, unknown>>;
  events_fired: Array<Record<string, unknown>>;
  alerts: string[];
  detections: DetectionEntry[];
  ghosts: GhostEntry[];
  mission_updates: MissionUpdate[];
}

// ── Hook ────────────────────────────────────────────────────────────────────

interface UseSimulationOptions {
  /** WebSocket URL. Defaults to ws://localhost:8000/api/simulation/ws */
  url?: string;
  /** Auto-connect on mount. Default true */
  autoConnect?: boolean;
}

interface UseSimulationReturn {
  connected: boolean;
  tick: number;
  speed: number;
  assets: Record<string, SimAsset>;
  factions: Record<string, SimFaction>;
  pendingEvents: number;
  /** Currently detected enemy assets */
  detections: Record<string, DetectionEntry>;
  /** Previously detected enemies now out of sensor range */
  ghosts: Record<string, GhostEntry>;
  /** Active strike missions (keyed by mission_id) */
  activeMissions: Record<string, MissionUpdate>;
  /** Completed/aborted strike log entries */
  strikeLog: StrikeLogEntry[];
  /** Set simulation speed (0=pause, 1, 2, 5, 10) */
  setSpeed: (speed: number) => void;
  /** Execute a strike */
  strike: (weaponId: string, targetId: string) => void;
  /** Launch a strike mission (shooter flies to target then strikes) */
  strikeMission: (shooterId: string, weaponId: string, targetId: string) => void;
  /** Abort an active strike mission */
  abortMission: (missionId: string) => void;
  /** Move an asset */
  moveAsset: (assetId: string, lat: number, lon: number) => void;
  /** Request full state refresh */
  refresh: () => void;
}

export function useSimulation(options: UseSimulationOptions = {}): UseSimulationReturn {
  const {
    url = "ws://localhost:8000/api/simulation/ws",
    autoConnect = true,
  } = options;

  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState(0);
  const [speed, setSpeedState] = useState(0);
  const [assets, setAssets] = useState<Record<string, SimAsset>>({});
  const [factions, setFactions] = useState<Record<string, SimFaction>>({});
  const [pendingEvents, setPendingEvents] = useState(0);
  const [detections, setDetections] = useState<Record<string, DetectionEntry>>({});
  const [ghosts, setGhosts] = useState<Record<string, GhostEntry>>({});
  const [activeMissions, setActiveMissions] = useState<Record<string, MissionUpdate>>({});
  const [strikeLog, setStrikeLog] = useState<StrikeLogEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  // Keep a ref to assets for mission update callbacks
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  // ── Send helper ─────────────────────────────────────────────────────

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // ── Commands ────────────────────────────────────────────────────────

  const setSpeed = useCallback((s: number) => {
    send({ type: "set_speed", speed: s });
  }, [send]);

  const strike = useCallback((weaponId: string, targetId: string) => {
    send({ type: "strike", weapon_id: weaponId, target_id: targetId });
  }, [send]);

  const strikeMission = useCallback((shooterId: string, weaponId: string, targetId: string) => {
    send({ type: "strike_mission", shooter_id: shooterId, weapon_id: weaponId, target_id: targetId });
  }, [send]);

  const abortMission = useCallback((missionId: string) => {
    send({ type: "abort_mission", mission_id: missionId });
  }, [send]);

  const moveAsset = useCallback((assetId: string, lat: number, lon: number) => {
    send({ type: "move", asset_id: assetId, latitude: lat, longitude: lon });
  }, [send]);

  const refresh = useCallback(() => {
    send({ type: "get_state" });
  }, [send]);

  // ── Message handler ─────────────────────────────────────────────────

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "snapshot") {
      const data = msg.data;
      setTick(data.tick);
      setSpeedState(data.speed);
      setAssets(data.assets);
      setFactions(data.factions);
      setPendingEvents(data.pending_events);
      // Active missions from snapshot
      if (data.active_missions) {
        const mMap: Record<string, MissionUpdate> = {};
        for (const [mid, m] of Object.entries(data.active_missions as Record<string, Record<string, unknown>>)) {
          mMap[mid] = {
            mission_id: m.mission_id as string,
            shooter_id: m.shooter_id as string,
            weapon_id: m.weapon_id as string,
            target_id: m.target_id as string,
            status: (m.status as MissionUpdate["status"]) ?? "en_route",
            result: (m.result as MissionUpdate["result"]) ?? null,
          };
        }
        setActiveMissions(mMap);
      }
      // Fog of war initial state
      if (data.detections) {
        const dMap: Record<string, DetectionEntry> = {};
        for (const d of data.detections as DetectionEntry[]) {
          dMap[d.target_id] = d;
        }
        setDetections(dMap);
      }
      if (data.ghosts) {
        const gMap: Record<string, GhostEntry> = {};
        for (const g of data.ghosts as GhostEntry[]) {
          gMap[g.target_id] = g;
        }
        setGhosts(gMap);
      }
      return;
    }

    if (msg.type === "diff") {
      const diff: StateDiff = msg.data ?? msg;
      setTick(diff.tick);

      // Patch asset positions from diff
      if (diff.asset_updates?.length > 0) {
        setAssets((prev) => {
          const next = { ...prev };
          for (const update of diff.asset_updates) {
            const id = update.asset_id as string;
            if (id && next[id] && update.position) {
              const event = update.event as string | undefined;
              let status = next[id].status;
              // Never overwrite destroyed status
              if (status !== "destroyed") {
                if (event === "arrived") status = "active";
                else if (event === "moving") status = "moving";
              }
              next[id] = {
                ...next[id],
                position: update.position as SimPosition,
                status,
              };
            }
          }
          return next;
        });
      }

      // Fog of war updates
      if (diff.detections) {
        const dMap: Record<string, DetectionEntry> = {};
        for (const d of diff.detections) {
          dMap[d.target_id] = d;
        }
        setDetections(dMap);
      }
      if (diff.ghosts) {
        const gMap: Record<string, GhostEntry> = {};
        for (const g of diff.ghosts) {
          gMap[g.target_id] = g;
        }
        setGhosts(gMap);
      }

      // Mission updates
      if (diff.mission_updates?.length > 0) {
        setActiveMissions((prev) => {
          const next = { ...prev };
          for (const mu of diff.mission_updates) {
            if (mu.status === "complete" || mu.status === "aborted") {
              delete next[mu.mission_id];
            } else {
              next[mu.mission_id] = mu;
            }
          }
          return next;
        });

        // Append completed/aborted to strike log
        const currentAssets = assetsRef.current;
        const completed = diff.mission_updates.filter(
          (mu) => mu.status === "complete" || mu.status === "aborted",
        );
        if (completed.length > 0) {
          setStrikeLog((prev) => [
            ...completed.map((mu) => ({
              mission_id: mu.mission_id,
              shooter_callsign: currentAssets[mu.shooter_id]?.callsign ?? mu.shooter_id,
              weapon_id: mu.weapon_id,
              target_callsign: currentAssets[mu.target_id]?.callsign ?? mu.target_id,
              target_id: mu.target_id,
              status: mu.status,
              result: mu.result,
              tick: diff.tick,
            })),
            ...prev,
          ]);
        }

        // Update target asset health/status from mission results
        setAssets((prev) => {
          let next = prev;
          for (const mu of completed) {
            if (mu.result?.target_status && mu.result?.target_health !== undefined) {
              const target = next[mu.target_id];
              if (target) {
                if (next === prev) next = { ...prev };
                next[mu.target_id] = {
                  ...target,
                  status: mu.result.target_status,
                  health: mu.result.target_health,
                };
              }
            }
          }
          return next;
        });
      }
      return;
    }

    if (msg.type === "strike_result") {
      const data = msg.data ?? msg;
      const targetId = data.target_id as string;
      const targetStatus = data.target_status as string;
      const targetHealth = data.target_health as number | undefined;
      if (targetId) {
        setAssets((prev) => {
          const asset = prev[targetId];
          if (!asset) return prev;
          return {
            ...prev,
            [targetId]: {
              ...asset,
              status: targetStatus ?? asset.status,
              health: targetHealth ?? (targetStatus === "destroyed" ? 0 : asset.health),
            },
          };
        });
      }
      return;
    }

    if (msg.type === "abort_mission_result") {
      const data = msg.data ?? msg;
      const mid = data.mission_id as string;
      if (mid && !data.error) {
        setActiveMissions((prev) => {
          const next = { ...prev };
          delete next[mid];
          return next;
        });
      }
      return;
    }

    if (msg.type === "strike_mission_result") {
      const data = msg.data ?? msg;
      if (data.mission_id && !data.error) {
        setActiveMissions((prev) => ({
          ...prev,
          [data.mission_id as string]: {
            mission_id: data.mission_id as string,
            shooter_id: data.shooter_id as string,
            weapon_id: data.weapon_id as string,
            target_id: data.target_id as string,
            status: "en_route" as const,
            result: null,
          },
        }));
      }
      return;
    }

    if (msg.type === "speed_changed") {
      setSpeedState(msg.speed);
      return;
    }
  }, []);

  // ── Connection lifecycle ────────────────────────────────────────────

  useEffect(() => {
    if (!autoConnect) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = handleMessage;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url, autoConnect, handleMessage]);

  return {
    connected,
    tick,
    speed,
    assets,
    factions,
    pendingEvents,
    detections,
    ghosts,
    activeMissions,
    strikeLog,
    setSpeed,
    strike,
    strikeMission,
    abortMission,
    moveAsset,
    refresh,
  };
}
