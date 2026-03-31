import pytest
from simulation.assets import SimAsset, AssetStatus, Position


def _make_asset(asset_id: str = "red-01", health: float = 1.0) -> SimAsset:
    return SimAsset(
        asset_id=asset_id,
        callsign="Red-01",
        asset_type="T-72 Tank",
        faction_id="red",
        position=Position(latitude=33.5, longitude=36.3, altitude_m=500.0),
        health=health,
        status=AssetStatus.ACTIVE,
        speed_kmh=50.0,
        max_speed_kmh=50.0,
    )


class TestSuppressionField:
    def test_default_suppressed_until_tick_is_zero(self) -> None:
        asset = _make_asset()
        assert asset.suppressed_until_tick == 0

    def test_suppressed_until_tick_can_be_set(self) -> None:
        asset = _make_asset()
        asset.suppressed_until_tick = 15
        assert asset.suppressed_until_tick == 15

    def test_is_suppressed_returns_true_when_tick_lt_suppressed_until(self) -> None:
        asset = _make_asset()
        asset.suppressed_until_tick = 10
        assert asset.is_suppressed(current_tick=5) is True

    def test_is_suppressed_returns_false_when_tick_gte_suppressed_until(self) -> None:
        asset = _make_asset()
        asset.suppressed_until_tick = 10
        assert asset.is_suppressed(current_tick=10) is False
        assert asset.is_suppressed(current_tick=11) is False


from simulation.faction import Faction, Doctrine, PatrolZone


class TestPatrolZone:
    def test_patrol_zone_default_is_none(self) -> None:
        faction = Faction(
            faction_id="red",
            name="OPFOR",
            side="red",
            doctrine=Doctrine.AGGRESSIVE,
        )
        assert faction.patrol_zone is None

    def test_patrol_zone_can_be_assigned(self) -> None:
        zone = PatrolZone(
            min_lat=33.0,
            max_lat=35.0,
            min_lon=36.0,
            max_lon=38.0,
            waypoints=[(33.5, 36.5), (34.0, 37.0), (34.5, 36.8)],
        )
        faction = Faction(
            faction_id="red",
            name="OPFOR",
            side="red",
            doctrine=Doctrine.AGGRESSIVE,
            patrol_zone=zone,
        )
        assert faction.patrol_zone is not None
        assert faction.patrol_zone.min_lat == 33.0
        assert len(faction.patrol_zone.waypoints) == 3

    def test_patrol_zone_next_waypoint_cycles(self) -> None:
        zone = PatrolZone(
            min_lat=33.0, max_lat=35.0, min_lon=36.0, max_lon=38.0,
            waypoints=[(33.5, 36.5), (34.0, 37.0)],
        )
        assert zone.next_waypoint(current_index=0) == (34.0, 37.0)
        assert zone.next_waypoint(current_index=1) == (33.5, 36.5)  # wraps


from simulation.combat_ai import (
    AIAction,
    ActionScore,
    score_actions,
    pick_action,
)
from simulation.manager import SimulationManager
from simulation.faction import Faction, Doctrine, PatrolZone
from simulation.assets import SimAsset, AssetStatus, Position
from simulation.events import EventQueue


def _setup_scoring_manager() -> SimulationManager:
    """Minimal manager with one red asset and no nearby threats."""
    manager = SimulationManager()

    red_faction = Faction(
        faction_id="red",
        name="OPFOR",
        side="red",
        doctrine=Doctrine.AGGRESSIVE,
    )
    manager.add_faction(red_faction)

    blue_faction = Faction(
        faction_id="blue",
        name="BLUFOR",
        side="blue",
        doctrine=Doctrine.DEFENSIVE,
    )
    manager.add_faction(blue_faction)

    red_asset = SimAsset(
        asset_id="red-01",
        callsign="Red-01",
        asset_type="T-72 Tank",
        faction_id="red",
        position=Position(latitude=33.5, longitude=36.3, altitude_m=0.0),
        health=1.0,
        status=AssetStatus.ACTIVE,
        speed_kmh=50.0,
        max_speed_kmh=50.0,
    )
    manager.add_asset(red_asset)
    return manager


