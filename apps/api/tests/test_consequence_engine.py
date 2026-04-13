"""Tests for the LLM consequence engine — parse, rate-limit, and sitrep building."""

import json
import pytest

from simulation.consequence_engine import (
    ConsequenceEngine,
    MIN_TICKS_BETWEEN_CALLS,
    _parse_commands,
    _build_situation_report,
)
from simulation.assets import AssetStatus, Position, SimAsset
from simulation.faction import Doctrine, Faction
from simulation.manager import SimulationManager


# ── _parse_commands ───────────────────────────────────────────────────────────


class TestParseCommands:
    def test_valid_json_array_returns_allowed_commands(self):
        raw = json.dumps([
            {"action": "move_asset", "params": {"asset_id": "a1", "lat": 34.0, "lon": 40.0}},
        ])
        result = _parse_commands(raw)
        assert len(result) == 1
        assert result[0]["action"] == "move_asset"

    def test_strips_markdown_fences(self):
        raw = "```json\n[{\"action\":\"update_morale\",\"params\":{\"faction_id\":\"red\",\"delta\":-0.1}}]\n```"
        result = _parse_commands(raw)
        assert len(result) == 1
        assert result[0]["action"] == "update_morale"

    def test_disallowed_action_filtered_out(self):
        raw = json.dumps([
            {"action": "launch_nukes", "params": {}},
            {"action": "move_asset", "params": {"asset_id": "a1"}},
        ])
        result = _parse_commands(raw)
        assert len(result) == 1
        assert result[0]["action"] == "move_asset"

    def test_invalid_json_returns_empty(self):
        assert _parse_commands("this is not json") == []

    def test_empty_string_returns_empty(self):
        assert _parse_commands("") == []

    def test_non_list_returns_empty(self):
        assert _parse_commands('{"action": "move_asset"}') == []

    def test_mixed_valid_invalid_items(self):
        raw = json.dumps([
            "not_a_dict",
            {"action": "update_morale", "params": {"faction_id": "red", "delta": 0.1}},
        ])
        result = _parse_commands(raw)
        assert len(result) == 1
        assert result[0]["action"] == "update_morale"


# ── ConsequenceEngine rate-limiting ──────────────────────────────────────────


class TestConsequenceEngineRateLimit:
    def test_is_ready_on_first_call(self):
        ce = ConsequenceEngine()
        assert ce.is_ready("red", current_tick=0) is True

    def test_not_ready_within_cooldown(self):
        ce = ConsequenceEngine()
        ce._last_eval["red"] = 5
        assert ce.is_ready("red", current_tick=5 + MIN_TICKS_BETWEEN_CALLS - 1) is False

    def test_ready_after_full_cooldown(self):
        ce = ConsequenceEngine()
        ce._last_eval["red"] = 5
        assert ce.is_ready("red", current_tick=5 + MIN_TICKS_BETWEEN_CALLS) is True

    def test_different_factions_tracked_independently(self):
        ce = ConsequenceEngine()
        ce._last_eval["red"] = 100
        # "blue" has never been evaluated — should be ready
        assert ce.is_ready("blue", current_tick=100) is True
        # "red" is still on cooldown
        assert ce.is_ready("red", current_tick=100 + MIN_TICKS_BETWEEN_CALLS - 1) is False


# ── _build_situation_report ───────────────────────────────────────────────────


class TestBuildSituationReport:
    def _make_mgr(self) -> SimulationManager:
        mgr = SimulationManager(tick_duration_s=1.0)
        mgr.add_faction(Faction(
            faction_id="red", name="OPFOR", side="red",
            doctrine=Doctrine.AGGRESSIVE, asset_ids=[],
        ))
        mgr.add_faction(Faction(
            faction_id="blue", name="BLUFOR", side="blue",
            doctrine=Doctrine.DEFENSIVE, asset_ids=[],
        ))
        return mgr

    def _add_asset(self, mgr: SimulationManager, aid: str, faction: str,
                   asset_type: str, lat: float = 34.0, lon: float = 40.0) -> SimAsset:
        a = SimAsset(
            asset_id=aid, callsign=aid.upper(),
            asset_type=asset_type, faction_id=faction,
            position=Position(latitude=lat, longitude=lon),
            speed_kmh=60, max_speed_kmh=60,
        )
        mgr.add_asset(a)
        mgr.factions[faction].asset_ids.append(aid)
        return a

    def test_returns_valid_json(self):
        mgr = self._make_mgr()
        self._add_asset(mgr, "t1", "red", "T-72A MBT")

        report_str = _build_situation_report("red", mgr)
        report = json.loads(report_str)

        assert "tick" in report
        assert "faction" in report
        assert "own_assets" in report
        assert "nearby_enemies" in report
        assert "recent_events" in report

    def test_own_assets_are_included(self):
        mgr = self._make_mgr()
        self._add_asset(mgr, "t1", "red", "T-72A MBT")

        report = json.loads(_build_situation_report("red", mgr))
        own_ids = [a["asset_id"] for a in report["own_assets"]]
        assert "t1" in own_ids

    def test_enemy_assets_not_in_own_assets(self):
        mgr = self._make_mgr()
        self._add_asset(mgr, "t1", "red", "T-72A MBT")
        self._add_asset(mgr, "b1", "blue", "M1 Abrams", lat=34.1, lon=40.0)

        report = json.loads(_build_situation_report("red", mgr))
        own_ids = [a["asset_id"] for a in report["own_assets"]]
        assert "b1" not in own_ids

    def test_destroyed_assets_excluded(self):
        mgr = self._make_mgr()
        tank = self._add_asset(mgr, "t1", "red", "T-72A MBT")
        tank.destroy()

        report = json.loads(_build_situation_report("red", mgr))
        own_ids = [a["asset_id"] for a in report["own_assets"]]
        assert "t1" not in own_ids
