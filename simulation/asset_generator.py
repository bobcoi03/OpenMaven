"""
asset_generator.py

High-scale synthetic data engine for the Smart Maven Command & Control system.

Initialises a configurable fleet of geo-located assets, ticks their state
every HEARTBEAT_INTERVAL seconds, and streams every update to the Kafka topic
``smart_maven_telemetry`` via a non-blocking background producer thread.

A summary is printed every SUMMARY_INTERVAL seconds showing active asset count
and total messages dispatched.

Usage:
    python simulation/asset_generator.py
    python simulation/asset_generator.py --assets 5000
"""

import argparse
import json
import math
import queue
import random
import threading
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from confluent_kafka import Producer

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

KAFKA_BROKER: str = "localhost:9092"
KAFKA_TOPIC: str = "smart_maven_telemetry"
DEFAULT_ASSET_COUNT: int = 1_000
HEARTBEAT_INTERVAL: float = 2.0   # seconds between full-fleet state ticks
SUMMARY_INTERVAL: float = 5.0     # seconds between log summaries

# Theatre of Operations — 100 km × 100 km bounding box
# Approximate centre: Eastern Syria / Western Iraq border region
THEATRE_LAT_ORIGIN: float = 34.0
THEATRE_LON_ORIGIN: float = 40.0
KM_PER_DEGREE_LAT: float = 111.0
THEATRE_SIZE_KM: float = 100.0
THEATRE_LAT_DELTA: float = THEATRE_SIZE_KM / KM_PER_DEGREE_LAT
THEATRE_LON_DELTA: float = THEATRE_SIZE_KM / KM_PER_DEGREE_LAT  # approximation


# ---------------------------------------------------------------------------
# Asset taxonomy
# ---------------------------------------------------------------------------

class AssetClass(str, Enum):
    MILITARY = "Military"
    INFRASTRUCTURE = "Infrastructure"
    LOGISTICS = "Logistics"


# Speed envelopes in km/h → converted to degree-delta per tick
_SPEED_KMH: dict[str, tuple[float, float]] = {
    "Tank":        (20.0,  55.0),
    "Jet":         (500.0, 900.0),
    "Infantry":    (3.0,   8.0),
    "Truck":       (40.0,  90.0),
    "Cargo Plane": (400.0, 650.0),
}


def _kmh_to_deg_per_tick(kmh: float) -> float:
    """Convert km/h to degrees of lat/lon movement per HEARTBEAT_INTERVAL tick."""
    km_per_tick: float = kmh * (HEARTBEAT_INTERVAL / 3600.0)
    return km_per_tick / KM_PER_DEGREE_LAT


# ---------------------------------------------------------------------------
# Asset base class
# ---------------------------------------------------------------------------

@dataclass
class Asset(ABC):
    """Abstract base for all Smart Maven assets."""

    asset_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    asset_type: str = ""
    asset_class: AssetClass = AssetClass.MILITARY
    latitude: float = 0.0
    longitude: float = 0.0

    @abstractmethod
    def tick(self) -> None:
        """Advance this asset's state by one heartbeat interval."""

    def to_dict(self) -> dict[str, Any]:
        """Serialise the asset's current state to a JSON-compatible dict."""
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "asset_id": self.asset_id,
            "asset_type": self.asset_type,
            "asset_class": self.asset_class.value,
            "latitude": round(self.latitude, 6),
            "longitude": round(self.longitude, 6),
        }


# ---------------------------------------------------------------------------
# Mobile asset (Military & Logistics)
# ---------------------------------------------------------------------------

@dataclass
class MobileAsset(Asset):
    """An asset that moves along a random heading each tick."""

    heading_deg: float = field(default_factory=lambda: random.uniform(0, 360))
    speed_kmh: float = 0.0

    def tick(self) -> None:
        """Update position based on current heading and speed, with minor drift."""
        # Small heading drift keeps movement realistic rather than perfectly linear
        self.heading_deg = (self.heading_deg + random.uniform(-15, 15)) % 360

        deg_per_tick: float = _kmh_to_deg_per_tick(self.speed_kmh)
        rad: float = math.radians(self.heading_deg)
        self.latitude += deg_per_tick * math.cos(rad)
        self.longitude += deg_per_tick * math.sin(rad)

        # Clamp back inside the theatre bounding box
        self.latitude = max(
            THEATRE_LAT_ORIGIN,
            min(THEATRE_LAT_ORIGIN + THEATRE_LAT_DELTA, self.latitude),
        )
        self.longitude = max(
            THEATRE_LON_ORIGIN,
            min(THEATRE_LON_ORIGIN + THEATRE_LON_DELTA, self.longitude),
        )

    def to_dict(self) -> dict[str, Any]:
        base: dict[str, Any] = super().to_dict()
        base["heading_deg"] = round(self.heading_deg, 2)
        base["speed_kmh"] = round(self.speed_kmh, 2)
        return base


# ---------------------------------------------------------------------------
# Infrastructure asset
# ---------------------------------------------------------------------------

