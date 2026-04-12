"""Tests for SIGINT intercept computation."""

import random
from unittest.mock import MagicMock

import pytest

from simulation.assets import AssetStatus, Position, SimAsset
from simulation.faction import Doctrine, Faction
from simulation.sigint import (
    SigintIntercept,
    _frequency_band,
    _signal_type,
    _threat_level,
    compute_sigint_intercepts,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _ew_asset(lat: float = 0.0, lon: float = 0.0, asset_id: str = "blue-jammer-01") -> SimAsset:
    return SimAsset(
        asset_id=asset_id,
        callsign="JAMMER-01",
        asset_type="EW Radar Vehicle",
        faction_id="blue",
        position=Position(latitude=lat, longitude=lon),
    )


def _enemy_asset(
    asset_id: str = "red-t72-01",
    callsign: str = "HOSTILE-T72-01",
    asset_type: str = "T-72A MBT",
    lat: float = 0.0,
    lon: float = 0.0,
    faction_id: str = "red",
) -> SimAsset:
    return SimAsset(
        asset_id=asset_id,
        callsign=callsign,
        asset_type=asset_type,
        faction_id=faction_id,
        position=Position(latitude=lat, longitude=lon),
    )


def _factions() -> dict:
    return {
        "blue": Faction(faction_id="blue", name="BLUFOR", side="blue", doctrine=Doctrine.DEFENSIVE),
        "red": Faction(faction_id="red", name="OPFOR", side="red", doctrine=Doctrine.AGGRESSIVE),
        "civilian": Faction(faction_id="civilian", name="Civilian", side="civilian", doctrine=Doctrine.DEFENSIVE),
    }


def _always_fire_rng() -> random.Random:
    """RNG whose random() always returns 0.0 — every emission roll passes."""
    rng = MagicMock(spec=random.Random)
    rng.random.return_value = 0.0
    return rng


def _never_fire_rng() -> random.Random:
    """RNG whose random() always returns 1.0 — no emission roll passes."""
    rng = MagicMock(spec=random.Random)
    rng.random.return_value = 1.0
    return rng


# ── _frequency_band ──────────────────────────────────────────────────────────


def test_frequency_band_ground_vehicle():
    assert _frequency_band("T-72A MBT") == "VHF"


def test_frequency_band_aircraft():
    assert _frequency_band("F-16C Fighting Falcon") == "UHF"


def test_frequency_band_helicopter():
    assert _frequency_band("AH-64 Apache") == "UHF"


def test_frequency_band_naval():
    assert _frequency_band("DDG-51 Arleigh Burke") == "SHF"


def test_frequency_band_ew():
    assert _frequency_band("EW Radar Vehicle") == "EHF"


def test_frequency_band_sam():
    assert _frequency_band("S-400 Triumf SAM") == "EHF"


# ── _signal_type ─────────────────────────────────────────────────────────────


def test_signal_type_standard_ground():
    assert _signal_type("M1 Abrams") == "voice"


def test_signal_type_ew_data_burst():
    assert _signal_type("EW Radar Vehicle") == "data_burst"


def test_signal_type_isr_awacs():
    assert _signal_type("E-3A AWACS") == "encrypted_voice"


def test_signal_type_advanced_russian():
    assert _signal_type("Su-57 Felon") == "encrypted_data"


def test_signal_type_advanced_russian_tank():
    assert _signal_type("T-14 Armata MBT") == "encrypted_data"


def test_signal_type_advanced_russian_sam():
    assert _signal_type("S-400 Triumf SAM") == "encrypted_data"


# ── _threat_level ────────────────────────────────────────────────────────────


def test_threat_level_high():
    assert _threat_level(0.8) == "HIGH"


def test_threat_level_high_boundary():
    assert _threat_level(0.71) == "HIGH"


def test_threat_level_med():
    assert _threat_level(0.5) == "MED"


def test_threat_level_med_lower_boundary():
    assert _threat_level(0.4) == "MED"


def test_threat_level_med_upper_boundary():
    assert _threat_level(0.7) == "MED"


def test_threat_level_low():
    assert _threat_level(0.2) == "LOW"


def test_threat_level_low_boundary():
    assert _threat_level(0.39) == "LOW"


# ── compute_sigint_intercepts ─────────────────────────────────────────────────


def test_no_ew_assets_returns_empty():
    assets = {"red-t72": _enemy_asset(lat=0.0, lon=0.0)}
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_no_enemies_returns_empty():
    assets = {"blue-jammer": _ew_asset()}
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_enemy_within_range_generates_intercept():
    # lon=0.5 ≈ 55 km from EW at (0,0) — within EW_SIGINT_RANGE_KM=80
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0, asset_id="blue-jammer"),
        "red-t72": _enemy_asset(asset_id="red-t72", lat=0.0, lon=0.5),
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=5)
    assert len(result) == 1
    intercept = result[0]
    assert isinstance(intercept, SigintIntercept)
    assert intercept.tick == 5
    assert intercept.emitter_asset_id == "red-t72"
    assert intercept.emitter_callsign == "HOSTILE-T72-01"
    assert intercept.intercepted_by_id == "blue-jammer"
    assert intercept.intercepted_by_callsign == "JAMMER-01"
    assert intercept.lat == pytest.approx(0.0)
    assert intercept.lon == pytest.approx(0.5)
    assert 0.0 < intercept.confidence < 1.0


