"""Detection & Targeting Engine — pure simulation logic, no I/O or network."""

from detection.alert_rules import check_geofence, check_proximity, haversine, point_in_box
from detection.detection_engine import build_detection, process_assets
from detection.models import (
    Alert,
    Asset,
    Detection,
    STAGE_ORDER,
    Target,
    TargetingBoard,
    TargetStage,
    Zone,
)
from detection.targeting_board import advance_target, auto_triage, create_target, get_board

__all__ = [
    # models
    "Alert",
    "Asset",
    "Detection",
    "STAGE_ORDER",
    "Target",
    "TargetingBoard",
    "TargetStage",
    "Zone",
    # detection_engine
    "build_detection",
    "process_assets",
    # targeting_board
    "advance_target",
    "auto_triage",
    "create_target",
    "get_board",
    # alert_rules
    "check_geofence",
    "check_proximity",
    "haversine",
    "point_in_box",
]
