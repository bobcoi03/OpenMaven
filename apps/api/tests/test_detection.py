"""Tests for simulation.detection — fog of war detection model."""

import math

import pytest

from simulation.detection import (
    DEFAULT_SENSOR_RANGE,
    DEFAULT_SIGNATURE,
    SENSOR_RANGES,
    SIGNATURE,
    SensorReading,
    compute_detections,
    detection_probability,
    haversine,
    sensor_range_for,
    signature_for,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


class FakePosition:
    def __init__(self, lat: float, lon: float) -> None:
        self.latitude = lat
        self.longitude = lon


class FakeAsset:
    def __init__(
        self,
        lat: float = 35.0,
        lon: float = 40.0,
        sensor_type: str | None = None,
        asset_type: str = "T-72A MBT",
    ) -> None:
        self.position = FakePosition(lat, lon)
        self.sensor_type = sensor_type
        self.asset_type = asset_type


# ── haversine ────────────────────────────────────────────────────────────────


def test_haversine_same_point() -> None:
    assert haversine(35.0, 40.0, 35.0, 40.0) == pytest.approx(0.0, abs=1e-6)


def test_haversine_known_distance() -> None:
    """London to Paris is approximately 340 km."""
    dist = haversine(51.5074, -0.1278, 48.8566, 2.3522)
    assert 330.0 < dist < 350.0


def test_haversine_symmetric() -> None:
    d1 = haversine(51.5, -0.1, 48.8, 2.3)
    d2 = haversine(48.8, 2.3, 51.5, -0.1)
    assert d1 == pytest.approx(d2, rel=1e-9)


# ── detection_probability ────────────────────────────────────────────────────


def test_probability_at_zero_distance() -> None:
    """At the sensor's location, probability should equal the signature."""
    assert detection_probability(0.0, 100.0, 0.9) == pytest.approx(0.9)


def test_probability_at_half_range() -> None:
    """At half range: (1 - 0.25) * sig = 0.75 * sig."""
    assert detection_probability(50.0, 100.0, 1.0) == pytest.approx(0.75)


def test_probability_at_full_range() -> None:
    """At exactly sensor range, probability is 0."""
    assert detection_probability(100.0, 100.0, 0.9) == pytest.approx(0.0)


def test_probability_beyond_range() -> None:
    """Beyond sensor range, probability is 0."""
    assert detection_probability(150.0, 100.0, 0.9) == pytest.approx(0.0)


def test_probability_zero_range_sensor() -> None:
    """A sensor with 0 range detects nothing."""
    assert detection_probability(10.0, 0.0, 0.9) == pytest.approx(0.0)


def test_probability_zero_signature() -> None:
    """A perfectly stealthy target is never detected."""
    assert detection_probability(10.0, 100.0, 0.0) == pytest.approx(0.0)


def test_probability_scales_with_signature() -> None:
    """Higher signature means higher detection probability."""
    p_low = detection_probability(30.0, 100.0, 0.2)
    p_high = detection_probability(30.0, 100.0, 0.9)
    assert p_high > p_low


# ── sensor_range_for ─────────────────────────────────────────────────────────


def test_known_sensor_range() -> None:
    assert sensor_range_for("AN/APY-2 Radar") == 45.0


def test_none_sensor_returns_default() -> None:
    assert sensor_range_for(None) == DEFAULT_SENSOR_RANGE


def test_unknown_sensor_returns_default() -> None:
    assert sensor_range_for("made-up-sensor") == DEFAULT_SENSOR_RANGE


# ── signature_for ────────────────────────────────────────────────────────────


def test_known_signature() -> None:
    assert signature_for("M1 Abrams") == 0.9


def test_stealth_jet_low_signature() -> None:
    assert signature_for("F-35B Lightning II") == 0.1


def test_unknown_type_returns_default() -> None:
    assert signature_for("Unknown Widget") == DEFAULT_SIGNATURE


# ── compute_detections ───────────────────────────────────────────────────────


def test_detects_target_in_range() -> None:
    """A sensor within range of a target should produce a detection."""
    sensors = {"s1": FakeAsset(lat=35.0, lon=40.0, sensor_type="AN/APY-2 Radar")}
    targets = {"t1": FakeAsset(lat=35.1, lon=40.0, asset_type="T-72A MBT")}
    result = compute_detections(sensors, targets)
    assert len(result) == 1
    assert result[0].target_id == "t1"
    assert result[0].sensor_asset_id == "s1"
    assert result[0].confidence > 0.0


def test_no_detection_beyond_range() -> None:
    """A target far beyond sensor range should not be detected."""
    sensors = {"s1": FakeAsset(lat=35.0, lon=40.0, sensor_type="AN/APG-78 Longbow")}
    # Longbow range is 30 km; ~500 km away
    targets = {"t1": FakeAsset(lat=40.0, lon=40.0, asset_type="T-72A MBT")}
    result = compute_detections(sensors, targets)
    assert result == []


def test_picks_best_sensor() -> None:
    """When two sensors can see a target, the one with higher confidence wins."""
    close_sensor = FakeAsset(lat=35.005, lon=40.0, sensor_type="AN/APG-78 Longbow")
    far_sensor = FakeAsset(lat=34.0, lon=40.0, sensor_type="AN/APY-2 Radar")
    sensors = {"close": close_sensor, "far": far_sensor}
    targets = {"t1": FakeAsset(lat=35.0, lon=40.0, asset_type="T-72A MBT")}
    result = compute_detections(sensors, targets)
    assert len(result) == 1
    # The close Longbow at ~0.55 km (well within 8km range) should beat the far AWACS at ~111 km
    assert result[0].sensor_asset_id == "close"


def test_empty_sensors_returns_empty() -> None:
    targets = {"t1": FakeAsset(lat=35.0, lon=40.0)}
    assert compute_detections({}, targets) == []


def test_empty_targets_returns_empty() -> None:
    sensors = {"s1": FakeAsset(lat=35.0, lon=40.0, sensor_type="AN/APY-2 Radar")}
    assert compute_detections(sensors, {}) == []


def test_sensor_without_range_uses_default() -> None:
    """A sensor_type=None asset uses DEFAULT_SENSOR_RANGE (20 km)."""
    sensors = {"s1": FakeAsset(lat=35.0, lon=40.0, sensor_type=None)}
    # ~11 km away, within default 20 km range
    targets = {"t1": FakeAsset(lat=35.1, lon=40.0, asset_type="M1 Abrams")}
    result = compute_detections(sensors, targets)
    assert len(result) == 1


def test_stealth_target_harder_to_detect() -> None:
    """F-35 (sig=0.1) should have lower confidence than T-72 (sig=0.9) at same distance."""
    sensors = {"s1": FakeAsset(lat=35.0, lon=40.0, sensor_type="EISS / MP-RTIP Radar")}
    target_tank = {"t1": FakeAsset(lat=35.5, lon=40.0, asset_type="T-72A MBT")}
    target_stealth = {"t1": FakeAsset(lat=35.5, lon=40.0, asset_type="F-35B Lightning II")}
    [tank_reading] = compute_detections(sensors, target_tank)
    [stealth_reading] = compute_detections(sensors, target_stealth)
    assert tank_reading.confidence > stealth_reading.confidence


def test_multiple_targets_detected() -> None:
    """Multiple targets in range should each produce a reading."""
    sensors = {"s1": FakeAsset(lat=35.0, lon=40.0, sensor_type="EISS / MP-RTIP Radar")}
    targets = {
        "t1": FakeAsset(lat=35.1, lon=40.0, asset_type="T-72A MBT"),
        "t2": FakeAsset(lat=35.2, lon=40.0, asset_type="BMP-2 IFV"),
        "t3": FakeAsset(lat=35.3, lon=40.0, asset_type="Infantry Squad"),
    }
    result = compute_detections(sensors, targets)
    assert len(result) == 3
    detected_ids = {r.target_id for r in result}
    assert detected_ids == {"t1", "t2", "t3"}
