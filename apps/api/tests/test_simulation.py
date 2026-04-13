"""Tests for the simulation engine."""

import asyncio

import pytest

from simulation.assets import AssetStatus, Position, SimAsset
from simulation.events import EventQueue, EventType, Mutation
from simulation.faction import Doctrine, Faction, Leader, Resources
from simulation.manager import SimSpeed, SimulationManager
from simulation.profiles import (
    STRIKE_PROFILES,
    WEAPON_PROFILES,
    get_strike_profile,
    get_weapon_profile,
)
from simulation.rules import (
    DependencyLink,
    bearing_degrees,
    haversine_km,
    interpolate_position,
    resolve_strike,
    ticks_to_arrive,
)


# ── Profiles ─────────────────────────────────────────────────────────────────


class TestProfiles:
    def test_all_strike_profiles_have_valid_ranges(self):
        for name, profile in STRIKE_PROFILES.items():
            assert 0 <= profile.hardness <= 1, f"{name} hardness out of range"
            assert 0 <= profile.crew_survival <= 1, f"{name} crew_survival out of range"

    def test_all_weapon_profiles_have_valid_ranges(self):
        for name, profile in WEAPON_PROFILES.items():
            assert 0 <= profile.accuracy <= 1, f"{name} accuracy out of range"
            assert 0 <= profile.penetration <= 1, f"{name} penetration out of range"
            assert profile.blast_radius_m >= 0, f"{name} blast_radius negative"

    def test_get_strike_profile_known_type(self):
        profile = get_strike_profile("M1 Abrams")
        assert profile.hardness == 0.8  # armored_vehicle

    def test_get_strike_profile_unknown_defaults_to_soft_vehicle(self):
        profile = get_strike_profile("Unknown Widget")
        assert profile.hardness == 0.2  # soft_vehicle fallback

    def test_get_weapon_profile_known(self):
        weapon = get_weapon_profile("hellfire")
        assert weapon is not None
        assert weapon.accuracy == 0.85

    def test_get_weapon_profile_unknown_returns_none(self):
        assert get_weapon_profile("banana_launcher") is None


# ── Strike Resolution ────────────────────────────────────────────────────────


class TestStrikeResolution:
    def test_high_accuracy_weapon_usually_hits(self):
        weapon = WEAPON_PROFILES["cruise_missile"]  # 0.92 accuracy
        target = STRIKE_PROFILES["soft_vehicle"]  # 0.2 hardness
        hits = sum(1 for _ in range(100) if resolve_strike(weapon, target).hit)
        assert hits > 70  # statistically should be ~92

    def test_low_accuracy_weapon_misses_often(self):
        weapon = WEAPON_PROFILES["small_arms"]  # 0.30 accuracy
        target = STRIKE_PROFILES["armored_vehicle"]  # 0.8 hardness
        misses = sum(1 for _ in range(100) if not resolve_strike(weapon, target).hit)
        assert misses > 40

    def test_high_pen_vs_low_hardness_usually_destroys(self):
        weapon = WEAPON_PROFILES["javelin"]  # 0.95 pen
        target = STRIKE_PROFILES["soft_vehicle"]  # 0.2 hardness
        destroyed = sum(1 for _ in range(100) if resolve_strike(weapon, target).destroyed)
        assert destroyed > 50


# ── Movement / Geo ───────────────────────────────────────────────────────────


class TestMovement:
    def test_haversine_same_point_is_zero(self):
        assert haversine_km(34.0, 40.0, 34.0, 40.0) == 0.0

    def test_haversine_known_distance(self):
        # NYC to LA is roughly 3940 km
        dist = haversine_km(40.7128, -74.0060, 34.0522, -118.2437)
        assert 3900 < dist < 4000

    def test_bearing_north(self):
        bearing = bearing_degrees(0, 0, 1, 0)
        assert abs(bearing - 0) < 1

    def test_bearing_east(self):
        bearing = bearing_degrees(0, 0, 0, 1)
        assert abs(bearing - 90) < 1

    def test_interpolate_midpoint(self):
        lat, lon = interpolate_position(0, 0, 10, 10, 0.5)
        assert abs(lat - 5) < 0.01
        assert abs(lon - 5) < 0.01

    def test_interpolate_clamps_fraction(self):
        lat, lon = interpolate_position(0, 0, 10, 10, 1.5)
        assert abs(lat - 10) < 0.01  # clamped to 1.0

    def test_ticks_to_arrive_basic(self):
        # 100 km at 100 km/h = 1 hour = 3600s. At 10s ticks = 360 ticks
        ticks = ticks_to_arrive(100, 100, "open", 10.0)
        assert ticks == 360

    def test_ticks_to_arrive_zero_speed_returns_negative(self):
        assert ticks_to_arrive(0, 100) == -1

    def test_ticks_to_arrive_terrain_slows(self):
        open_ticks = ticks_to_arrive(100, 100, "open", 10.0)
        mountain_ticks = ticks_to_arrive(100, 100, "mountainous", 10.0)
        assert mountain_ticks > open_ticks


