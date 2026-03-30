"""Tests for alert_rules — pure geometric and proximity functions."""

import pytest

from detection.models import Asset, Zone
from detection.alert_rules import (
    EARTH_RADIUS_KM,
    check_geofence,
    check_proximity,
    haversine,
    point_in_box,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def make_asset(lat: float, lon: float) -> Asset:
    """Return a minimal Asset positioned at the given coordinates."""
    return Asset(
        asset_id="A001",
        asset_type="Tank",
        asset_class="Military",
        latitude=lat,
        longitude=lon,
    )


def make_zone(
    name: str = "ZONE_ALPHA",
    lat_min: float = 48.0,
    lat_max: float = 49.0,
    lon_min: float = 2.0,
    lon_max: float = 3.0,
) -> Zone:
    """Return a Zone with the given bounding box."""
    return Zone(name=name, lat_min=lat_min, lat_max=lat_max, lon_min=lon_min, lon_max=lon_max)


# ── haversine ─────────────────────────────────────────────────────────────────


def test_haversine_same_point_returns_zero() -> None:
    """Distance from a point to itself must be zero."""
    assert haversine(48.8566, 2.3522, 48.8566, 2.3522) == pytest.approx(0.0, abs=1e-6)


def test_haversine_london_to_paris_is_approx_340km() -> None:
    """London → Paris great-circle distance must be within 330–350 km."""
    dist = haversine(51.5074, -0.1278, 48.8566, 2.3522)
    assert 330.0 < dist < 350.0


def test_haversine_is_symmetric() -> None:
    """d(A, B) must equal d(B, A) to within floating-point precision."""
    d1 = haversine(51.5, -0.1, 48.8, 2.3)
    d2 = haversine(48.8, 2.3, 51.5, -0.1)
    assert d1 == pytest.approx(d2, rel=1e-6)


def test_haversine_uses_correct_earth_radius() -> None:
    """EARTH_RADIUS_KM must be the standard mean radius (6371 km)."""
    assert EARTH_RADIUS_KM == pytest.approx(6371.0, rel=1e-3)


def test_haversine_returns_positive_for_distinct_points() -> None:
    """Any two distinct points must yield a strictly positive distance."""
    assert haversine(0.0, 0.0, 1.0, 1.0) > 0.0


# ── point_in_box ──────────────────────────────────────────────────────────────


def test_point_in_box_interior_returns_true() -> None:
    """A coordinate clearly inside the bounding box must return True."""
    assert point_in_box(48.5, 2.5, make_zone()) is True


def test_point_in_box_exterior_returns_false() -> None:
    """A coordinate outside the bounding box must return False."""
    assert point_in_box(55.0, 10.0, make_zone()) is False


def test_point_in_box_on_lat_min_boundary_returns_true() -> None:
    """Coordinate on the minimum latitude boundary must be included (inclusive)."""
    zone = make_zone()
    assert point_in_box(zone.lat_min, 2.5, zone) is True


def test_point_in_box_on_lon_max_boundary_returns_true() -> None:
    """Coordinate on the maximum longitude boundary must be included (inclusive)."""
    zone = make_zone()
    assert point_in_box(48.5, zone.lon_max, zone) is True


def test_point_in_box_just_outside_lat_max_returns_false() -> None:
    """A coordinate just above lat_max must return False."""
    zone = make_zone()
    assert point_in_box(zone.lat_max + 0.001, 2.5, zone) is False


# ── check_geofence ────────────────────────────────────────────────────────────


def test_check_geofence_returns_matching_zone() -> None:
    """An asset inside ZONE_ALPHA must trigger only ZONE_ALPHA."""
    asset = make_asset(lat=48.5, lon=2.5)
    alpha = make_zone("ZONE_ALPHA")
    beta = make_zone("ZONE_BETA", lat_min=50.0, lat_max=51.0, lon_min=4.0, lon_max=5.0)
    result = check_geofence(asset, [alpha, beta])
    assert len(result) == 1
    assert result[0].name == "ZONE_ALPHA"


def test_check_geofence_returns_empty_when_outside_all_zones() -> None:
    """An asset outside all zones must produce an empty list."""
    asset = make_asset(lat=0.0, lon=0.0)
    zones = [make_zone("A"), make_zone("B", 50.0, 51.0, 4.0, 5.0)]
    assert check_geofence(asset, zones) == []


def test_check_geofence_returns_all_overlapping_zones() -> None:
    """An asset inside multiple zones must trigger all of them."""
    asset = make_asset(lat=48.5, lon=2.5)
    alpha = make_zone("ZONE_ALPHA")
    overlap = make_zone("ZONE_OVERLAP")  # identical bounds
    result = check_geofence(asset, [alpha, overlap])
    assert len(result) == 2


def test_check_geofence_empty_zone_list_returns_empty() -> None:
    """check_geofence with no zones must return an empty list."""
    assert check_geofence(make_asset(lat=48.5, lon=2.5), []) == []


# ── check_proximity ───────────────────────────────────────────────────────────


def test_check_proximity_returns_true_for_nearby_assets() -> None:
    """Assets ~400 m apart must be within a 1 km threshold."""
    a1 = make_asset(lat=48.8566, lon=2.3522)
    a2 = make_asset(lat=48.8600, lon=2.3540)
    assert check_proximity(a1, a2, threshold_km=1.0) is True


def test_check_proximity_returns_false_for_distant_assets() -> None:
    """London and Paris (~340 km apart) must not be within a 100 km threshold."""
    london = make_asset(lat=51.5074, lon=-0.1278)
    paris = make_asset(lat=48.8566, lon=2.3522)
    assert check_proximity(london, paris, threshold_km=100.0) is False


def test_check_proximity_same_position_is_always_within_zero_threshold() -> None:
    """An asset compared to itself at threshold 0 km must return True."""
    a = make_asset(lat=48.8566, lon=2.3522)
    assert check_proximity(a, a, threshold_km=0.0) is True
