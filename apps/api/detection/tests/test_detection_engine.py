"""Tests for detection_engine — RED phase first, then implementations make them green."""

import random
from uuid import UUID

import pytest

from detection.models import Asset, Detection
from detection.detection_engine import (
    CONFIDENCE_MAX,
    CONFIDENCE_MIN,
    DETECTION_RATE_DEFAULT,
    DETECTION_RATE_LOGISTICS,
    DETECTION_RATE_MILITARY,
    SOURCE_LABELS,
    build_detection,
    get_base_confidence,
    get_detection_rate,
    process_assets,
    roll_detection,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def make_asset(
    asset_id: str = "A001",
    asset_type: str = "Tank",
    asset_class: str = "Military",
    lat: float = 48.8566,
    lon: float = 2.3522,
) -> Asset:
    """Return a minimal Asset for testing."""
    return Asset(
        asset_id=asset_id,
        asset_type=asset_type,
        asset_class=asset_class,
        latitude=lat,
        longitude=lon,
    )


class _AlwaysDetectRng(random.Random):
    """Stubbed RNG whose random() always returns 0.0 (guarantees detection roll)."""

    def random(self) -> float:  # type: ignore[override]
        return 0.0

    def uniform(self, a: float, b: float) -> float:  # type: ignore[override]
        return 0.0

    def choice(self, seq):  # type: ignore[override]
        return seq[0]


class _NeverDetectRng(random.Random):
    """Stubbed RNG whose random() always returns 1.0 (guarantees detection miss)."""

    def random(self) -> float:  # type: ignore[override]
        return 1.0


# ── Detection Rate Tests ──────────────────────────────────────────────────────


def test_military_class_returns_military_rate() -> None:
    """Military assets must map to DETECTION_RATE_MILITARY."""
    asset = make_asset(asset_class="Military")
    assert get_detection_rate(asset) == DETECTION_RATE_MILITARY


def test_logistics_class_returns_logistics_rate() -> None:
    """Logistics assets must map to DETECTION_RATE_LOGISTICS."""
    asset = make_asset(asset_class="Logistics")
    assert get_detection_rate(asset) == DETECTION_RATE_LOGISTICS


def test_military_rate_higher_than_logistics_rate() -> None:
    """Military detection probability must exceed logistics probability."""
    assert DETECTION_RATE_MILITARY > DETECTION_RATE_LOGISTICS


def test_unknown_class_falls_back_to_default_rate() -> None:
    """Unrecognised asset_class must use DETECTION_RATE_DEFAULT."""
    asset = make_asset(asset_class="Civilian")
    assert get_detection_rate(asset) == DETECTION_RATE_DEFAULT


# ── Confidence Tests ──────────────────────────────────────────────────────────


def test_tank_has_higher_confidence_than_infantry() -> None:
    """Tanks are harder to miss — their base confidence exceeds infantry."""
    assert get_base_confidence("Tank") > get_base_confidence("Infantry")


def test_build_detection_confidence_within_bounds() -> None:
    """Confidence must always stay within [CONFIDENCE_MIN, CONFIDENCE_MAX]."""
    rng = random.Random(42)
    detection = build_detection(make_asset(), rng)
    assert CONFIDENCE_MIN <= detection.confidence <= CONFIDENCE_MAX


def test_build_detection_maps_asset_id_and_type() -> None:
    """Detection must reflect the source asset's asset_id and asset_type."""
    rng = random.Random(42)
    asset = make_asset(asset_id="UNIT-99", asset_type="Infantry")
    detection = build_detection(asset, rng)
    assert detection.asset_id == "UNIT-99"
    assert detection.asset_type == "Infantry"


def test_build_detection_maps_coordinates() -> None:
    """Detection lat/lon must match the asset's latitude/longitude."""
    rng = random.Random(42)
    asset = make_asset(lat=51.5074, lon=-0.1278)
    detection = build_detection(asset, rng)
    assert detection.lat == 51.5074
    assert detection.lon == -0.1278


def test_build_detection_has_valid_uuid() -> None:
    """detection_id must be a proper UUID instance."""
    rng = random.Random(42)
    detection = build_detection(make_asset(), rng)
    assert isinstance(detection.detection_id, UUID)


def test_build_detection_has_aware_utc_timestamp() -> None:
    """timestamp must be timezone-aware (UTC)."""
    rng = random.Random(42)
    detection = build_detection(make_asset(), rng)
    assert detection.timestamp.tzinfo is not None


def test_build_detection_source_label_is_known() -> None:
    """source_label must be drawn from the canonical SOURCE_LABELS list."""
    rng = random.Random(42)
    detection = build_detection(make_asset(), rng)
    assert detection.source_label in SOURCE_LABELS


def test_build_detection_has_mgrs_grid_ref() -> None:
    """grid_ref must be a non-empty MGRS string."""
    rng = random.Random(42)
    detection = build_detection(make_asset(), rng)
    assert isinstance(detection.grid_ref, str)
    assert len(detection.grid_ref) > 0


# ── process_assets Tests ──────────────────────────────────────────────────────


def test_process_assets_detects_asset_when_roll_guaranteed() -> None:
    """When roll always passes, every asset must appear in the result."""
    result = process_assets({"A001": make_asset()}, rng=_AlwaysDetectRng())
    assert len(result) == 1
    assert result[0].asset_id == "A001"


def test_process_assets_returns_empty_when_roll_always_fails() -> None:
    """When roll always misses, no detections should be returned."""
    result = process_assets({"A001": make_asset()}, rng=_NeverDetectRng())
    assert result == []


def test_process_assets_returns_list_of_detection_objects() -> None:
    """Every element in the return value must be a Detection instance."""
    assets = {f"A{i:03d}": make_asset(asset_id=f"A{i:03d}") for i in range(20)}
    result = process_assets(assets, rng=_AlwaysDetectRng())
    assert all(isinstance(d, Detection) for d in result)


def test_process_assets_handles_empty_input() -> None:
    """An empty asset dict must produce an empty detection list."""
    assert process_assets({}) == []
