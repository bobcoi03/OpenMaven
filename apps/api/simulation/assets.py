"""Simulation asset model — the live state of every entity on the map."""

from enum import Enum

from pydantic import BaseModel, Field


class AssetStatus(str, Enum):
    ACTIVE = "active"
    DAMAGED = "damaged"
    DESTROYED = "destroyed"
    RTB = "rtb"  # returning to base
    HOLDING = "holding"
    MOVING = "moving"
    ON_MISSION = "on_mission"


class Position(BaseModel):
    """Geographic position with orientation."""

    latitude: float
    longitude: float
    altitude_m: float = 0.0
    heading_deg: float = 0.0
    pitch_deg: float = 0.0
    roll_deg: float = 0.0


class MovementOrder(BaseModel):
    """An in-progress movement command."""

    destination: Position
    start_tick: int
    arrive_tick: int
    origin_lat: float
    origin_lon: float


class SimAsset(BaseModel):
    """A single asset in the simulation world state."""

    asset_id: str
    callsign: str
    asset_type: str
    faction_id: str
    position: Position
    speed_kmh: float = 0.0
    max_speed_kmh: float = 0.0
    status: AssetStatus = AssetStatus.ACTIVE
    health: float = 1.0  # 0.0–1.0
    sensor_type: str | None = None
    sensor_range_km: float = 0.0
    weapons: list[str] = Field(default_factory=list)
    movement_order: MovementOrder | None = None

    def is_alive(self) -> bool:
        return self.status != AssetStatus.DESTROYED

    def apply_damage(self, damage_percent: float) -> None:
        """Reduce health. If health hits 0, mark destroyed."""
        self.health = max(0.0, self.health - damage_percent)
        if self.health <= 0:
            self.status = AssetStatus.DESTROYED
            self.movement_order = None
        elif self.health < 0.5:
            self.status = AssetStatus.DAMAGED

    def destroy(self) -> None:
        """Immediately destroy this asset."""
        self.health = 0.0
        self.status = AssetStatus.DESTROYED
        self.movement_order = None
