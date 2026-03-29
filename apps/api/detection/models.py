"""Data models for the Detection & Targeting Engine."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import UUID


@dataclass
class Asset:
    """Telemetry payload from the simulation engine representing a tracked entity."""

    asset_id: str
    asset_type: str   # e.g. "Tank", "Infantry", "Oil Plant"
    asset_class: str  # e.g. "Military", "Logistics", "Infrastructure"
    latitude: float
    longitude: float
    heading_deg: float = 0.0
    speed_kmh: float = 0.0


@dataclass
class Detection:
    """A confirmed sensor detection of an Asset."""

    detection_id: UUID
    timestamp: datetime
    asset_id: str
    asset_type: str
    confidence: float    # 0.0 – 100.0
    grid_ref: str        # MGRS grid reference string
    lat: float
    lon: float
    source_label: str    # e.g. "SIGINT", "IMINT"
    classification: str  # e.g. "UNCLASSIFIED"


class TargetStage(str, Enum):
    """Ordered lifecycle stages for a Target on the targeting board."""

    DYNAMIC = "DYNAMIC"
    PENDING_PAIRING = "PENDING_PAIRING"
    PAIRED = "PAIRED"
    IN_EXECUTION = "IN_EXECUTION"
    COMPLETE = "COMPLETE"


STAGE_ORDER: list[TargetStage] = [
    TargetStage.DYNAMIC,
    TargetStage.PENDING_PAIRING,
    TargetStage.PAIRED,
    TargetStage.IN_EXECUTION,
    TargetStage.COMPLETE,
]


@dataclass
class Target:
    """A tracked entity on the targeting board, linked to a Detection."""

    target_id: str
    detection: Detection
    stage: TargetStage
    created_at: datetime
    updated_at: datetime
    history: list[tuple[TargetStage, datetime]] = field(default_factory=list)


@dataclass
class TargetingBoard:
    """The shared targeting board: a keyed collection of active Targets."""

    targets: dict[str, Target] = field(default_factory=dict)


@dataclass
class Alert:
    """A triggered alert for a geofence breach or proximity event."""

    alert_type: str   # e.g. "GEOFENCE_BREACH", "PROXIMITY_WARNING"
    asset_id: str
    zone_name: str
    timestamp: datetime
    details: str = ""


@dataclass
class Zone:
    """A named geographic bounding box used for geofencing."""

    name: str
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