class TestScoringSystem:
    def test_score_actions_returns_all_six_actions(self) -> None:
        manager = _setup_scoring_manager()
        asset = manager.assets["red-01"]
        scores = score_actions(asset, manager)
        actions = {s.action for s in scores}
        assert actions == {
            AIAction.HOLD,
            AIAction.ENGAGE,
            AIAction.RETREAT,
            AIAction.SEEK_COVER,
            AIAction.CALL_SUPPORT,
            AIAction.ADVANCE,
        }

    def test_low_health_prefers_retreat_over_engage(self) -> None:
        manager = _setup_scoring_manager()
        asset = manager.assets["red-01"]
        asset.health = 0.2  # below 0.3 threshold
        scores = score_actions(asset, manager)
        scores_dict = {s.action: s.score for s in scores}
        assert scores_dict[AIAction.RETREAT] > scores_dict[AIAction.ENGAGE]

    def test_healthy_asset_does_not_prefer_retreat(self) -> None:
        manager = _setup_scoring_manager()
        asset = manager.assets["red-01"]
        asset.health = 0.9
        scores = score_actions(asset, manager)
        scores_dict = {s.action: s.score for s in scores}
        assert scores_dict[AIAction.ENGAGE] > scores_dict[AIAction.RETREAT]

    def test_outnumbered_boosts_call_support(self) -> None:
        manager = _setup_scoring_manager()
        # Add 4 blue threats within 10km
        for i in range(4):
            manager.add_asset(SimAsset(
                asset_id=f"blue-threat-{i}",
                callsign=f"Blue-{i}",
                asset_type="M1 Abrams",
                faction_id="blue",
                position=Position(latitude=33.51, longitude=36.31, altitude_m=0.0),
                health=1.0,
                status=AssetStatus.ACTIVE,
                speed_kmh=50.0,
                max_speed_kmh=50.0,
            ))
        asset = manager.assets["red-01"]
        scores = score_actions(asset, manager)
        scores_dict = {s.action: s.score for s in scores}
        assert scores_dict[AIAction.CALL_SUPPORT] > scores_dict[AIAction.HOLD]

    def test_aggressive_doctrine_boosts_engage_vs_defensive(self) -> None:
        manager = _setup_scoring_manager()
        asset = manager.assets["red-01"]
        asset.health = 0.9

        manager.factions["red"].doctrine = Doctrine.AGGRESSIVE
        agg_scores = {s.action: s.score for s in score_actions(asset, manager)}

        manager.factions["red"].doctrine = Doctrine.DEFENSIVE
        def_scores = {s.action: s.score for s in score_actions(asset, manager)}

        assert agg_scores[AIAction.ENGAGE] > def_scores[AIAction.ENGAGE]
        assert agg_scores[AIAction.ADVANCE] > def_scores[AIAction.ADVANCE]

    def test_defensive_doctrine_boosts_hold_vs_aggressive(self) -> None:
        manager = _setup_scoring_manager()
        asset = manager.assets["red-01"]
        asset.health = 0.9

        manager.factions["red"].doctrine = Doctrine.DEFENSIVE
        def_scores = {s.action: s.score for s in score_actions(asset, manager)}

        manager.factions["red"].doctrine = Doctrine.AGGRESSIVE
        agg_scores = {s.action: s.score for s in score_actions(asset, manager)}

        assert def_scores[AIAction.HOLD] > agg_scores[AIAction.HOLD]

    def test_nearby_structure_boosts_seek_cover(self) -> None:
        manager = _setup_scoring_manager()
        # Add a supply_depot for red faction within 2km
        manager.add_asset(SimAsset(
            asset_id="red-depot-01",
            callsign="Supply Depot Alpha",
            asset_type="supply_depot",
            faction_id="red",
            position=Position(latitude=33.505, longitude=36.305, altitude_m=0.0),
            health=1.0,
            status=AssetStatus.ACTIVE,
            speed_kmh=0.0,
            max_speed_kmh=0.0,
        ))
        asset = manager.assets["red-01"]
        asset.health = 0.5  # moderate damage — cover is relevant
        scores = score_actions(asset, manager)
        scores_dict = {s.action: s.score for s in scores}
        assert scores_dict[AIAction.SEEK_COVER] > scores_dict[AIAction.HOLD]

    def test_pick_action_returns_highest_scoring_action(self) -> None:
        manager = _setup_scoring_manager()
        asset = manager.assets["red-01"]
        asset.health = 0.1  # very low — retreat should win
        action = pick_action(asset, manager)
        assert action == AIAction.RETREAT


from simulation.combat_ai import (
    execute_ai_tick,
    cover_damage_multiplier,
)


