"""Fog of war detection model.

Each tick the simulation checks which enemy assets are detectable
by friendly sensors.  Detection probability follows an inverse-square
law modulated by the target's radar/visual signature.

    p = max(0, 1 - (distance / sensor_range)^2) * signature

All functions are pure — no I/O, no mutation.
"""

import math
from dataclasses import dataclass


# ── Sensor ranges by sensor_type string ──────────────────────────────────────
# These are effective detection radii in km for each named sensor.

SENSOR_RANGES: dict[str, float] = {
    # Drone EO/IR — narrow-FOV cameras
    "FLIR SS380-HD": 8.0,
    "MTS-B EO/IR": 10.0,
    # High-altitude ISR — GMTI standoff (real ~200km, scaled for theatre)
    "EISS / MP-RTIP Radar": 60.0,
    # Fighter radars — look-down SAR/GMTI secondary mode
    "AN/APG-68 Radar": 20.0,
    "AN/APG-81 AESA": 30.0,
    # AWACS — air-search radar
    "AN/APY-2 Radar": 45.0,
    # Gunship — fire-control/targeting radar
    "AN/APQ-180 Radar": 12.0,
    # Attack helo — millimeter-wave, close-in targeting
    "AN/APG-78 Longbow": 5.0,
    # Naval — radar-horizon limited
    "AN/SPY-1D Radar": 18.0,
    "BQQ-10 Sonar": 12.0,
    "AN/SPS-52 Radar": 18.0,
    # Air defense — designed for air/missile targets
    "AN/MPQ-53 Radar": 15.0,
    "EL/M-2084 Radar": 15.0,
    # EW — signals intercept range
    "AESA Jammer Array": 20.0,
    # OPFOR sensors
    "1A40 Fire Control": 5.0,
    "91N6E Radar": 20.0,
    "Kalina FCS": 5.0,
    "Sh042 AESA": 8.0,
    "mmW Radar": 10.0,
    "N025E AESA": 10.0,
    "Irbis-E PESA": 25.0,
    "Leninets B004": 22.0,
    "Sh121 AESA": 25.0,
    "1RS2-1E Array": 20.0,
    "GLONASS/INS": 0.0,
    "GPS/INS": 0.0,
}

# ── Signature values by asset type ───────────────────────────────────────────
# How visible/detectable each asset type is.  1.0 = easily detected, 0.0 = stealth.

SIGNATURE: dict[str, float] = {
    # Ground — large heat/radar signatures
    "M1 Abrams": 0.9,
    "T-72A MBT": 0.9,
    "T-90M Proryv MBT": 0.9,
    "T-14 Armata MBT": 0.7,
    "M2 Bradley IFV": 0.8,
    "BMP-2 IFV": 0.8,
    "BMP-3 IFV": 0.8,
    "BTR-82A APC": 0.75,
    "HMMWV Transport": 0.6,
    "M977 HEMTT Supply Truck": 0.65,
    "Technical (Armed Pickup)": 0.5,
    "Toyota Hilux Technical (HMG)": 0.5,
    "Infantry Squad": 0.2,
    "RPG-7 Team": 0.15,
    "M142 HIMARS": 0.7,
    "M777 Howitzer": 0.6,
    "M224 Mortar": 0.3,
    "Captured T-55": 0.85,
    "ZU-23-2 AA Gun": 0.4,
    # Air — varies by stealth
    "MQ-9 Reaper": 0.4,
    "RQ-4 Global Hawk": 0.5,
    "F-16C Fighting Falcon": 0.7,
    "F-35B Lightning II": 0.1,
    "AC-130 Hercules": 0.8,
    "E-3A AWACS": 0.9,
    "C-17 Globemaster III": 0.85,
    "AH-64 Apache": 0.5,
    "CH-47 Chinook": 0.7,
    "Hovering Recon Drone": 0.3,
    "Su-35S Flanker-E": 0.7,
    "Su-34 Fullback": 0.75,
    "Su-57 Felon": 0.15,
    "Ka-52 Alligator": 0.55,
    "Mi-28NM Night Hunter": 0.55,
    "Shahed-136 Loitering Munition": 0.25,
    # Naval
    "DDG-51 Arleigh Burke": 1.0,
    "HMS Queen Elizabeth CVN": 1.0,
    "USS Wasp LHD-1": 0.95,
    "USS Seawolf SSN-21": 0.05,
    "Patrol Boat": 0.6,
    # Air defense
    "S-400 Triumf SAM": 0.7,
    "MIM-104 Patriot": 0.7,
    "Iron Dome Defense System": 0.6,
    "Pantsir-S1": 0.6,
    "Iskander-M": 0.65,
    # Infrastructure
    "Forward Operating Base": 0.95,
    "Oil Pump Jack": 0.8,
    "Field Hospital": 0.7,
    "EW Radar Vehicle": 0.5,
    # Civilian
    "Civilian Bus": 0.6,
    "Civilian Sedan": 0.5,
}

