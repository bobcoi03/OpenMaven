"""Core detection engine: probabilistic detection rolls and Detection object construction."""

import random
from datetime import datetime, timezone
from uuid import uuid4

from mgrs import MGRS as MGRSConverter

from detection.models import Asset, Detection

# ── Detection Rate Constants ──────────────────────────────────────────────────
DETECTION_RATE_MILITARY: float = 0.10
DETECTION_RATE_LOGISTICS: float = 0.05
DETECTION_RATE_DEFAULT: float = 0.03

# ── Confidence Constants ──────────────────────────────────────────────────────
CONFIDENCE_BY_TYPE: dict[str, float] = {
    "Tank": 88.0,
    "Artillery": 79.0,
    "Helicopter": 82.0,
    "Infantry": 55.0,
    "Oil Plant": 72.0,
    "Supply Truck": 63.0,
}
CONFIDENCE_DEFAULT: float = 65.0
CONFIDENCE_JITTER: float = 10.0   # ± random variance applied to base confidence
CONFIDENCE_MIN: float = 0.0
CONFIDENCE_MAX: float = 100.0

# ── Source & Classification Constants ────────────────────────────────────────
CLASSIFICATION_DEFAULT: str = "UNCLASSIFIED"
SOURCE_LABELS: list[str] = ["SIGINT", "IMINT", "HUMINT", "ELINT", "OSINT"]

_DETECTION_RATES: dict[str, float] = {
    "Military": DETECTION_RATE_MILITARY,
    "Logistics": DETECTION_RATE_LOGISTICS,
}

_mgrs_converter = MGRSConverter()


def get_detection_rate(asset: Asset) -> float:
    """Return the roll threshold for detecting this asset based on its class."""
    return _DETECTION_RATES.get(asset.asset_class, DETECTION_RATE_DEFAULT)


def get_base_confidence(asset_type: str) -> float:
    """Return the base confidence score (0–100) for a given asset type."""
    return CONFIDENCE_BY_TYPE.get(asset_type, CONFIDENCE_DEFAULT)


def roll_detection(asset: Asset, rng: random.Random) -> bool:
    """Return True if the asset is detected based on its class detection rate."""
    return rng.random() < get_detection_rate(asset)


def convert_to_mgrs(lat: float, lon: float) -> str:
    """Convert WGS-84 coordinates to a MGRS grid reference string."""
    return _mgrs_converter.toMGRS(lat, lon)


def build_detection(asset: Asset, rng: random.Random) -> Detection:
    """Build a Detection for an asset that passed its detection roll."""
    base = get_base_confidence(asset.asset_type)
    jitter = rng.uniform(-CONFIDENCE_JITTER, CONFIDENCE_JITTER)
    confidence = round(max(CONFIDENCE_MIN, min(CONFIDENCE_MAX, base + jitter)), 2)
    return Detection(
        detection_id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        asset_id=asset.asset_id,
        asset_type=asset.asset_type,
        confidence=confidence,
        grid_ref=convert_to_mgrs(asset.latitude, asset.longitude),
        lat=asset.latitude,
        lon=asset.longitude,
        source_label=rng.choice(SOURCE_LABELS),
        classification=CLASSIFICATION_DEFAULT,
    )


def process_assets(
    assets: dict[str, Asset],
    rng: random.Random | None = None,
) -> list[Detection]:
    """Roll detection for each asset; return a Detection for each one that passes."""
    _rng = rng or random.Random()
    detections: list[Detection] = []
    for asset in assets.values():
        if roll_detection(asset, _rng):
            detections.append(build_detection(asset, _rng))
    return detections
