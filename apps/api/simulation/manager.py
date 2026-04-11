"""SimulationManager — holds world state, runs the tick loop, processes commands."""

import asyncio
import collections
import logging
import random
import uuid
from enum import Enum
from typing import Any

from pydantic import BaseModel

from detection.detection_engine import process_assets
from detection.models import Asset as DetectionAsset, Detection, Target, TargetStage, TargetingBoard
from detection.targeting_board import auto_triage, create_target, set_target_stage
from simulation.assets import AssetStatus, MovementOrder, Position, SimAsset
from simulation.consequence_engine import ConsequenceEngine, LOW_CAPABILITY_THRESHOLD
from simulation.events import EventQueue, EventType, Mutation, SimEvent
from simulation.faction import Faction
from simulation.detection import SensorReading, compute_detections
from simulation.red_ai import RedAI
from simulation.rules import (
    DependencyLink,
    bearing_degrees,
    find_dependents,
    haversine_km,
    interpolate_position,
    resolve_strike_by_names,
    ticks_to_arrive,
)

logger = logging.getLogger(__name__)

def _derive_asset_class(asset_type: str) -> str:
    """Map a SimAsset type string to a detection Asset class."""
    t = asset_type.lower()
    if any(k in t for k in ("truck", "supply", "fuel", "depot", "convoy")):
        return "Logistics"
    if any(k in t for k in ("plant", "pump", "hospital", "base", "station")):
        return "Infrastructure"
    return "Military"


def _serialize_detection(detection: Detection) -> dict[str, Any]:
    return {
        "detection_id": str(detection.detection_id),
        "timestamp": detection.timestamp.isoformat(),
        "asset_id": detection.asset_id,
        "asset_type": detection.asset_type,
        "confidence": detection.confidence,
        "grid_ref": detection.grid_ref,
        "lat": detection.lat,
        "lon": detection.lon,
        "source_label": detection.source_label,
        "classification": detection.classification,
    }


def _serialize_target(target: Target) -> dict[str, Any]:
    return {
        "target_id": target.target_id,
        "stage": target.stage.value,
        "created_at": target.created_at.isoformat(),
        "updated_at": target.updated_at.isoformat(),
        "detection": _serialize_detection(target.detection),
        "history": [[stage.value, ts.isoformat()] for stage, ts in target.history],
    }

# ── Speed control ────────────────────────────────────────────────────────────


class SimSpeed(float, Enum):
    PAUSED = 0.0
    NORMAL = 1.0
    FAST = 2.0
    FASTER = 5.0
    FASTEST = 10.0


# ── State diff (broadcast to clients each tick) ─────────────────────────────


class DetectionEntry(BaseModel):
    """A detected enemy visible to the player this tick."""

    target_id: str
    confidence: float
    sensor_asset_id: str
    lat: float
    lon: float


class GhostEntry(BaseModel):
    """A previously detected enemy no longer in sensor range."""

    target_id: str
    last_lat: float
    last_lon: float
    last_seen_tick: int
    confidence_at_loss: float


class MissionUpdate(BaseModel):
    """Progress or completion of a strike mission, sent to clients."""

    mission_id: str
    shooter_id: str
    weapon_id: str
    target_id: str
    status: str  # en_route | complete | aborted
    result: dict[str, Any] | None = None


class StateDiff(BaseModel):
    """Changes from a single tick, sent to clients via WebSocket."""

    tick: int
    asset_updates: list[dict[str, Any]]
    events_fired: list[dict[str, Any]]
    alerts: list[str]
    detections: list[DetectionEntry] = []
    ghosts: list[GhostEntry] = []
    mission_updates: list[MissionUpdate] = []


# ── Manager ──────────────────────────────────────────────────────────────────


class StrikeMission(BaseModel):
    """A strike mission: shooter flies to target, strikes on arrival."""

    mission_id: str
    shooter_id: str
    weapon_id: str
    target_id: str
    status: str = "en_route"  # en_route | complete | aborted
    arrive_tick: int
    created_tick: int
    result: dict[str, Any] | None = None


