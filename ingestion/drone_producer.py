"""
drone_producer.py

Simulates a real-time drone video stream by producing mock frame metadata
payloads to the 'drone_video_stream' Kafka topic.
"""

import json
import random
import string
import time
import uuid
from datetime import datetime, timezone

from confluent_kafka import Producer

TOPIC: str = "drone_video_stream"
BROKER: str = "localhost:9092"

producer: Producer = Producer({"bootstrap.servers": BROKER})


def delivery_report(err: Exception | None, msg: object) -> None:
    """Callback invoked by confluent-kafka after each produce attempt.

    Args:
        err: Delivery error, or None on success.
        msg: The message object that was produced.
    """
    if err is not None:
        print(f"[drone_producer] Delivery FAILED | topic={msg.topic()} | error={err}")
    else:
        print(
            f"[drone_producer] Delivered | topic={msg.topic()} "
            f"partition={msg.partition()} offset={msg.offset()}"
        )


def generate_frame_payload() -> dict:
    """Generate a mock drone video frame metadata payload.

    Returns:
        A dict containing frame metadata suitable for JSON serialisation.
    """
    dummy_bytes: str = "".join(
        random.choices(string.ascii_letters + string.digits, k=64)
    )
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "frame_id": str(uuid.uuid4()),
        "resolution": "1080p",
        "dummy_payload_bytes": dummy_bytes,
    }


if __name__ == "__main__":
    print(f"[drone_producer] Starting — producing to topic '{TOPIC}' on {BROKER}")
    try:
        while True:
            payload: dict = generate_frame_payload()
            producer.produce(
                topic=TOPIC,
                value=json.dumps(payload).encode("utf-8"),
                callback=delivery_report,
            )
            producer.poll(0)
            print(f"[drone_producer] Sent frame_id={payload['frame_id']}")
            time.sleep(random.uniform(1, 2))
    except KeyboardInterrupt:
        print("\n[drone_producer] Interrupted — flushing remaining messages...")
        producer.flush()
        print("[drone_producer] Shutdown complete.")