# ── Event Queue ──────────────────────────────────────────────────────────────


class TestEventQueue:
    def test_events_sorted_by_tick(self):
        q = EventQueue()
        q.create_and_schedule(EventType.STRIKE, "late", scheduled_tick=10)
        q.create_and_schedule(EventType.STRIKE, "early", scheduled_tick=2)
        q.create_and_schedule(EventType.STRIKE, "mid", scheduled_tick=5)

        events = q.pop_due_events(10)
        assert [e.description for e in events] == ["early", "mid", "late"]

    def test_pop_only_due_events(self):
        q = EventQueue()
        q.create_and_schedule(EventType.STRIKE, "now", scheduled_tick=3)
        q.create_and_schedule(EventType.STRIKE, "later", scheduled_tick=10)

        events = q.pop_due_events(5)
        assert len(events) == 1
        assert events[0].description == "now"
        assert q.pending_count == 1

    def test_peek_next_tick_empty(self):
        q = EventQueue()
        assert q.peek_next_tick() is None

    def test_peek_next_tick(self):
        q = EventQueue()
        q.create_and_schedule(EventType.ALERT, "alert", scheduled_tick=7)
        assert q.peek_next_tick() == 7

    def test_clear(self):
        q = EventQueue()
        q.create_and_schedule(EventType.STRIKE, "boom", scheduled_tick=1)
        q.clear()
        assert q.pending_count == 0


# ── Faction ──────────────────────────────────────────────────────────────────


class TestFaction:
    def _make_faction(self) -> Faction:
        return Faction(
            faction_id="red",
            name="OPFOR",
            side="red",
            doctrine=Doctrine.AGGRESSIVE,
            leadership=[
                Leader(leader_id="l1", name="General A", rank="General"),
                Leader(leader_id="l2", name="Colonel B", rank="Colonel"),
            ],
        )

    def test_current_leader(self):
        f = self._make_faction()
        assert f.current_leader().name == "General A"

    def test_kill_leader_promotes_next(self):
        f = self._make_faction()
        new = f.kill_leader("l1")
        assert new.name == "Colonel B"

    def test_kill_all_leaders_returns_none(self):
        f = self._make_faction()
        f.kill_leader("l1")
        f.kill_leader("l2")
        assert f.current_leader() is None

    def test_capability_recalculation(self):
        f = self._make_faction()
        f.recalculate_capability(alive_count=7, total_count=10)
        assert abs(f.capability - 0.7) < 0.001

    def test_morale_hit_clamps(self):
        f = self._make_faction()
        f.apply_morale_hit(1.5)
        assert f.morale == 0.0

    def test_retaliation_threshold(self):
        f = self._make_faction()
        f.capability = 0.6
        assert f.should_retaliate(initial_capability=1.0)  # lost 0.4 > 0.3

    def test_no_retaliation_below_threshold(self):
        f = self._make_faction()
        f.capability = 0.9
        assert not f.should_retaliate(initial_capability=1.0)  # lost 0.1 < 0.3

    def test_consume_resources(self):
        f = self._make_faction()
        f.consume_resources(fuel=0.3, ammo=0.5)
        assert abs(f.resources.fuel - 0.7) < 0.001
        assert abs(f.resources.ammo - 0.5) < 0.001


# ── SimAsset ─────────────────────────────────────────────────────────────────


class TestSimAsset:
    def _make_asset(self) -> SimAsset:
        return SimAsset(
            asset_id="a1",
            callsign="TEST-01",
            asset_type="M1 Abrams",
            faction_id="blue",
            position=Position(latitude=34.0, longitude=40.0),
            speed_kmh=65,
            max_speed_kmh=65,
        )

    def test_apply_damage_reduces_health(self):
        a = self._make_asset()
        a.apply_damage(0.3)
        assert abs(a.health - 0.7) < 0.001
        assert a.status == AssetStatus.ACTIVE

    def test_apply_heavy_damage_sets_damaged(self):
        a = self._make_asset()
        a.apply_damage(0.6)
        assert a.status == AssetStatus.DAMAGED

    def test_apply_lethal_damage_destroys(self):
        a = self._make_asset()
        a.apply_damage(1.0)
        assert a.status == AssetStatus.DESTROYED
        assert not a.is_alive()

    def test_destroy(self):
        a = self._make_asset()
        a.destroy()
        assert a.health == 0.0
        assert not a.is_alive()


