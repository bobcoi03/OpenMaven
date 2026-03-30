"""State machine for managing targets on the targeting board."""

import logging
from datetime import datetime, timezone

from detection.models import (
    Detection,
    STAGE_ORDER,
    Target,
    TargetingBoard,
    TargetStage,
)

# ── Constants ─────────────────────────────────────────────────────────────────
AUTO_TRIAGE_CONFIDENCE_THRESHOLD: float = 85.0

logger = logging.getLogger(__name__)


# ── Internal Helpers ──────────────────────────────────────────────────────────


def _next_stage(current: TargetStage) -> TargetStage:
    """Return the stage immediately after current; stays at COMPLETE if already there."""
    idx = STAGE_ORDER.index(current)
    return STAGE_ORDER[min(idx + 1, len(STAGE_ORDER) - 1)]


def _replace_target(board: TargetingBoard, updated: Target) -> TargetingBoard:
    """Return a new board with the updated target replacing the existing entry."""
    return TargetingBoard(targets={**board.targets, updated.target_id: updated})


# ── Public API ────────────────────────────────────────────────────────────────


def create_target(detection: Detection, board: TargetingBoard) -> TargetingBoard:
    """Create a new DYNAMIC target from a detection and return the updated board."""
    now = datetime.now(timezone.utc)
    target = Target(
        target_id=str(detection.detection_id),
        detection=detection,
        stage=TargetStage.DYNAMIC,
        created_at=now,
        updated_at=now,
        history=[(TargetStage.DYNAMIC, now)],
    )
    logger.info("Target %s created at stage DYNAMIC", target.target_id)
    return _replace_target(board, target)


def advance_target(target_id: str, board: TargetingBoard) -> TargetingBoard:
    """Advance a target one stage forward; no-op if COMPLETE or target not found."""
    target = board.targets.get(target_id)
    if target is None:
        return board
    if target.stage == TargetStage.COMPLETE:
        return board
    next_stage = _next_stage(target.stage)
    now = datetime.now(timezone.utc)
    updated = Target(
        target_id=target.target_id,
        detection=target.detection,
        stage=next_stage,
        created_at=target.created_at,
        updated_at=now,
        history=[*target.history, (next_stage, now)],
    )
    logger.info("Target %s advanced: %s → %s", target_id, target.stage.value, next_stage.value)
    return _replace_target(board, updated)


def set_target_stage(target_id: str, new_stage: TargetStage, board: TargetingBoard) -> TargetingBoard:
    """Set a target to an arbitrary stage (for drag-and-drop). No-op if target not found."""
    target = board.targets.get(target_id)
    if target is None:
        return board
    now = datetime.now(timezone.utc)
    updated = Target(
        target_id=target.target_id,
        detection=target.detection,
        stage=new_stage,
        created_at=target.created_at,
        updated_at=now,
        history=[*target.history, (new_stage, now)],
    )
    logger.info("Target %s stage set: %s → %s", target_id, target.stage.value, new_stage.value)
    return _replace_target(board, updated)


def get_board(board: TargetingBoard) -> list[Target]:
    """Return all targets currently on the board as a flat list."""
    return list(board.targets.values())


def auto_triage(board: TargetingBoard) -> TargetingBoard:
    """Auto-advance DYNAMIC targets with confidence > threshold to PENDING_PAIRING."""
    result = board
    for target in list(board.targets.values()):
        is_dynamic = target.stage == TargetStage.DYNAMIC
        above_threshold = target.detection.confidence > AUTO_TRIAGE_CONFIDENCE_THRESHOLD
        if is_dynamic and above_threshold:
            result = advance_target(target.target_id, result)
    return result
