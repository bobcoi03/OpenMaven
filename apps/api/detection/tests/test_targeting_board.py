"""Tests for targeting_board state machine."""

from datetime import datetime, timezone
from uuid import uuid4

from detection.models import Detection, STAGE_ORDER, TargetingBoard, TargetStage
from detection.targeting_board import (
    AUTO_TRIAGE_CONFIDENCE_THRESHOLD,
    advance_target,
    auto_triage,
    create_target,
    get_board,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def make_detection(confidence: float = 70.0) -> Detection:
    """Return a minimal Detection for board tests."""
    return Detection(
        detection_id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        asset_id="A001",
        asset_type="Tank",
        confidence=confidence,
        grid_ref="37TFJ12345678",
        lat=48.8566,
        lon=2.3522,
        source_label="SIGINT",
        classification="UNCLASSIFIED",
    )


# ── create_target ─────────────────────────────────────────────────────────────


def test_create_target_adds_one_target_to_empty_board() -> None:
    """A freshly created target must appear as the sole entry on the board."""
    new_board = create_target(make_detection(), TargetingBoard())
    assert len(new_board.targets) == 1


def test_new_target_starts_in_dynamic_stage() -> None:
    """All newly created targets must begin at DYNAMIC."""
    new_board = create_target(make_detection(), TargetingBoard())
    target = list(new_board.targets.values())[0]
    assert target.stage == TargetStage.DYNAMIC


def test_create_target_preserves_existing_targets() -> None:
    """Subsequent calls must accumulate targets rather than replace them."""
    board = TargetingBoard()
    board = create_target(make_detection(), board)
    board = create_target(make_detection(), board)
    assert len(board.targets) == 2


def test_create_target_records_initial_history_entry() -> None:
    """History must contain exactly one entry: the DYNAMIC transition."""
    new_board = create_target(make_detection(), TargetingBoard())
    target = list(new_board.targets.values())[0]
    assert len(target.history) == 1
    assert target.history[0][0] == TargetStage.DYNAMIC


def test_create_target_does_not_mutate_original_board() -> None:
    """create_target must return a new board; the original must be unchanged."""
    board = TargetingBoard()
    _ = create_target(make_detection(), board)
    assert len(board.targets) == 0


# ── advance_target ────────────────────────────────────────────────────────────


def test_advance_target_moves_dynamic_to_pending_pairing() -> None:
    """First advance from DYNAMIC must land on PENDING_PAIRING."""
    board = create_target(make_detection(), TargetingBoard())
    tid = list(board.targets.keys())[0]
    new_board = advance_target(tid, board)
    assert new_board.targets[tid].stage == TargetStage.PENDING_PAIRING


def test_advance_target_traverses_full_stage_order() -> None:
    """Sequential advances must follow STAGE_ORDER exactly, one step at a time."""
    board = create_target(make_detection(), TargetingBoard())
    tid = list(board.targets.keys())[0]
    for expected_stage in STAGE_ORDER[1:]:
        board = advance_target(tid, board)
        assert board.targets[tid].stage == expected_stage


def test_advance_target_is_noop_at_complete() -> None:
    """Advancing a COMPLETE target must leave stage unchanged."""
    board = create_target(make_detection(), TargetingBoard())
    tid = list(board.targets.keys())[0]
    for _ in STAGE_ORDER[1:]:
        board = advance_target(tid, board)
    board = advance_target(tid, board)  # extra advance at COMPLETE
    assert board.targets[tid].stage == TargetStage.COMPLETE


def test_advance_target_is_noop_for_unknown_id() -> None:
    """Advancing a nonexistent target ID must return the board unchanged."""
    board = TargetingBoard()
    assert advance_target("ghost-id", board) == board


def test_advance_target_appends_transition_to_history() -> None:
    """Each advance must add exactly one entry to the target's history."""
    board = create_target(make_detection(), TargetingBoard())
    tid = list(board.targets.keys())[0]
    board = advance_target(tid, board)
    assert len(board.targets[tid].history) == 2


def test_advance_target_does_not_mutate_original_board() -> None:
    """advance_target must return a new board and leave the original intact."""
    board = create_target(make_detection(), TargetingBoard())
    tid = list(board.targets.keys())[0]
    _ = advance_target(tid, board)
    assert board.targets[tid].stage == TargetStage.DYNAMIC


# ── get_board ─────────────────────────────────────────────────────────────────


def test_get_board_returns_all_targets_as_list() -> None:
    """get_board must return every target currently on the board."""
    board = TargetingBoard()
    for _ in range(3):
        board = create_target(make_detection(), board)
    assert len(get_board(board)) == 3


def test_get_board_returns_empty_list_for_empty_board() -> None:
    """get_board on a fresh board must return an empty list."""
    assert get_board(TargetingBoard()) == []


# ── auto_triage ───────────────────────────────────────────────────────────────


def test_auto_triage_advances_high_confidence_dynamic_target() -> None:
    """DYNAMIC targets above the threshold must be promoted to PENDING_PAIRING."""
    high = make_detection(confidence=AUTO_TRIAGE_CONFIDENCE_THRESHOLD + 1.0)
    board = create_target(high, TargetingBoard())
    tid = list(board.targets.keys())[0]
    assert auto_triage(board).targets[tid].stage == TargetStage.PENDING_PAIRING


def test_auto_triage_leaves_threshold_equal_target_in_dynamic() -> None:
    """Targets at exactly the threshold (not above) must remain in DYNAMIC."""
    equal = make_detection(confidence=AUTO_TRIAGE_CONFIDENCE_THRESHOLD)
    board = create_target(equal, TargetingBoard())
    tid = list(board.targets.keys())[0]
    assert auto_triage(board).targets[tid].stage == TargetStage.DYNAMIC


def test_auto_triage_ignores_non_dynamic_targets() -> None:
    """auto_triage must not advance targets that are already past DYNAMIC."""
    high = make_detection(confidence=95.0)
    board = create_target(high, TargetingBoard())
    tid = list(board.targets.keys())[0]
    board = advance_target(tid, board)  # PENDING_PAIRING
    result = auto_triage(board)
    assert result.targets[tid].stage == TargetStage.PENDING_PAIRING
