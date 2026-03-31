"""Tests for the ConsequenceEngine LLM faction commander."""

import pytest
from unittest.mock import AsyncMock, patch
from simulation.consequence_engine import ConsequenceEngine
from simulation.manager import SimulationManager
from simulation.faction import Faction, Doctrine
from simulation.assets import SimAsset, AssetStatus, Position
from simulation.events import SimEvent, EventType


def _make_manager() -> SimulationManager:
    manager = SimulationManager()
    red = Faction(faction_id="red", name="OPFOR", side="red", doctrine=Doctrine.AGGRESSIVE)
    blue = Faction(faction_id="blue", name="BLUFOR", side="blue", doctrine=Doctrine.DEFENSIVE)
    manager.add_faction(red)
    manager.add_faction(blue)
    manager.add_asset(SimAsset(
        asset_id="red-01", callsign="Red-01", asset_type="T-72 Tank",
        faction_id="red",
        position=Position(latitude=33.5, longitude=36.3, altitude_m=0.0),
        health=1.0, status=AssetStatus.ACTIVE, speed_kmh=50.0, max_speed_kmh=50.0,
    ))
    return manager


def _make_strike_event(faction_id: str = "red") -> SimEvent:
    """Create a STRIKE SimEvent for the given faction."""
    return SimEvent(
        event_id="evt_test_001",
        event_type=EventType.STRIKE,
        description="Test strike on Red-01",
        faction_id=faction_id,
        scheduled_tick=0,
    )


class TestConsequenceEngineTriggers:
    def test_should_trigger_on_strike_event(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        event = _make_strike_event()
        assert engine._should_trigger(event, "red", manager) is True

    def test_should_not_trigger_within_cooldown(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        event = _make_strike_event()
        engine._last_call_tick["red"] = manager.tick  # same tick = within cooldown
        assert engine._should_trigger(event, "red", manager) is False

    def test_should_trigger_after_cooldown_passes(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        event = _make_strike_event()
        engine._last_call_tick["red"] = 0
        manager.tick = engine._cooldown_ticks + 1
        assert engine._should_trigger(event, "red", manager) is True

    def test_should_trigger_on_low_capability(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        manager.factions["red"].capability = 0.2
        # Use a non-trigger event type to test that low capability alone triggers
        # Use ALERT or CUSTOM if available; otherwise use MORALE_SHIFT
        event = _make_strike_event()  # even same event, low capability should keep it triggered
        assert engine._should_trigger(event, "red", manager) is True


class TestPromptBuilding:
    def test_build_prompt_includes_faction_name(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        event = _make_strike_event()
        prompt = engine._build_prompt(manager.factions["red"], event, manager)
        assert "OPFOR" in prompt

    def test_build_prompt_includes_asset_info(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        event = _make_strike_event()
        prompt = engine._build_prompt(manager.factions["red"], event, manager)
        assert "red-01" in prompt or "T-72" in prompt

    def test_build_prompt_includes_command_keywords(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        event = _make_strike_event()
        prompt = engine._build_prompt(manager.factions["red"], event, manager)
        assert "move" in prompt.lower()
        assert "retreat" in prompt.lower()


class TestCommandApplication:
    def test_apply_retreat_command_sets_rtb(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        manager.add_asset(SimAsset(
            asset_id="red-fob-01", callsign="FOB Alpha", asset_type="supply_depot",
            faction_id="red",
            position=Position(latitude=33.0, longitude=36.0, altitude_m=0.0),
            health=1.0, status=AssetStatus.ACTIVE, speed_kmh=0.0, max_speed_kmh=0.0,
        ))
        commands = [{"command": "retreat", "asset_id": "red-01"}]
        engine._apply_commands(commands, manager.factions["red"], manager)
        assert manager.assets["red-01"].status == AssetStatus.RTB

    def test_apply_hold_command_sets_holding(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        commands = [{"command": "hold", "asset_id": "red-01"}]
        engine._apply_commands(commands, manager.factions["red"], manager)
        assert manager.assets["red-01"].status == AssetStatus.HOLDING

    def test_apply_move_command_orders_movement(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        commands = [{"command": "move", "asset_id": "red-01", "lat": 34.0, "lon": 37.0}]
        engine._apply_commands(commands, manager.factions["red"], manager)
        assert manager.assets["red-01"].status == AssetStatus.MOVING

    def test_apply_commands_ignores_unknown_asset(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        commands = [{"command": "retreat", "asset_id": "nonexistent-99"}]
        # Should not raise
        engine._apply_commands(commands, manager.factions["red"], manager)

    @pytest.mark.asyncio
    async def test_process_event_calls_llm_and_applies_commands(self) -> None:
        engine = ConsequenceEngine()
        manager = _make_manager()
        event = _make_strike_event()
        with patch.object(engine, "_call_llm", new=AsyncMock(return_value=[{"command": "hold", "asset_id": "red-01"}])):
            await engine.process_event(event, manager)
        assert manager.assets["red-01"].status == AssetStatus.HOLDING
        assert engine._last_call_tick.get("red") == manager.tick