# ── SimulationManager ────────────────────────────────────────────────────────


class TestSimulationManager:
    def _setup_manager(self) -> SimulationManager:
        mgr = SimulationManager(tick_duration_s=1.0)

        mgr.add_faction(Faction(
            faction_id="blue",
            name="BLUFOR",
            side="blue",
            doctrine=Doctrine.DEFENSIVE,
            asset_ids=["a1"],
        ))
        mgr.add_faction(Faction(
            faction_id="red",
            name="OPFOR",
            side="red",
            doctrine=Doctrine.AGGRESSIVE,
            asset_ids=["a2"],
        ))

        mgr.add_asset(SimAsset(
            asset_id="a1",
            callsign="ABRAMS-01",
            asset_type="M1 Abrams",
            faction_id="blue",
            position=Position(latitude=34.0, longitude=40.0),
            speed_kmh=65,
            max_speed_kmh=65,
            weapons=["hellfire"],
        ))
        mgr.add_asset(SimAsset(
            asset_id="a2",
            callsign="T72-01",
            asset_type="T-72A MBT",
            faction_id="red",
            position=Position(latitude=35.0, longitude=41.0),
            speed_kmh=60,
            max_speed_kmh=60,
        ))

        return mgr

    def test_get_snapshot(self):
        mgr = self._setup_manager()
        snap = mgr.get_snapshot()
        assert snap["tick"] == 0
        assert "a1" in snap["assets"]
        assert "blue" in snap["factions"]

    def test_command_strike_hits_target(self):
        mgr = self._setup_manager()
        result = mgr.command_strike("hellfire", "a2")
        assert "result" in result
        assert result["result"]["hit"] or result["result"]["outcome"] == "missed"

    def test_command_strike_unknown_target(self):
        mgr = self._setup_manager()
        result = mgr.command_strike("hellfire", "nonexistent")
        assert result["error"] == "Target not found"

    def test_command_strike_unknown_weapon(self):
        mgr = self._setup_manager()
        result = mgr.command_strike("banana_launcher", "a2")
        assert "Unknown weapon" in result["error"]

    def test_command_move(self):
        mgr = self._setup_manager()
        result = mgr.command_move("a1", 34.5, 40.5, terrain="desert")
        assert "distance_km" in result
        assert result["eta_ticks"] > 0

        asset = mgr.get_asset("a1")
        assert asset.status == AssetStatus.MOVING
        assert asset.movement_order is not None

    def test_command_move_destroyed_asset_fails(self):
        mgr = self._setup_manager()
        mgr.get_asset("a1").destroy()
        result = mgr.command_move("a1", 34.5, 40.5)
        assert result["error"] == "Asset is destroyed"

    def test_advance_tick_processes_movement(self):
        mgr = self._setup_manager()
        mgr.command_move("a1", 34.001, 40.001, terrain="open")

        diff = mgr._advance_tick()
        assert diff.tick == 1
        assert len(diff.asset_updates) > 0

    def test_advance_tick_fires_due_events(self):
        mgr = self._setup_manager()
        mgr.event_queue.create_and_schedule(
            event_type=EventType.ALERT,
            description="Test alert",
            scheduled_tick=1,
        )

        diff = mgr._advance_tick()
        assert len(diff.events_fired) == 1

    def test_infrastructure_cascade(self):
        mgr = self._setup_manager()

        # Add a radar that depends on a power station
        mgr.add_asset(SimAsset(
            asset_id="power1",
            callsign="POWER-01",
            asset_type="Oil Pump Jack",
            faction_id="blue",
            position=Position(latitude=34.0, longitude=40.0),
        ))
        mgr.add_asset(SimAsset(
            asset_id="radar1",
            callsign="RADAR-01",
            asset_type="EW Radar Vehicle",
            faction_id="blue",
            position=Position(latitude=34.1, longitude=40.1),
        ))
        mgr.add_dependency(DependencyLink(
            source_id="power1",
            target_id="radar1",
            link_type="supplies",
            degradation_rate=0.3,
        ))

        # Destroy the power station
        mgr.get_asset("power1").destroy()
        mgr._handle_infrastructure_cascade("power1")

        radar = mgr.get_asset("radar1")
        assert radar.health < 1.0  # should be degraded


# ── SimAsset suppression ──────────────────────────────────────────────────────