def _setup_full_manager() -> SimulationManager:
    """Manager with one red asset, one blue asset far away."""
    manager = SimulationManager()

    red_faction = Faction(
        faction_id="red",
        name="OPFOR",
        side="red",
        doctrine=Doctrine.AGGRESSIVE,
    )
    blue_faction = Faction(
        faction_id="blue",
        name="BLUFOR",
        side="blue",
        doctrine=Doctrine.DEFENSIVE,
    )
    manager.add_faction(red_faction)
    manager.add_faction(blue_faction)

    manager.add_asset(SimAsset(
        asset_id="red-01",
        callsign="Red-01",
        asset_type="T-72 Tank",
        faction_id="red",
        position=Position(latitude=33.5, longitude=36.3, altitude_m=0.0),
        health=1.0,
        status=AssetStatus.ACTIVE,
        speed_kmh=50.0,
        max_speed_kmh=50.0,
    ))
    manager.add_asset(SimAsset(
        asset_id="blue-01",
        callsign="Blue-01",
        asset_type="M1 Abrams",
        faction_id="blue",
        position=Position(latitude=36.0, longitude=38.0, altitude_m=0.0),
        health=1.0,
        status=AssetStatus.ACTIVE,
        speed_kmh=50.0,
        max_speed_kmh=50.0,
    ))
    return manager


class TestBehaviorExecution:
    def test_execute_ai_tick_does_not_touch_blue_assets(self) -> None:
        manager = _setup_full_manager()
        before_status = manager.assets["blue-01"].status
        execute_ai_tick(manager)
        assert manager.assets["blue-01"].status == before_status

    def test_execute_ai_tick_does_not_touch_destroyed_assets(self) -> None:
        manager = _setup_full_manager()
        manager.assets["red-01"].health = 0.0
        manager.assets["red-01"].status = AssetStatus.DESTROYED
        execute_ai_tick(manager)
        assert manager.assets["red-01"].status == AssetStatus.DESTROYED

    def test_low_health_asset_retreats_to_rtb(self) -> None:
        manager = _setup_full_manager()
        # Add a red FOB for the asset to retreat to
        manager.add_asset(SimAsset(
            asset_id="red-fob-01",
            callsign="FOB Alpha",
            asset_type="supply_depot",
            faction_id="red",
            position=Position(latitude=33.0, longitude=36.0, altitude_m=0.0),
            health=1.0,
            status=AssetStatus.ACTIVE,
            speed_kmh=0.0,
            max_speed_kmh=0.0,
        ))
        asset = manager.assets["red-01"]
        asset.health = 0.2  # triggers RETREAT
        execute_ai_tick(manager)
        assert asset.status == AssetStatus.RTB

    def test_cover_damage_multiplier_with_nearby_structure(self) -> None:
        manager = _setup_full_manager()
        manager.add_asset(SimAsset(
            asset_id="red-fob-01",
            callsign="FOB Alpha",
            asset_type="supply_depot",
            faction_id="red",
            position=Position(latitude=33.505, longitude=36.305, altitude_m=0.0),
            health=1.0,
            status=AssetStatus.ACTIVE,
            speed_kmh=0.0,
            max_speed_kmh=0.0,
        ))
        asset = manager.assets["red-01"]
        multiplier = cover_damage_multiplier(asset, manager)
        assert 0.60 <= multiplier <= 0.80  # 20-40% damage reduction

    def test_cover_damage_multiplier_without_nearby_structure(self) -> None:
        manager = _setup_full_manager()
        asset = manager.assets["red-01"]
        multiplier = cover_damage_multiplier(asset, manager)
        assert multiplier == 1.0  # no reduction


class TestSuppressionApplication:
    def test_suppression_not_set_on_idle_asset(self) -> None:
        manager = _setup_full_manager()
        asset = manager.assets["red-01"]
        # No threats nearby, no action that causes suppression
        # Just verify execute_ai_tick runs without error
        execute_ai_tick(manager)
        assert asset.is_alive()


class TestManagerIntegration:
    def test_execute_ai_tick_called_without_error_in_advance_tick(self) -> None:
        """Advance tick runs without error when hostile assets are present."""
        manager = _setup_full_manager()
        # Should not raise
        manager._advance_tick()
        assert manager.tick == 1

    def test_suppressed_asset_field_persists_through_tick(self) -> None:
        manager = _setup_full_manager()
        asset = manager.assets["red-01"]
        asset.suppressed_until_tick = manager.tick + 10
        manager._advance_tick()
        # suppressed_until_tick should still be set after tick
        assert asset.suppressed_until_tick > 0
