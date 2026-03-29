"""Pure geometric functions for geofencing and proximity alerts."""

import math

from detection.models import Asset, Zone

# ── Constants ─────────────────────────────────────────────────────────────────
EARTH_RADIUS_KM: float = 6371.0
DEG_TO_RAD: float = math.pi / 180.0


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in km between two WGS-84 coordinates."""
    dlat = (lat2 - lat1) * DEG_TO_RAD
    dlon = (lon2 - lon1) * DEG_TO_RAD
    lat1_r = lat1 * DEG_TO_RAD
    lat2_r = lat2 * DEG_TO_RAD
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    )
    return 2.0 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def point_in_box(lat: float, lon: float, zone: Zone) -> bool:
    """Return True if (lat, lon) falls within the zone's bounding box (inclusive)."""
    return zone.lat_min <= lat <= zone.lat_max and zone.lon_min <= lon <= zone.lon_max


def check_geofence(asset: Asset, zones: list[Zone]) -> list[Zone]:
    """Return all zones whose bounding box contains the asset's current position."""
    return [z for z in zones if point_in_box(asset.latitude, asset.longitude, z)]


def check_proximity(asset1: Asset, asset2: Asset, threshold_km: float) -> bool:
    """Return True if the two assets are within threshold_km of each other."""
    dist = haversine(
        asset1.latitude, asset1.longitude,
        asset2.latitude, asset2.longitude,
    )
    return dist <= threshold_km