class TestSimAssetSuppression:
    def _asset(self) -> SimAsset:
        return SimAsset(
            asset_id="s1",
            callsign="SUP-01",
            asset_type="T-72A MBT",
            faction_id="red",
            position=Position(latitude=34.0, longitude=40.0),
            speed_kmh=60,
            max_speed_kmh=60,
        )

    def test_suppress_sets_until_tick(self):
        a = self._asset()
        a.suppress(10)
        assert a.suppressed_until_tick == 10

    def test_suppress_takes_max(self):
        a = self._asset()
        a.suppress(10)
        a.suppress(5)   # lower — should not reduce existing suppression
        assert a.suppressed_until_tick == 10
        a.suppress(20)  # higher — should extend
        assert a.suppressed_until_tick == 20

    def test_is_suppressed_returns_true_during_window(self):
        a = self._asset()
        a.suppress(10)
        assert a.is_suppressed(5) is True

    def test_is_suppressed_returns_false_after_expiry(self):
        a = self._asset()
        a.suppress(10)
        assert a.is_suppressed(10) is False  # boundary: tick == until_tick is NOT suppressed
        assert a.is_suppressed(15) is False

    def test_unsuppressed_by_default(self):
        a = self._asset()
        assert a.is_suppressed(0) is False


# ── Manager suppression & CE mutations ───────────────────────────────────────


class TestManagerSuppression:
    def _setup(self) -> SimulationManager:
        mgr = SimulationManager(tick_duration_s=1.0)
        mgr.add_faction(Faction(
            faction_id="blue",
            name="BLUFOR",
            side="blue",
            doctrine=Doctrine.DEFENSIVE,
            asset_ids=["a1"],
        ))
        mgr.add_faction(Faction(
            faction_id="red",
            name="OPFOR",
            side="red",
            doctrine=Doctrine.AGGRESSIVE,
            asset_ids=["a2"],
        ))
        mgr.add_asset(SimAsset(
            asset_id="a1",
            callsign="ABRAMS-01",
            asset_type="M1 Abrams",
            faction_id="blue",
            position=Position(latitude=34.0, longitude=40.0),
            speed_kmh=65,
            max_speed_kmh=65,
            weapons=["hellfire"],
        ))
        mgr.add_asset(SimAsset(
            asset_id="a2",
            callsign="T72-01",
            asset_type="T-72A MBT",
            faction_id="red",
            position=Position(latitude=35.0, longitude=41.0),
            speed_kmh=60,
            max_speed_kmh=60,
        ))
        return mgr

    def test_strike_mission_suppresses_target_on_hit(self):
        """A hit via _resolve_strike_mission suppresses the target for tick+5 ticks."""
        mgr = self._setup()
        from unittest.mock import patch
        from simulation.rules import StrikeOutcome, StrikeResult
        hit_result = StrikeResult(
            hit=True,
            destroyed=False,
            crew_survived=True,
            damage_percent=0.3,
            outcome=StrikeOutcome.DAMAGED,
            description="Hit",
        )
        # Use the mission-based API (creates an active mission)
        result = mgr.command_strike_mission("a1", "hellfire", "a2")
        assert "mission_id" in result, f"expected mission, got: {result}"
        mission_id = result["mission_id"]

        # Resolve the mission with a forced hit
        with patch("simulation.manager.resolve_strike_by_names", return_value=hit_result):
            mgr._resolve_strike_mission(mission_id)

        target = mgr.get_asset("a2")
        # tick is 0, suppressed_until_tick == 5 → suppressed at tick 1
        assert target.is_suppressed(1)
        assert not target.is_suppressed(mgr.tick + 5)

    def test_apply_mutation_from_consequence_move(self):
        """CE move_asset command updates the asset's position (uses command_move)."""
        mgr = self._setup()
        mgr._apply_mutation_from_consequence(
            "move_asset",
            {"asset_id": "a2", "latitude": 34.5, "longitude": 40.5},
        )
        # command_move creates a movement order; the asset is now MOVING
        asset = mgr.get_asset("a2")
        assert asset.status == AssetStatus.MOVING
        assert asset.movement_order is not None

    def test_apply_mutation_from_consequence_morale(self):
        """CE update_morale command applies a morale hit to the faction."""
        mgr = self._setup()
        faction = mgr.get_faction("red")
        original_morale = faction.morale
        mgr._apply_mutation_from_consequence(
            "update_morale",
            {"faction_id": "red", "severity": 0.2},
        )
        assert faction.morale < original_morale

    def test_apply_mutation_from_consequence_unknown_action_ignored(self):
        """Unknown CE actions must not raise — they are silently discarded."""
        mgr = self._setup()
        # Should not raise
        mgr._apply_mutation_from_consequence("launch_nukes", {"faction_id": "red"})
