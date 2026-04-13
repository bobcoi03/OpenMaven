"""Tests for the Red AI faction controller — retreat, reinforce, cover, suppression."""

import pytest

from simulation.assets import AssetStatus, Position, SimAsset
from simulation.faction import Doctrine, Faction
from simulation.manager import SimulationManager
from simulation.red_ai import RedAI, RETREAT_HEALTH


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_mgr() -> SimulationManager:
    """Minimal manager with one blue and one red faction."""
    mgr = SimulationManager(tick_duration_s=1.0)
    mgr.add_faction(Faction(
        faction_id="blue", name="BLUFOR", side="blue",
        doctrine=Doctrine.DEFENSIVE, asset_ids=[],
    ))
    mgr.add_faction(Faction(
        faction_id="red", name="OPFOR", side="red",
        doctrine=Doctrine.AGGRESSIVE, asset_ids=[],
    ))
    return mgr


def _add_asset(mgr: SimulationManager, asset_id: str, faction: str,
               asset_type: str, lat: float = 34.0, lon: float = 40.0,
               health: float = 1.0) -> SimAsset:
    a = SimAsset(
        asset_id=asset_id, callsign=asset_id.upper(),
        asset_type=asset_type, faction_id=faction,
        position=Position(latitude=lat, longitude=lon),
        speed_kmh=60, max_speed_kmh=60,
    )
    a.health = health
    if health <= 0:
        a.status = AssetStatus.DESTROYED
    elif health < 0.5:
        a.status = AssetStatus.DAMAGED
    mgr.add_asset(a)
    mgr.factions[faction].asset_ids.append(asset_id)
    return a


# ── _nearest_fob ──────────────────────────────────────────────────────────────


class TestNearestFob:
    def test_finds_fob_for_faction(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", lat=34.0, lon=40.0)
        fob = _add_asset(mgr, "fob1", "red", "Forward Operating Base", lat=34.5, lon=40.0)

        ai = RedAI()
        result = ai._nearest_fob(tank, "red", mgr)
        assert result is not None
        assert result.asset_id == "fob1"

    def test_returns_none_when_no_fob(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT")

        ai = RedAI()
        assert ai._nearest_fob(tank, "red", mgr) is None

    def test_ignores_enemy_fobs(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", lat=34.0, lon=40.0)
        # Blue FOB — should NOT be selected for red retreat
        _add_asset(mgr, "fob_blue", "blue", "Forward Operating Base", lat=34.1, lon=40.0)

        ai = RedAI()
        assert ai._nearest_fob(tank, "red", mgr) is None

    def test_picks_nearest_of_two(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", lat=34.0, lon=40.0)
        far_fob = _add_asset(mgr, "fob_far", "red", "Forward Operating Base", lat=37.0, lon=40.0)
        near_fob = _add_asset(mgr, "fob_near", "red", "Forward Operating Base", lat=34.1, lon=40.0)

        ai = RedAI()
        result = ai._nearest_fob(tank, "red", mgr)
        assert result.asset_id == "fob_near"


# ── _cover_multiplier ─────────────────────────────────────────────────────────


class TestCoverMultiplier:
    def test_no_cover_returns_one(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", lat=34.0, lon=40.0)

        ai = RedAI()
        assert ai._cover_multiplier(tank, mgr) == pytest.approx(1.0)

    def test_light_structure_nearby_reduces_damage(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", lat=34.0, lon=40.0)
        # Field Hospital is a cover structure type; place it within 1km
        _add_asset(mgr, "hosp", "red", "Field Hospital", lat=34.005, lon=40.0)

        ai = RedAI()
        mult = ai._cover_multiplier(tank, mgr)
        assert mult < 1.0

    def test_structure_beyond_radius_gives_no_cover(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", lat=34.0, lon=40.0)
        # Place a structure 50km away — well beyond COVER_RADIUS_KM (1km)
        _add_asset(mgr, "hosp", "red", "Field Hospital", lat=34.5, lon=40.0)

        ai = RedAI()
        assert ai._cover_multiplier(tank, mgr) == pytest.approx(1.0)


# ── _get_shooters ─────────────────────────────────────────────────────────────


class TestGetShooters:
    def test_excludes_suppressed_assets(self):
        mgr = _make_mgr()
        # T-72 is in ASSET_WEAPONS, so it qualifies as a shooter unless suppressed
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT")
        tank.suppress(mgr.tick + 10)  # suppressed until tick 10

        ai = RedAI()
        shooters = ai._get_shooters("red", mgr)
        assert "t1" not in [s.asset_id for s in shooters]

    def test_excludes_rtb_assets(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT")
        tank.status = AssetStatus.RTB

        ai = RedAI()
        shooters = ai._get_shooters("red", mgr)
        assert "t1" not in [s.asset_id for s in shooters]

    def test_includes_healthy_unsuppressed_asset(self):
        mgr = _make_mgr()
        _add_asset(mgr, "t1", "red", "T-72A MBT")  # healthy, not suppressed

        ai = RedAI()
        shooters = ai._get_shooters("red", mgr)
        assert any(s.asset_id == "t1" for s in shooters)


# ── _run_retreats ─────────────────────────────────────────────────────────────


class TestRunRetreats:
    def test_damaged_asset_issues_rtb_order(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", health=0.20)
        fob = _add_asset(mgr, "fob1", "red", "Forward Operating Base", lat=34.5)

        from simulation.red_ai import RedAIResult
        ai = RedAI()
        result = RedAIResult()
        ai._run_retreats("red", mgr, result)

        assert tank.status == AssetStatus.RTB
        assert len(result.alerts) == 1
        assert "RETREAT" in result.alerts[0]

    def test_healthy_asset_does_not_retreat(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", health=0.90)
        _add_asset(mgr, "fob1", "red", "Forward Operating Base", lat=34.5)

        from simulation.red_ai import RedAIResult
        ai = RedAI()
        result = RedAIResult()
        ai._run_retreats("red", mgr, result)

        assert tank.status != AssetStatus.RTB
        assert len(result.alerts) == 0

    def test_cooldown_prevents_repeat_retreat(self):
        mgr = _make_mgr()
        tank = _add_asset(mgr, "t1", "red", "T-72A MBT", health=0.20)
        _add_asset(mgr, "fob1", "red", "Forward Operating Base", lat=34.5)

        from simulation.red_ai import RedAIResult
        ai = RedAI()

        # First call — retreat issued
        r1 = RedAIResult()
        ai._run_retreats("red", mgr, r1)
        assert len(r1.alerts) == 1

        # Second call at same tick — cooldown prevents re-issue
        tank.status = AssetStatus.DAMAGED  # reset status so health check passes again
        r2 = RedAIResult()
        ai._run_retreats("red", mgr, r2)
        assert len(r2.alerts) == 0