@dataclass
class InfrastructureAsset(Asset):
    """A static asset with a measurable operational metric."""

    metric_name: str = "efficiency_pct"
    metric_value: float = field(default_factory=lambda: random.uniform(85.0, 100.0))
    status: str = "OPERATIONAL"

    def tick(self) -> None:
        """Randomly drift the operational metric; occasionally degrade status."""
        self.metric_value = max(
            0.0,
            min(100.0, self.metric_value + random.uniform(-1.5, 1.5)),
        )
        if self.metric_value < 30.0:
            self.status = "CRITICAL"
        elif self.metric_value < 60.0:
            self.status = "DEGRADED"
        else:
            self.status = "OPERATIONAL"

    def to_dict(self) -> dict[str, Any]:
        base: dict[str, Any] = super().to_dict()
        base[self.metric_name] = round(self.metric_value, 2)
        base["status"] = self.status
        return base


# ---------------------------------------------------------------------------
# Asset factory
# ---------------------------------------------------------------------------

_ASSET_DEFINITIONS: list[dict[str, Any]] = [
    # Military
    {"type": "Tank",        "class": AssetClass.MILITARY,       "speed_range": _SPEED_KMH["Tank"]},
    {"type": "Jet",         "class": AssetClass.MILITARY,       "speed_range": _SPEED_KMH["Jet"]},
    {"type": "Infantry",    "class": AssetClass.MILITARY,       "speed_range": _SPEED_KMH["Infantry"]},
    # Infrastructure
    {"type": "Oil Plant",   "class": AssetClass.INFRASTRUCTURE, "metric": ("efficiency_pct",  85.0, 100.0)},
    {"type": "Power Grid",  "class": AssetClass.INFRASTRUCTURE, "metric": ("output_mw",       200.0, 500.0)},
    {"type": "Bridge",      "class": AssetClass.INFRASTRUCTURE, "metric": ("structural_pct",  70.0, 100.0)},
    # Logistics
    {"type": "Truck",       "class": AssetClass.LOGISTICS,      "speed_range": _SPEED_KMH["Truck"]},
    {"type": "Cargo Plane", "class": AssetClass.LOGISTICS,      "speed_range": _SPEED_KMH["Cargo Plane"]},
]


def _random_theatre_coords() -> tuple[float, float]:
    """Return a random (lat, lon) pair inside the theatre bounding box."""
    lat: float = THEATRE_LAT_ORIGIN + random.uniform(0, THEATRE_LAT_DELTA)
    lon: float = THEATRE_LON_ORIGIN + random.uniform(0, THEATRE_LON_DELTA)
    return lat, lon


def create_asset() -> Asset:
    """Instantiate a single random asset from the definition table.

    Returns:
        A fully initialised :class:`MobileAsset` or :class:`InfrastructureAsset`.
    """
    defn: dict[str, Any] = random.choice(_ASSET_DEFINITIONS)
    lat, lon = _random_theatre_coords()

    if defn["class"] == AssetClass.INFRASTRUCTURE:
        metric_name, metric_min, metric_max = defn["metric"]
        return InfrastructureAsset(
            asset_type=defn["type"],
            asset_class=defn["class"],
            latitude=lat,
            longitude=lon,
            metric_name=metric_name,
            metric_value=random.uniform(metric_min, metric_max),
        )

    speed_min, speed_max = defn["speed_range"]
    return MobileAsset(
        asset_type=defn["type"],
        asset_class=defn["class"],
        latitude=lat,
        longitude=lon,
        speed_kmh=random.uniform(speed_min, speed_max),
    )


def initialise_fleet(count: int) -> list[Asset]:
    """Create and return a fleet of ``count`` randomly typed assets.

    Args:
        count: Number of assets to initialise.

    Returns:
        A list of :class:`Asset` instances positioned inside the theatre.
    """
    return [create_asset() for _ in range(count)]


# ---------------------------------------------------------------------------
# Background Kafka producer thread
# ---------------------------------------------------------------------------

