"""
stream_verifier.py

Consumes messages from all three OpenMaven ingestion topics and prints a
formatted verification output to stdout. Intended for local development and
integration testing of the Layer 1 Kafka ingestion pipeline.
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
]

consumer: Consumer = Consumer(
    {
        "bootstrap.servers": BROKER,
        "group.id": GROUP_ID,
        "auto.offset.reset": "earliest",
    }
)


def decode_message(raw_value: bytes) -> dict[str, Any]:
    """Decode a raw Kafka message value from UTF-8 JSON bytes.

    Args:
        raw_value: The raw bytes value from a Kafka message.

    Returns:
        A dict representing the deserialised JSON payload.

    Raises:
        json.JSONDecodeError: If the message value is not valid JSON.
    """
    return json.loads(raw_value.decode("utf-8"))


def print_message(topic: str, payload: dict[str, Any]) -> None:
    """Print a cleanly formatted message receipt to stdout.

    Args:
        topic:   The Kafka topic the message was consumed from.
        payload: The deserialised message payload.
    """
    print("-" * 60)
    print(f"  Topic   : {topic}")
    print(f"  Payload : {json.dumps(payload, indent=4)}")
    print("-" * 60)


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