def test_enemy_outside_range_generates_no_intercept():
    # lat=1.0 ≈ 111 km from EW at (0,0) — outside EW_SIGINT_RANGE_KM=80
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "red-t72": _enemy_asset(lat=1.0, lon=0.0),
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_civilian_within_range_not_intercepted():
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "civ-bus": _enemy_asset(faction_id="civilian", lat=0.0, lon=0.1),
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_blue_asset_within_range_not_intercepted():
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "blue-other": _enemy_asset(asset_id="blue-other", faction_id="blue", lat=0.0, lon=0.1),
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_destroyed_enemy_not_intercepted():
    enemy = _enemy_asset(lat=0.0, lon=0.1)
    enemy.status = AssetStatus.DESTROYED
    assets = {"blue-jammer": _ew_asset(), "red-t72": enemy}
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_emission_roll_failure_suppresses_intercept():
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "red-t72": _enemy_asset(lat=0.0, lon=0.1),
    }
    result = compute_sigint_intercepts(assets, _factions(), _never_fire_rng(), tick=1)
    assert result == []


def test_confidence_scales_with_proximity():
    """Closer asset → higher confidence than farther asset."""
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "red-near": _enemy_asset(asset_id="red-near", lat=0.0, lon=0.1),   # ~11 km
        "red-far": _enemy_asset(asset_id="red-far", lat=0.0, lon=0.5),    # ~55 km
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert len(result) == 2
    by_id = {r.emitter_asset_id: r for r in result}
    assert by_id["red-near"].confidence > by_id["red-far"].confidence


def test_intercept_id_is_unique_across_calls():
    assets = {
        "blue-jammer": _ew_asset(),
        "red-t72": _enemy_asset(lat=0.0, lon=0.1),
    }
    r1 = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    r2 = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=2)
    assert r1[0].intercept_id != r2[0].intercept_id


def test_aggressive_faction_emits_more_often():
    """AGGRESSIVE doctrine (p=0.20) should fire more than DEFENSIVE (p=0.15) over many trials."""
    assets_aggressive = {
        "blue-jammer": _ew_asset(),
        "red-t72": _enemy_asset(lat=0.0, lon=0.1, faction_id="red"),
    }
    factions_aggressive = {
        "blue": Faction(faction_id="blue", name="BLUFOR", side="blue", doctrine=Doctrine.DEFENSIVE),
        "red": Faction(faction_id="red", name="OPFOR", side="red", doctrine=Doctrine.AGGRESSIVE),
    }

    assets_defensive = {
        "blue-jammer": _ew_asset(),
        "green-t72": _enemy_asset(asset_id="green-t72", callsign="PARTNER-T72", lat=0.0, lon=0.1, faction_id="green"),
    }
    factions_defensive = {
        "blue": Faction(faction_id="blue", name="BLUFOR", side="blue", doctrine=Doctrine.DEFENSIVE),
        "green": Faction(faction_id="green", name="Partner", side="red", doctrine=Doctrine.DEFENSIVE),
    }

    # Same seed for both runs for fairness
    rng_a = random.Random(42)
    rng_d = random.Random(42)

    count_aggressive = sum(
        len(compute_sigint_intercepts(assets_aggressive, factions_aggressive, rng_a, tick=i))
        for i in range(200)
    )
    count_defensive = sum(
        len(compute_sigint_intercepts(assets_defensive, factions_defensive, rng_d, tick=i))
        for i in range(200)
    )

    # AGGRESSIVE (p=0.20) must fire more than DEFENSIVE (p=0.15) over 200 trials
    assert count_aggressive > count_defensive