class KafkaProducerThread(threading.Thread):
    """Daemon thread that drains a shared queue and produces to Kafka.

    Using a dedicated thread decouples serialisation/IO from the main
    simulation tick loop, preventing back-pressure stalls when the broker
    is under load.

    Args:
        broker:    Kafka bootstrap server string.
        topic:     Target Kafka topic name.
        msg_queue: Shared :class:`queue.Queue` of pre-serialised JSON strings.
        sent_counter: Shared list used as a thread-safe accumulator (index 0).
    """

    def __init__(
        self,
        broker: str,
        topic: str,
        msg_queue: "queue.Queue[str]",
        sent_counter: list[int],
    ) -> None:
        super().__init__(daemon=True, name="KafkaProducerThread")
        self._broker = broker
        self._topic = topic
        self._queue = msg_queue
        self._counter = sent_counter
        self._producer = Producer(
            {
                "bootstrap.servers": self._broker,
                # Batching: wait up to 50 ms to accumulate messages before send
                "linger.ms": 50,
                # Larger batch size improves throughput at high message rates
                "batch.num.messages": 10_000,
                # Snappy compression reduces network I/O significantly
                "compression.type": "snappy",
                # Async delivery reports are fire-and-forget here; errors logged
                "error_cb": self._on_error,
            }
        )

    @staticmethod
    def _on_error(err: Any) -> None:
        """Global error callback for non-fatal producer errors."""
        print(f"[KafkaProducerThread] Producer error: {err}")

    def run(self) -> None:
        """Main loop: drain queue in micro-batches and produce to Kafka."""
        while True:
            # Drain up to 500 messages per iteration without blocking on empty
            batch: list[str] = []
            try:
                while len(batch) < 500:
                    batch.append(self._queue.get_nowait())
            except queue.Empty:
                pass

            for payload in batch:
                self._producer.produce(
                    topic=self._topic,
                    value=payload.encode("utf-8"),
                )
                self._counter[0] += 1

            if batch:
                # Trigger delivery callbacks without blocking
                self._producer.poll(0)
            else:
                # No work — yield the GIL briefly to avoid busy-spin
                time.sleep(0.001)


# ---------------------------------------------------------------------------
# Simulation engine
# ---------------------------------------------------------------------------

class SimulationEngine:
    """Orchestrates the fleet heartbeat loop and Kafka telemetry stream.

    Args:
        asset_count:        Number of assets to simulate.
        heartbeat_interval: Seconds between full-fleet state updates.
        summary_interval:   Seconds between summary log lines.
    """

    def __init__(
        self,
        asset_count: int = DEFAULT_ASSET_COUNT,
        heartbeat_interval: float = HEARTBEAT_INTERVAL,
        summary_interval: float = SUMMARY_INTERVAL,
    ) -> None:
        self._assets: list[Asset] = initialise_fleet(asset_count)
        self._heartbeat_interval = heartbeat_interval
        self._summary_interval = summary_interval

        self._msg_queue: "queue.Queue[str]" = queue.Queue(maxsize=0)
        self._sent_counter: list[int] = [0]  # mutable int via single-element list

        self._producer_thread = KafkaProducerThread(
            broker=KAFKA_BROKER,
            topic=KAFKA_TOPIC,
            msg_queue=self._msg_queue,
            sent_counter=self._sent_counter,
        )

    def _tick_and_enqueue(self) -> None:
        """Advance every asset one heartbeat and enqueue their serialised state."""
        for asset in self._assets:
            asset.tick()
            self._msg_queue.put(json.dumps(asset.to_dict()))

    def _log_summary(self, elapsed: float) -> None:
        """Print a human-readable simulation summary to stdout.

        Args:
            elapsed: Total wall-clock seconds since engine start.
        """
        print(
            f"[SimulationEngine] "
            f"uptime={elapsed:.0f}s | "
            f"active_assets={len(self._assets):,} | "
            f"messages_sent={self._sent_counter[0]:,} | "
            f"queue_depth={self._msg_queue.qsize():,}"
        )

    def run(self) -> None:
        """Start the producer thread and enter the main simulation loop.

        Blocks until interrupted by KeyboardInterrupt.
        """
        self._producer_thread.start()

        print(
            f"[SimulationEngine] Initialised {len(self._assets):,} assets in theatre "
            f"({THEATRE_LAT_ORIGIN}°N–{THEATRE_LAT_ORIGIN + THEATRE_LAT_DELTA:.2f}°N, "
            f"{THEATRE_LON_ORIGIN}°E–{THEATRE_LON_ORIGIN + THEATRE_LON_DELTA:.2f}°E)"
        )
        print(
            f"[SimulationEngine] Streaming to topic '{KAFKA_TOPIC}' on {KAFKA_BROKER}"
        )
        print("[SimulationEngine] Press Ctrl+C to stop.\n")

        start_time: float = time.monotonic()
        last_summary: float = start_time

        try:
            while True:
                tick_start: float = time.monotonic()
                self._tick_and_enqueue()

                now: float = time.monotonic()
                if now - last_summary >= self._summary_interval:
                    self._log_summary(now - start_time)
                    last_summary = now

                # Sleep only the remaining portion of the heartbeat window
                elapsed_tick: float = time.monotonic() - tick_start
                sleep_for: float = max(0.0, self._heartbeat_interval - elapsed_tick)
                time.sleep(sleep_for)

        except KeyboardInterrupt:
            print("\n[SimulationEngine] Shutdown requested — draining queue...")
            # Give the producer thread time to flush the remaining queue
            while not self._msg_queue.empty():
                time.sleep(0.1)
            print(
                f"[SimulationEngine] Done. Total messages sent: {self._sent_counter[0]:,}"
            )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Smart Maven synthetic asset telemetry generator."
    )
    parser.add_argument(
        "--assets",
        type=int,
        default=DEFAULT_ASSET_COUNT,
        help=f"Number of assets to simulate (default: {DEFAULT_ASSET_COUNT})",
    )
    args = parser.parse_args()

    engine = SimulationEngine(asset_count=args.assets)
    engine.run()
