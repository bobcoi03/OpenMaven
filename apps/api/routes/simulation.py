"""Simulation API routes — WebSocket + REST control endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from simulation.manager import SimSpeed

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Lazy singleton access ────────────────────────────────────────────────────


def _get_sim():
    """Get the simulation manager singleton (lazy import to avoid circular deps)."""
    from dependencies import sim_manager, ws_manager
    return sim_manager, ws_manager


# ── REST endpoints ───────────────────────────────────────────────────────────


@router.get("/simulation/state")
async def get_state() -> dict[str, Any]:
    """Return full simulation snapshot."""
    sim, _ = _get_sim()
    return sim.get_snapshot()


class SpeedRequest(BaseModel):
    speed: float  # 0, 1, 2, 5, or 10


@router.post("/simulation/speed")
async def set_speed(req: SpeedRequest) -> dict[str, Any]:
    """Set simulation speed. 0 = paused."""
    sim, _ = _get_sim()
    sim.set_speed(SimSpeed(req.speed))
    return {"speed": sim.speed.value, "tick": sim.tick}


class StrikeRequest(BaseModel):
    weapon_id: str
    target_id: str


@router.post("/simulation/strike")
async def execute_strike(req: StrikeRequest) -> dict[str, Any]:
    """Execute a strike against a target asset."""
    sim, _ = _get_sim()
    return sim.command_strike(req.weapon_id, req.target_id)


class MoveRequest(BaseModel):
    asset_id: str
    latitude: float
    longitude: float
    altitude_m: float = 0.0
    terrain: str = "air"


@router.post("/simulation/move")
async def move_asset(req: MoveRequest) -> dict[str, Any]:
    """Order an asset to move to a destination."""
    sim, _ = _get_sim()
    return sim.command_move(req.asset_id, req.latitude, req.longitude, req.altitude_m, req.terrain)


# ── WebSocket ────────────────────────────────────────────────────────────────


@router.websocket("/simulation/ws")
async def simulation_websocket(ws: WebSocket) -> None:
    """WebSocket endpoint — clients receive state diffs each tick."""
    sim, ws_mgr = _get_sim()
    await ws_mgr.connect(ws)

    # Send initial full state on connect
    try:
        await ws.send_json({"type": "snapshot", "data": sim.get_snapshot()})
    except Exception:
        ws_mgr.disconnect(ws)
        return

    # Listen for commands from this client
    try:
        while True:
            message = await ws.receive_json()
            response = _handle_ws_message(sim, message)
            if response:
                await ws.send_json(response)
    except WebSocketDisconnect:
        ws_mgr.disconnect(ws)
    except Exception:
        ws_mgr.disconnect(ws)


def _handle_ws_message(sim, message: dict) -> dict[str, Any] | None:
    """Process a WebSocket command from a client."""
    msg_type = message.get("type", "")

    if msg_type == "set_speed":
        speed = message.get("speed", 0)
        sim.set_speed(SimSpeed(speed))
        return {"type": "speed_changed", "speed": sim.speed.value, "tick": sim.tick}

    if msg_type == "strike":
        result = sim.command_strike(message.get("weapon_id", ""), message.get("target_id", ""))
        return {"type": "strike_result", "data": result}

    if msg_type == "move":
        result = sim.command_move(
            message.get("asset_id", ""),
            message.get("latitude", 0),
            message.get("longitude", 0),
            message.get("altitude_m", 0),
            message.get("terrain", "air"),
        )
        return {"type": "move_result", "data": result}

    if msg_type == "strike_mission":
        result = sim.command_strike_mission(
            message.get("shooter_id", ""),
            message.get("weapon_id", ""),
            message.get("target_id", ""),
        )
        return {
            "type": "strike_mission_result",
            "data": {
                **result,
                "shooter_id": message.get("shooter_id", ""),
                "weapon_id": message.get("weapon_id", ""),
                "target_id": message.get("target_id", ""),
            },
        }

    if msg_type == "abort_mission":
        result = sim.command_abort_mission(message.get("mission_id", ""))
        return {"type": "abort_mission_result", "data": result}

    if msg_type == "get_state":
        return {"type": "snapshot", "data": sim.get_snapshot()}

    logger.warning("Unknown WS message type: %s", msg_type)
    return None
