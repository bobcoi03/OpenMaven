"""
stream_verifier.py

Consumes messages from all OpenMaven ingestion topics and prints a
formatted verification output to stdout. Intended for local development and
integration testing of the Layer 1 Kafka ingestion pipeline and the Smart
Maven simulation engine.

Terminal colour codes are used to visually distinguish simulation telemetry
from the original sensor topics. No external colour library is required.
"""

import json
from typing import Any

from confluent_kafka import Consumer, KafkaError, KafkaException

BROKER: str = "localhost:9092"
GROUP_ID: str = "maven_verifier_group"
TOPICS: list[str] = [
    "drone_video_stream",
    "comms_intelligence",
    "satellite_gps_telemetry",
    "smart_maven_telemetry",
]

# ANSI escape codes — fall back gracefully on terminals that ignore them
_RESET: str = "\033[0m"
_BOLD: str = "\033[1m"

# Per-topic colour palette
_TOPIC_COLOURS: dict[str, str] = {
    "drone_video_stream":    "\033[36m",   # Cyan
    "comms_intelligence":    "\033[33m",   # Yellow
    "satellite_gps_telemetry": "\033[34m", # Blue
    "smart_maven_telemetry": "\033[35m",   # Magenta — simulation traffic
}

# Fields surfaced in the compact summary line, in priority order.
# The first key present in the payload wins.
_SUMMARY_FIELDS: dict[str, list[str]] = {
    "drone_video_stream":    ["frame_id"],
    "comms_intelligence":    ["sender_id", "message"],
    "satellite_gps_telemetry": ["object_id", "latitude", "longitude"],
    "smart_maven_telemetry": ["asset_id", "asset_type", "asset_class",
                               "latitude", "longitude", "altitude"],
}

consumer: Consumer = Consumer(
    {
        "bootstrap.servers": BROKER,
        "group.id": GROUP_ID,
        "auto.offset.reset": "earliest",
    }
)


def decode_message(raw_value: bytes) -> dict[str, Any]:
    """Decode a raw Kafka message value from UTF-8 JSON bytes.

    Handles both the original sensor topics (frame_id, sender_id, object_id)
    and the Smart Maven simulation topic (asset_id, asset_type, lat/lon).

    Args:
        raw_value: The raw bytes value from a Kafka message.

    Returns:
        A dict representing the deserialised JSON payload.

    Raises:
        json.JSONDecodeError: If the message value is not valid JSON.
    """
    return json.loads(raw_value.decode("utf-8"))


def _build_summary(topic: str, payload: dict[str, Any]) -> str:
    """Extract a short human-readable summary line from the payload.

    Uses ``_SUMMARY_FIELDS`` to pick the most relevant fields for each topic
    so that high-volume simulation messages stay scannable at a glance.

    Args:
        topic:   The Kafka topic the message was consumed from.
        payload: The deserialised message payload.

    Returns:
        A compact key=value string, e.g. ``asset_id=abc123 asset_type=Tank``.
    """
    keys: list[str] = _SUMMARY_FIELDS.get(topic, list(payload.keys())[:3])
    parts: list[str] = [
        f"{k}={payload[k]}" for k in keys if k in payload
    ]
    return "  ".join(parts) if parts else "(no summary fields)"


def print_message(topic: str, payload: dict[str, Any]) -> None:
    """Print a colour-coded, formatted message receipt to stdout.

    Smart Maven simulation messages (``smart_maven_telemetry``) are rendered
    in magenta with a ``[SIM]`` prefix so they stand out from sensor data.
    All other topics use their own distinct colours.

    Args:
        topic:   The Kafka topic the message was consumed from.
        payload: The deserialised message payload.
    """
    colour: str = _TOPIC_COLOURS.get(topic, "")
    is_simulation: bool = topic == "smart_maven_telemetry"
    prefix: str = f"{_BOLD}[SIM]{_RESET}{colour} " if is_simulation else ""
    divider: str = colour + ("═" * 60 if is_simulation else "-" * 60) + _RESET

    print(divider)
    print(f"{colour}{prefix}{_BOLD}Topic{_RESET}{colour}   : {topic}{_RESET}")
    print(f"{colour}  Summary : {_build_summary(topic, payload)}{_RESET}")
    print(f"{colour}  Payload : {json.dumps(payload, indent=4)}{_RESET}")
    print(divider)


if __name__ == "__main__":
    consumer.subscribe(TOPICS)
    print(f"[stream_verifier] Subscribed to topics: {TOPICS}")
    print("[stream_verifier] Waiting for messages — press Ctrl+C to exit.\n")

    try:
        while True:
            msg = consumer.poll(1.0)

            if msg is None:
                continue

            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    # End of partition — not an error, just no new messages yet
                    continue
                raise KafkaException(msg.error())

            payload: dict[str, Any] = decode_message(msg.value())
            print_message(msg.topic(), payload)

    except KeyboardInterrupt:
        print("\n[stream_verifier] Interrupted — closing consumer...")
        consumer.close()
        print("[stream_verifier] Shutdown complete.")