class SimulationManager:
    """Central simulation state and tick loop.

    Holds all world state (assets, factions, events) and runs
    the tick loop as an asyncio background task. Commands from
    WebSocket clients mutate state here.
    """

    # Ghosts expire after this many ticks without re-detection
    GHOST_EXPIRY_TICKS: int = 60

    def __init__(self, tick_duration_s: float = 10.0) -> None:
        self.tick: int = 0
        self.speed: SimSpeed = SimSpeed.NORMAL
        self.tick_duration_s: float = tick_duration_s
        self._patrol_assets: set[str] = set()  # asset IDs on auto-patrol

        self.assets: dict[str, SimAsset] = {}
        self.factions: dict[str, Faction] = {}
        self.dependencies: list[DependencyLink] = []
        self.event_queue: EventQueue = EventQueue()
        self.event_log: collections.deque[SimEvent] = collections.deque(maxlen=1000)
        self.targeting_board: TargetingBoard = TargetingBoard()
        self._rng: random.Random = random.Random()

        # Fog of war state
        self._detected: dict[str, SensorReading] = {}  # currently detected enemies
        self._ghosts: dict[str, GhostEntry] = {}  # last-known positions

        # Strike missions
        self.active_missions: dict[str, StrikeMission] = {}
        self.mission_log: list[StrikeMission] = []
        self._missions_resolved_this_tick: list[StrikeMission] = []

        self._task: asyncio.Task[None] | None = None
        self._broadcast_fn: Any = None  # set externally by WebSocket manager
        self._red_ai: RedAI = RedAI()
        self._consequence_engine: ConsequenceEngine = ConsequenceEngine()
        # (faction_id, trigger) pairs queued by sync code for async CE processing
        self._pending_ce_triggers: list[tuple[str, str]] = []
        # Tracks in-flight CE tasks so they can be cancelled on stop()
        self._ce_tasks: set[asyncio.Task] = set()

    # ── Lifecycle ─────────────────────────────────────────────────────────

    def start(self) -> None:
        """Start the background tick loop."""
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._tick_loop())
        logger.info("Simulation started.")

    def stop(self) -> None:
        """Stop the background tick loop and cancel any in-flight CE tasks."""
        if self._task is None:
            return
        self._task.cancel()
        self._task = None
        for ce_task in self._ce_tasks:
            ce_task.cancel()
        self._ce_tasks.clear()
        logger.info("Simulation stopped.")

    def set_speed(self, speed: SimSpeed) -> None:
        self.speed = speed

    # ── Setup ─────────────────────────────────────────────────────────────

    def add_asset(self, asset: SimAsset) -> None:
        self.assets[asset.asset_id] = asset

    def add_faction(self, faction: Faction) -> None:
        self.factions[faction.faction_id] = faction

    def add_dependency(self, dep: DependencyLink) -> None:
        self.dependencies.append(dep)

    def get_asset(self, asset_id: str) -> SimAsset | None:
        return self.assets.get(asset_id)

    def get_faction(self, faction_id: str) -> Faction | None:
        return self.factions.get(faction_id)

    def get_snapshot(self) -> dict[str, Any]:
        """Return full world state as a serializable dict."""
        return {
            "tick": self.tick,
            "speed": self.speed.value,
            "assets": {k: v.model_dump() for k, v in self.assets.items()},
            "factions": {k: v.model_dump() for k, v in self.factions.items()},
            "pending_events": self.event_queue.pending_count,
            "detections": [
                DetectionEntry(
                    target_id=r.target_id,
                    confidence=r.confidence,
                    sensor_asset_id=r.sensor_asset_id,
                    lat=r.lat,
                    lon=r.lon,
                ).model_dump()
                for r in self._detected.values()
            ],
            "ghosts": [g.model_dump() for g in self._ghosts.values()],
            "active_missions": {
                k: v.model_dump() for k, v in self.active_missions.items()
            },
        }

    # ── Fog of war ─────────────────────────────────────────────────────────

    def _tick_detections(self) -> tuple[list[DetectionEntry], list[GhostEntry]]:
        """Run sensor detection for the blue faction against all hostiles."""
        blue_sensors = {
            aid: a for aid, a in self.assets.items()
            if a.faction_id == "blue" and a.is_alive()
        }
        hostile_targets = {
            aid: a for aid, a in self.assets.items()
            if a.faction_id not in ("blue", "civilian") and a.is_alive()
        }

        readings = compute_detections(blue_sensors, hostile_targets)
        detected_ids = {r.target_id for r in readings}

        # Update detection state
        new_detected: dict[str, SensorReading] = {}
        for r in readings:
            new_detected[r.target_id] = r

        # Transition: previously detected but now lost → ghost
        for tid, old_reading in self._detected.items():
            if tid not in detected_ids:
                self._ghosts[tid] = GhostEntry(
                    target_id=tid,
                    last_lat=old_reading.lat,
                    last_lon=old_reading.lon,
                    last_seen_tick=self.tick - 1,
                    confidence_at_loss=old_reading.confidence,
                )

        # Remove ghosts that got re-detected
        for tid in detected_ids:
            self._ghosts.pop(tid, None)

        # Expire old ghosts
        expired = [
            tid for tid, g in self._ghosts.items()
            if self.tick - g.last_seen_tick > self.GHOST_EXPIRY_TICKS
        ]
        for tid in expired:
            del self._ghosts[tid]

        self._detected = new_detected

        detection_entries = [
            DetectionEntry(
                target_id=r.target_id,
                confidence=r.confidence,
                sensor_asset_id=r.sensor_asset_id,
                lat=r.lat,
                lon=r.lon,
            )
            for r in readings
        ]
        ghost_entries = list(self._ghosts.values())

        return detection_entries, ghost_entries

    # ── Commands ──────────────────────────────────────────────────────────

    def command_strike(self, weapon_id: str, target_id: str) -> dict[str, Any]:
        """Execute a strike against a target asset."""
        target = self.assets.get(target_id)
        if target is None:
            return {"error": "Target not found"}
        if not target.is_alive():
            return {"error": "Target already destroyed"}

        result = resolve_strike_by_names(weapon_id, target.asset_type)
        if result is None:
            return {"error": f"Unknown weapon: {weapon_id}"}

        target.apply_damage(result.damage_percent)
        self._update_faction_capability(target.faction_id)

        if result.destroyed:
            self._handle_infrastructure_cascade(target_id)

        # Log as event
        event = self.event_queue.create_and_schedule(
            event_type=EventType.STRIKE,
            description=f"Strike on {target.callsign}: {result.description}",
            scheduled_tick=self.tick,  # immediate
            faction_id=target.faction_id,
        )
        self.event_log.append(event)

        # Queue immediate counter-fire from the struck faction.
        if result.hit:
            retaliation = self._red_ai.retaliate_on_strike(
                self, target.faction_id, attacker_id=None
            )
            self._pending_retaliation.append(retaliation)

        return {
            "result": result.model_dump(),
            "target_status": target.status.value,
            "target_health": target.health,
        }

    def command_move(
        self,
        asset_id: str,
        dest_lat: float,
        dest_lon: float,
        dest_alt: float = 0.0,
        terrain: str = "air",
    ) -> dict[str, Any]:
        """Order an asset to move to a destination."""
        asset = self.assets.get(asset_id)
        if asset is None:
            return {"error": "Asset not found"}
        if not asset.is_alive():
            return {"error": "Asset is destroyed"}

        distance = haversine_km(
            asset.position.latitude, asset.position.longitude,
            dest_lat, dest_lon,
        )
        speed = asset.max_speed_kmh or asset.speed_kmh
        ticks = ticks_to_arrive(speed, distance, terrain, self.tick_duration_s)

        if ticks < 0:
            return {"error": "Asset cannot move (zero speed)"}

        asset.movement_order = MovementOrder(
            destination=Position(latitude=dest_lat, longitude=dest_lon, altitude_m=dest_alt),
            start_tick=self.tick,
            arrive_tick=self.tick + ticks,
            origin_lat=asset.position.latitude,
            origin_lon=asset.position.longitude,
        )
        asset.status = AssetStatus.MOVING
        heading = bearing_degrees(
            asset.position.latitude, asset.position.longitude,
            dest_lat, dest_lon,
        )
        asset.position.heading_deg = heading

        return {
            "distance_km": round(distance, 1),
            "eta_ticks": ticks,
            "heading": round(heading, 1),
        }

    def command_strike_mission(
        self,
        shooter_id: str,
        weapon_id: str,
        target_id: str,
    ) -> dict[str, Any]:
        """Order a shooter to fly to a target and strike on arrival."""
        shooter = self.assets.get(shooter_id)
        if shooter is None:
            return {"error": "Shooter not found"}
        if not shooter.is_alive():
            return {"error": "Shooter is destroyed"}

        target = self.assets.get(target_id)
        if target is None:
            return {"error": "Target not found"}
        if not target.is_alive():
            return {"error": "Target already destroyed"}

        if weapon_id not in {w for w in shooter.weapons}:
            return {"error": f"Shooter does not have weapon: {weapon_id}"}

        # Move shooter to target position
        move_result = self.command_move(
            shooter_id,
            target.position.latitude,
            target.position.longitude,
            dest_alt=shooter.position.altitude_m,
        )
        if "error" in move_result:
            return move_result

        # Set mission status and remove from patrol
        shooter.status = AssetStatus.ON_MISSION
        self._patrol_assets.discard(shooter_id)

        arrive_tick = self.tick + move_result["eta_ticks"]
        mission_id = f"msn_{uuid.uuid4().hex[:8]}"

        # Schedule strike event at arrival
        self.event_queue.create_and_schedule(
            event_type=EventType.STRIKE_MISSION,
            description=f"Strike mission: {shooter.callsign} → {target.callsign}",
            scheduled_tick=arrive_tick,
            faction_id="blue",
            mission_id=mission_id,
        )

        mission = StrikeMission(
            mission_id=mission_id,
            shooter_id=shooter_id,
            weapon_id=weapon_id,
            target_id=target_id,
            arrive_tick=arrive_tick,
            created_tick=self.tick,
        )
        self.active_missions[mission_id] = mission

        # Advance target on board: → PAIRED → IN_EXECUTION
        if target_id in self.targeting_board.targets:
            self.targeting_board = set_target_stage(
                target_id, TargetStage.PAIRED, self.targeting_board,
            )
            self.targeting_board = set_target_stage(
                target_id, TargetStage.IN_EXECUTION, self.targeting_board,
            )

        return {
            "mission_id": mission_id,
            "distance_km": move_result["distance_km"],
            "eta_ticks": move_result["eta_ticks"],
            "heading": move_result["heading"],
        }

    def command_abort_mission(self, mission_id: str) -> dict[str, Any]:
        """Abort an active strike mission. Shooter returns to active status."""
        mission = self.active_missions.get(mission_id)
        if mission is None:
            return {"error": "Mission not found or already resolved"}

        # Cancel the scheduled strike event
        self.event_queue.cancel_by_mission_id(mission_id)

        # Reset shooter status and resume patrol
        shooter = self.assets.get(mission.shooter_id)
        if shooter and shooter.is_alive():
            shooter.status = AssetStatus.ACTIVE
            shooter.movement_order = None
            self.assign_patrol(shooter.asset_id)

        mission.status = "aborted"
        mission.result = {"outcome": "aborted", "description": "Mission aborted by operator."}
        self.mission_log.append(mission)
        del self.active_missions[mission_id]

        return {"mission_id": mission_id, "status": "aborted"}

    def _resolve_strike_mission(self, mission_id: str) -> None:
        """Resolve a strike mission when the shooter arrives at the target."""
        mission = self.active_missions.get(mission_id)
        if mission is None:
            return

        def _finish_mission() -> None:
            """Move mission to log and mark as resolved this tick."""
            self.mission_log.append(mission)
            self._missions_resolved_this_tick.append(mission)
            del self.active_missions[mission_id]

        shooter = self.assets.get(mission.shooter_id)
        target = self.assets.get(mission.target_id)

        # Abort if shooter destroyed en route
        if shooter is None or not shooter.is_alive():
            mission.status = "aborted"
            mission.result = {"outcome": "aborted", "description": "Shooter destroyed en route."}
            if mission.target_id in self.targeting_board.targets:
                self.targeting_board = set_target_stage(
                    mission.target_id, TargetStage.PENDING_PAIRING, self.targeting_board,
                )
            _finish_mission()
            return

        # Abort if target already destroyed
        if target is None or not target.is_alive():
            mission.status = "aborted"
            mission.result = {"outcome": "aborted", "description": "Target already destroyed."}
            shooter.status = AssetStatus.ACTIVE
            self.assign_patrol(shooter.asset_id)
            if mission.target_id in self.targeting_board.targets:
                self.targeting_board = set_target_stage(
                    mission.target_id, TargetStage.PENDING_PAIRING, self.targeting_board,
                )
            _finish_mission()
            return

        # Resolve strike
        result = resolve_strike_by_names(mission.weapon_id, target.asset_type)
        if result is None:
            mission.status = "aborted"
            mission.result = {"outcome": "aborted", "description": f"Unknown weapon: {mission.weapon_id}"}
            shooter.status = AssetStatus.ACTIVE
            self.assign_patrol(shooter.asset_id)
            if mission.target_id in self.targeting_board.targets:
                self.targeting_board = set_target_stage(
                    mission.target_id, TargetStage.PENDING_PAIRING, self.targeting_board,
                )
            _finish_mission()
            return

        target.apply_damage(result.damage_percent)
        self._update_faction_capability(target.faction_id)

        if result.destroyed:
            self._handle_infrastructure_cascade(mission.target_id)

        # Suppress the target: it cannot return fire for a few ticks.
        if result.hit:
            target.suppress(self.tick + 5)

        mission.status = "complete"
        mission.result = {
            "outcome": result.outcome.value,
            "hit": result.hit,
            "destroyed": result.destroyed,
            "damage_percent": result.damage_percent,
            "description": result.description,
            "target_status": target.status.value,
            "target_health": target.health,
            "suppressed_until_tick": target.suppressed_until_tick,
            "target_asset_type": target.asset_type,
            "target_lat": target.position.latitude,
            "target_lon": target.position.longitude,
            "shooter_callsign": shooter.callsign,
            "shooter_asset_type": shooter.asset_type,
            "distance_km": round(haversine_km(
                shooter.position.latitude, shooter.position.longitude,
                target.position.latitude, target.position.longitude,
            ), 1),
        }

        # Advance target on board to COMPLETE
        if mission.target_id in self.targeting_board.targets:
            self.targeting_board = set_target_stage(
                mission.target_id, TargetStage.COMPLETE, self.targeting_board,
            )

        shooter.status = AssetStatus.ACTIVE
        self.assign_patrol(shooter.asset_id)
        _finish_mission()

    # ── Auto-patrol ─────────────────────────────────────────────────────

    # Static asset types that should never patrol
    _STATIC_TYPES: set[str] = {
        "M777 Howitzer", "M224 Mortar", "M142 HIMARS",
        "S-400 Triumf SAM", "MIM-104 Patriot", "Iron Dome Defense System",
        "EW Radar Vehicle", "Forward Operating Base", "Field Hospital",
        "Oil Pump Jack",
    }

    def assign_patrol(self, asset_id: str) -> None:
        """Give an asset a random waypoint near its current position."""
        asset = self.assets.get(asset_id)
        if asset is None or not asset.is_alive():
            return
        if asset.max_speed_kmh <= 0 and asset.speed_kmh <= 0:
            return
        if asset.asset_type in self._STATIC_TYPES:
            return

        # Pick patrol radius based on asset domain
        atype = asset.asset_type
        is_air = any(k in atype for k in (
            "Reaper", "Global Hawk", "F-16", "F-35", "AC-130",
            "AWACS", "Apache", "Chinook", "C-17", "Drone",
        ))
        is_sea = any(k in atype for k in ("DDG", "Arleigh", "Seawolf", "Wasp", "Patrol Boat", "Queen Elizabeth"))

        if is_air:
            radius_deg = 1.5  # ~150 km
            terrain = "air"
            alt = asset.position.altitude_m
        elif is_sea:
            radius_deg = 0.5  # ~50 km
            terrain = "water"
            alt = 0.0
        else:
            radius_deg = 0.15  # ~15 km for ground
            terrain = "desert"
            alt = asset.position.altitude_m

        # Random destination within radius, clamped to theatre
        dlat = (random.random() - 0.5) * 2 * radius_deg
        dlon = (random.random() - 0.5) * 2 * radius_deg
        dest_lat = max(29.0, min(37.0, asset.position.latitude + dlat))
        dest_lon = max(34.0, min(48.0, asset.position.longitude + dlon))

        self.command_move(asset_id, dest_lat, dest_lon, dest_alt=alt, terrain=terrain)
        self._patrol_assets.add(asset_id)

    def assign_all_patrols(self) -> None:
        """Give every mobile asset an initial patrol waypoint."""
        for asset_id, asset in self.assets.items():
            if asset.is_alive() and asset.asset_type not in self._STATIC_TYPES:
                speed = asset.max_speed_kmh or asset.speed_kmh
                if speed > 0:
                    self.assign_patrol(asset_id)

    def _run_detection_tick(self) -> dict[str, Any]:
        """Run detection on hostile assets, update the targeting board, and return payload."""
        red_faction_ids = {
            fid for fid, faction in self.factions.items() if faction.side == "red"
        }

        detection_assets: dict[str, DetectionAsset] = {}
        for sim_asset in self.assets.values():
            if sim_asset.faction_id not in red_faction_ids:
                continue
            if not sim_asset.is_alive():
                continue
            detection_assets[sim_asset.asset_id] = DetectionAsset(
                asset_id=sim_asset.asset_id,
                asset_type=sim_asset.asset_type,
                asset_class=_derive_asset_class(sim_asset.asset_type),
                latitude=sim_asset.position.latitude,
                longitude=sim_asset.position.longitude,
                heading_deg=sim_asset.position.heading_deg,
                speed_kmh=sim_asset.speed_kmh,
            )

        detections = process_assets(detection_assets, self._rng)

        active_asset_ids = {
            target.detection.asset_id
            for target in self.targeting_board.targets.values()
            if target.stage != TargetStage.COMPLETE
        }

        new_detections = [
            detection for detection in detections
            if detection.asset_id not in active_asset_ids
        ]

        for detection in new_detections:
            self.targeting_board = create_target(detection, self.targeting_board)

        self.targeting_board = auto_triage(self.targeting_board)

        return {
            "board_state": [
                _serialize_target(target)
                for target in self.targeting_board.targets.values()
            ],
            "new_detections": [
                _serialize_detection(detection)
                for detection in new_detections
            ],
        }

    # ── Board broadcast ────────────────────────────────────────────────────

    async def _broadcast_board(self) -> None:
        """Serialize the targeting board and broadcast to all clients."""
        if self._broadcast_fn is None:
            return
        payload = {
            "board_state": [
                _serialize_target(target)
                for target in self.targeting_board.targets.values()
            ],
            "new_detections": [],
        }
        await self._broadcast_fn({"type": "detections", "data": payload})

    # ── Tick loop ─────────────────────────────────────────────────────────

    async def _tick_loop(self) -> None:
        """Run forever, advancing one tick per interval."""
        while True:
            if self.speed == SimSpeed.PAUSED:
                await asyncio.sleep(0.1)
                continue

            interval = self.tick_duration_s / self.speed.value
            await asyncio.sleep(interval)
            diff = self._advance_tick()
            detection_payload = self._run_detection_tick()

            if self._broadcast_fn is not None:
                await self._broadcast_fn({"type": "diff", "data": diff.model_dump()})
                await self._broadcast_fn({"type": "detections", "data": detection_payload})

            # Fire LLM consequence checks as a background task (non-blocking).
            self._fire_consequence_checks(diff)

    def _advance_tick(self) -> StateDiff:
        """Process one simulation tick."""
        self.tick += 1
        self._missions_resolved_this_tick = []
        asset_updates: list[dict[str, Any]] = []
        alerts: list[str] = []

        # 1. Process movement
        for asset in self.assets.values():
            update = self._tick_movement(asset)
            if update:
                asset_updates.append(update)

        # 2. Fire due events
        due_events = self.event_queue.pop_due_events(self.tick)
        events_fired = []
        for event in due_events:
            fired = self._resolve_event(event)
            if fired:
                events_fired.append(event.model_dump())
                self.event_log.append(event)

        # 3. Red AI — doctrine-based counterattacks
        red_result = self._red_ai.run_tick(self)
        asset_updates.extend(red_result.asset_updates)
        alerts.extend(red_result.alerts)

        # Flush retaliations queued this tick (from events resolved in step 2)
        # or carried over from commands issued between ticks (e.g. HTTP strikes).
        for ret in self._pending_retaliation:
            asset_updates.extend(ret.asset_updates)
            alerts.extend(ret.alerts)
        self._pending_retaliation.clear()

        # 4. Fog of war — run detection
        detection_entries, ghost_entries = self._tick_detections()

        # 5. Collect mission updates (resolved this tick + active en-route)
        mission_updates: list[MissionUpdate] = []
        for m in self._missions_resolved_this_tick:
            mission_updates.append(MissionUpdate(
                mission_id=m.mission_id,
                shooter_id=m.shooter_id,
                weapon_id=m.weapon_id,
                target_id=m.target_id,
                status=m.status,
                result=m.result,
            ))
        for m in self.active_missions.values():
            mission_updates.append(MissionUpdate(
                mission_id=m.mission_id,
                shooter_id=m.shooter_id,
                weapon_id=m.weapon_id,
                target_id=m.target_id,
                status=m.status,
            ))

        return StateDiff(
            tick=self.tick,
            asset_updates=asset_updates,
            events_fired=events_fired,
            alerts=alerts,
            detections=detection_entries,
            ghosts=ghost_entries,
            mission_updates=mission_updates,
        )

    def _tick_movement(self, asset: SimAsset) -> dict[str, Any] | None:
        """Update position for a moving asset. Returns update dict or None.

        Suppressed assets have their arrival extended by 1 tick per suppressed
        tick, effectively pausing movement until suppression lifts.
        """
        if not asset.is_alive():
            return None
        if asset.movement_order is None:
            return None

        order = asset.movement_order

        # Suppression penalty: delay arrival while under suppression.
        # Cap the total extra delay at 50 ticks so persistent suppression can't
        # pin an asset in place forever.
        if asset.is_suppressed(self.tick):
            if order.arrive_tick - self.tick < 50:
                order.arrive_tick += 1
            return {
                "asset_id": asset.asset_id,
                "event": "suppressed_moving",
                "position": asset.position.model_dump(),
                "suppressed_until_tick": asset.suppressed_until_tick,
            }

        if self.tick >= order.arrive_tick:
            # Arrived
            asset.position.latitude = order.destination.latitude
            asset.position.longitude = order.destination.longitude
            asset.position.altitude_m = order.destination.altitude_m
            asset.movement_order = None

            # On-mission assets wait for the strike event to resolve
            if asset.status != AssetStatus.ON_MISSION:
                asset.status = AssetStatus.ACTIVE
                # Auto-reassign patrol waypoint
                if asset.asset_id in self._patrol_assets:
                    self.assign_patrol(asset.asset_id)

            return {
                "asset_id": asset.asset_id,
                "event": "arrived",
                "position": asset.position.model_dump(),
            }

        # In transit — interpolate
        total_ticks = order.arrive_tick - order.start_tick
        elapsed = self.tick - order.start_tick
        fraction = elapsed / max(total_ticks, 1)

        lat, lon = interpolate_position(
            order.origin_lat, order.origin_lon,
            order.destination.latitude, order.destination.longitude,
            fraction,
        )
        asset.position.latitude = lat
        asset.position.longitude = lon

        return {
            "asset_id": asset.asset_id,
            "event": "moving",
            "position": asset.position.model_dump(),
            "progress": round(fraction, 2),
        }

    def _resolve_event(self, event: SimEvent) -> bool:
        """Roll probability and execute an event. Returns True if it fired."""
        if event.probability < 1.0 and random.random() > event.probability:
            return False

        # Strike mission events are resolved via the mission system
        if event.event_type == EventType.STRIKE_MISSION and event.mission_id:
            self._resolve_strike_mission(event.mission_id)
            return True

        for mutation in event.mutations:
            self._apply_mutation(mutation)
        return True

    def _apply_mutation(self, mutation: Mutation) -> None:
        """Apply a single mutation to world state."""
        action = mutation.action
        params = mutation.params

        if action == "destroy_asset":
            asset = self.assets.get(params.get("asset_id", ""))
            if asset:
                asset.destroy()
                self._update_faction_capability(asset.faction_id)
                self._handle_infrastructure_cascade(asset.asset_id)

        elif action == "damage_asset":
            asset = self.assets.get(params.get("asset_id", ""))
            if asset:
                asset.apply_damage(params.get("damage", 0.5))
                self._update_faction_capability(asset.faction_id)

        elif action == "move_asset":
            self.command_move(
                params.get("asset_id", ""),
                params.get("latitude", 0),
                params.get("longitude", 0),
            )

        elif action == "update_leader":
            faction_id = params.get("faction_id", "")
            faction = self.factions.get(faction_id)
            if faction:
                faction.kill_leader(params.get("leader_id", ""))
                # Queue a consequence evaluation — leader loss is a significant event.
                self._pending_ce_triggers.append((faction_id, "leader_killed"))

        elif action == "update_morale":
            faction = self.factions.get(params.get("faction_id", ""))
            if faction:
                faction.apply_morale_hit(params.get("severity", 0.1))

        elif action == "spawn_asset":
            asset_data = params.get("asset")
            if asset_data:
                faction_id = asset_data.get("faction_id", "")
                if faction_id not in self.factions:
                    logger.warning("spawn_asset: unknown faction_id=%s", faction_id)
                    return
                new_asset = SimAsset(**asset_data)
                self.add_asset(new_asset)

        else:
            logger.warning("Unknown mutation action: %s", action)

    # ── Consequence engine helpers ─────────────────────────────────────────

    def _apply_mutation_from_consequence(self, action: str, params: dict[str, Any]) -> None:
        """Apply a single mutation issued by the LLM consequence engine.

        Identical in shape to ``_apply_mutation`` but restricted to the safe
        subset of actions the LLM is allowed to issue, with existence checks
        before every write.
        """
        if action == "move_asset":
            asset_id = params.get("asset_id", "")
            lat = params.get("latitude")
            lon = params.get("longitude")
            if asset_id and lat is not None and lon is not None:
                try:
                    self.command_move(asset_id, float(lat), float(lon))
                except (ValueError, TypeError) as exc:
                    logger.warning("ConsequenceEngine: move_asset bad coords: %s", exc)

        elif action == "update_morale":
            faction_id = params.get("faction_id", "")
            try:
                severity = float(params.get("severity", 0.1))
            except (ValueError, TypeError):
                severity = 0.1
            faction = self.factions.get(faction_id)
            if faction:
                faction.apply_morale_hit(severity)

        elif action == "update_leader":
            faction_id = params.get("faction_id", "")
            leader_id = params.get("leader_id", "")
            faction = self.factions.get(faction_id)
            if faction and leader_id:
                faction.kill_leader(leader_id)

        else:
            logger.warning("ConsequenceEngine: unsupported action=%s", action)

    def _fire_consequence_checks(self, diff: "StateDiff") -> None:
        """Inspect a completed tick diff and schedule consequence evaluations.

        Called from the async tick loop so asyncio.create_task is safe.
        Triggers for a red faction:
          - Any red AI alert fired this tick (engagement happened)
          - A blue strike mission destroyed a red asset this tick
          - Red faction capability is below the low-capability threshold
          - A faction leader was killed this tick (via _pending_ce_triggers)
        """
        # faction_id → trigger label (last trigger wins for the label, but all fire)
        triggered: dict[str, str] = {}

        # Trigger: red AI fired (red factions under pressure / engaging)
        if diff.alerts:
            for faction_id, faction in self.factions.items():
                if faction.side == "red":
                    triggered[faction_id] = "engagement"

        # Trigger: a blue strike destroyed a red asset
        for mu in diff.mission_updates:
            if mu.status == "complete" and mu.result and mu.result.get("destroyed"):
                asset = self.assets.get(mu.target_id)
                if asset and asset.faction_id != "blue":
                    triggered[asset.faction_id] = "asset_destroyed"

        # Trigger: red faction capability critically low
        for faction_id, faction in self.factions.items():
            if faction.side == "red" and faction.capability < LOW_CAPABILITY_THRESHOLD:
                triggered.setdefault(faction_id, "low_capability")

        # Trigger: leader killed (queued synchronously by _apply_mutation)
        for faction_id, trigger_label in self._pending_ce_triggers:
            triggered[faction_id] = trigger_label
        self._pending_ce_triggers.clear()

        for faction_id, trigger_label in triggered.items():
            if self._consequence_engine.is_ready(faction_id, self.tick):
                task = asyncio.create_task(
                    self._consequence_engine.maybe_evaluate(
                        faction_id, trigger_label, self
                    )
                )
                self._ce_tasks.add(task)
                task.add_done_callback(self._ce_tasks.discard)

    # ── Internal helpers ──────────────────────────────────────────────────

    def _update_faction_capability(self, faction_id: str) -> None:
        """Recalculate a faction's capability from surviving assets."""
        faction = self.factions.get(faction_id)
        if faction is None:
            return

        faction_assets = [a for a in self.assets.values() if a.faction_id == faction_id]
        total = len(faction_assets)
        alive = sum(1 for a in faction_assets if a.is_alive())
        faction.recalculate_capability(alive, total)

    def _handle_infrastructure_cascade(self, destroyed_id: str) -> None:
        """When an asset is destroyed, degrade anything that depended on it."""
        dependents = find_dependents(destroyed_id, self.dependencies)
        for dep in dependents:
            target = self.assets.get(dep.target_id)
            if target is None or not target.is_alive():
                continue

            target.apply_damage(dep.degradation_rate)
            self.event_queue.create_and_schedule(
                event_type=EventType.INFRASTRUCTURE_CASCADE,
                description=f"{target.callsign} degraded — lost dependency on {destroyed_id}",
                scheduled_tick=self.tick,
            )