DEFAULT_SIGNATURE: float = 0.5
DEFAULT_SENSOR_RANGE: float = 20.0

EARTH_RADIUS_KM: float = 6371.0


# ── Core data types ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SensorReading:
    """A single sensor's view of a target this tick."""

    target_id: str
    confidence: float
    sensor_asset_id: str
    lat: float
    lon: float


# ── Pure functions ───────────────────────────────────────────────────────────


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two WGS-84 points."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2.0 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def detection_probability(
    distance_km: float,
    sensor_range_km: float,
    signature: float,
) -> float:
    """Return detection probability for a target at a given distance.

    Formula: max(0, 1 - (distance / range)^2) * signature
    Returns 0.0 if distance exceeds sensor range.
    """
    if sensor_range_km <= 0:
        return 0.0
    ratio = distance_km / sensor_range_km
    if ratio >= 1.0:
        return 0.0
    return (1.0 - ratio * ratio) * signature


def sensor_range_for(sensor_type: str | None) -> float:
    """Look up the detection range in km for a sensor type string."""
    if sensor_type is None:
        return DEFAULT_SENSOR_RANGE
    return SENSOR_RANGES.get(sensor_type, DEFAULT_SENSOR_RANGE)


def signature_for(asset_type: str) -> float:
    """Look up the radar/visual signature for an asset type."""
    return SIGNATURE.get(asset_type, DEFAULT_SIGNATURE)


def compute_detections(
    sensor_assets: dict[str, "SimAssetLike"],
    target_assets: dict[str, "SimAssetLike"],
) -> list[SensorReading]:
    """Run detection rolls for all sensor-target pairs.

    For each target, finds the best (highest confidence) detecting sensor.
    Returns one SensorReading per detected target.

    Args:
        sensor_assets: friendly assets that have sensors (keyed by asset_id).
        target_assets: enemy assets to try detecting (keyed by asset_id).

    Returns:
        List of SensorReading for targets that were detected.
    """
    detections: list[SensorReading] = []

    for target_id, target in target_assets.items():
        best_confidence = 0.0
        best_sensor_id = ""

        for sensor_id, sensor in sensor_assets.items():
            sr = sensor_range_for(sensor.sensor_type)
            if sr <= 0:
                continue

            dist = haversine(
                sensor.position.latitude,
                sensor.position.longitude,
                target.position.latitude,
                target.position.longitude,
            )
            sig = signature_for(target.asset_type)
            prob = detection_probability(dist, sr, sig)

            if prob > best_confidence:
                best_confidence = prob
                best_sensor_id = sensor_id

        if best_confidence > 0.0:
            detections.append(SensorReading(
                target_id=target_id,
                confidence=round(best_confidence, 4),
                sensor_asset_id=best_sensor_id,
                lat=target.position.latitude,
                lon=target.position.longitude,
            ))

    return detections


# Protocol-style type hint — any object with .position, .sensor_type, .asset_type
class SimAssetLike:
    """Structural type for assets passed to compute_detections.

    Not instantiated — exists only for documentation.  Any object with
    the required attributes (e.g. SimAsset) satisfies this interface.
    """

    position: "PositionLike"
    sensor_type: str | None
    asset_type: str


class PositionLike:
    """Structural type for position."""

    latitude: float
    longitude: float
