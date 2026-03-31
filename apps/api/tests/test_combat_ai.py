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
