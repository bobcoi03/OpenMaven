"""Faction model — doctrine, leadership, capability, morale."""

from dataclasses import dataclass, field
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


@dataclass
class PatrolZone:
    """Rectangular patrol area for a faction with cycling waypoints."""

    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float
    waypoints: list[tuple[float, float]] = field(default_factory=list)

    def next_waypoint(self, current_index: int) -> tuple[float, float]:
        """Return the waypoint after current_index, wrapping around."""
        if not self.waypoints:
            centre_lat = (self.min_lat + self.max_lat) / 2
            centre_lon = (self.min_lon + self.max_lon) / 2
            return (centre_lat, centre_lon)
        return self.waypoints[(current_index + 1) % len(self.waypoints)]


class Doctrine(str, Enum):
    """How a faction fights."""

    AGGRESSIVE = "aggressive"
    DEFENSIVE = "defensive"
    ASYMMETRIC = "asymmetric"
    GUERRILLA = "guerrilla"


class Leader(BaseModel):
    """A member of the faction's leadership chain."""

    leader_id: str
    name: str
    rank: str
    alive: bool = True


class Resources(BaseModel):
    """Consumable faction resources. Each is 0.0–1.0 (fraction of max)."""

    fuel: float = 1.0
    ammo: float = 1.0
    manpower: float = 1.0


class Faction(BaseModel):
    """A faction in the simulation."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    faction_id: str
    name: str
    side: str  # "blue", "red", "neutral", "civilian"
    doctrine: Doctrine
    leadership: list[Leader] = Field(default_factory=list)
    capability: float = 1.0  # 0.0–1.0, derived from remaining assets
    morale: float = 1.0  # 0.0–1.0
    alliances: list[str] = Field(default_factory=list)
    resources: Resources = Field(default_factory=Resources)
    retaliation_threshold: float = 0.3  # capability loss % that triggers retaliation
    asset_ids: list[str] = Field(default_factory=list)
    patrol_zone: PatrolZone | None = None

    def current_leader(self) -> Leader | None:
        """Return the first living leader in the succession chain."""
        for leader in self.leadership:
            if leader.alive:
                return leader
        return None

    def kill_leader(self, leader_id: str) -> Leader | None:
        """Mark a leader as dead. Returns the new leader, or None if none left."""
        for leader in self.leadership:
            if leader.leader_id == leader_id:
                leader.alive = False
                break
        return self.current_leader()

    def recalculate_capability(self, alive_count: int, total_count: int) -> None:
        """Update capability score from the ratio of surviving assets."""
        if total_count == 0:
            self.capability = 0.0
            return
        self.capability = alive_count / total_count

    def apply_morale_hit(self, severity: float) -> None:
        """Reduce morale by a severity factor (0.0–1.0). Clamps to [0, 1]."""
        self.morale = max(0.0, self.morale - severity)

    def consume_resources(self, fuel: float = 0.0, ammo: float = 0.0, manpower: float = 0.0) -> None:
        """Deduct resources. Clamps each to [0, 1]."""
        self.resources.fuel = max(0.0, self.resources.fuel - fuel)
        self.resources.ammo = max(0.0, self.resources.ammo - ammo)
        self.resources.manpower = max(0.0, self.resources.manpower - manpower)

    def should_retaliate(self, initial_capability: float) -> bool:
        """Check if capability loss exceeds the retaliation threshold."""
        loss = initial_capability - self.capability
        return loss >= self.retaliation_threshold
