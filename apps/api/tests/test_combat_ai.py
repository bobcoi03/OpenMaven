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
