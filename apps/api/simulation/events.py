"""Event queue — tick-based scheduling for simulation events."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Categories of simulation events."""

    STRIKE = "strike"
    STRIKE_MISSION = "strike_mission"
    MOVEMENT_COMPLETE = "movement_complete"
    REINFORCEMENT_ARRIVAL = "reinforcement_arrival"
    LEADERSHIP_CHANGE = "leadership_change"
    RETALIATION = "retaliation"
    RESOURCE_DEPLETION = "resource_depletion"
    INFRASTRUCTURE_CASCADE = "infrastructure_cascade"
    ALERT = "alert"
    MORALE_SHIFT = "morale_shift"
    CUSTOM = "custom"


class Mutation(BaseModel):
    """A single structured change to world state."""

    action: str  # e.g. "destroy_asset", "move_asset", "update_leader"
    params: dict[str, Any] = Field(default_factory=dict)


class SimEvent(BaseModel):
    """A scheduled event in the simulation."""

    event_id: str
    event_type: EventType
    description: str
    faction_id: str | None = None
    scheduled_tick: int  # when this event fires
    probability: float = 1.0  # 0.0–1.0, rolled when the event fires
    mutations: list[Mutation] = Field(default_factory=list)
    mission_id: str | None = None  # links to a StrikeMission
    source_event_id: str | None = None  # the event that caused this one


class EventQueue:
    """Priority queue of events ordered by scheduled tick."""

    def __init__(self) -> None:
        self._events: list[SimEvent] = []
        self._next_id: int = 1

    @property
    def pending_count(self) -> int:
        return len(self._events)

    def schedule(self, event: SimEvent) -> None:
        """Add an event to the queue, sorted by scheduled_tick."""
        self._events.append(event)
        self._events.sort(key=lambda e: e.scheduled_tick)

    def create_and_schedule(
        self,
        event_type: EventType,
        description: str,
        scheduled_tick: int,
        mutations: list[Mutation] | None = None,
        faction_id: str | None = None,
        probability: float = 1.0,
        source_event_id: str | None = None,
        mission_id: str | None = None,
    ) -> SimEvent:
        """Create a new event and add it to the queue."""
        event = SimEvent(
            event_id=f"evt_{self._next_id}",
            event_type=event_type,
            description=description,
            faction_id=faction_id,
            scheduled_tick=scheduled_tick,
            probability=probability,
            mutations=mutations or [],
            mission_id=mission_id,
            source_event_id=source_event_id,
        )
        self._next_id += 1
        self.schedule(event)
        return event

    def pop_due_events(self, current_tick: int) -> list[SimEvent]:
        """Remove and return all events scheduled at or before current_tick."""
        due: list[SimEvent] = []
        remaining: list[SimEvent] = []

        for event in self._events:
            if event.scheduled_tick <= current_tick:
                due.append(event)
            else:
                remaining.append(event)

        self._events = remaining
        return due

    def peek_next_tick(self) -> int | None:
        """Return the tick of the next scheduled event, or None if empty."""
        if not self._events:
            return None
        return self._events[0].scheduled_tick

    def cancel_by_mission_id(self, mission_id: str) -> bool:
        """Remove all pending events for a given mission_id. Returns True if any removed."""
        before = len(self._events)
        self._events = [e for e in self._events if e.mission_id != mission_id]
        return len(self._events) < before

    def clear(self) -> None:
        """Remove all pending events."""
        self._events.clear()
