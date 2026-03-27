"""
comms_producer.py

Simulates a real-time communications intelligence stream by producing mock
intercepted tactical message payloads to the 'comms_intelligence' Kafka topic.
"""

import json
import random
import time
import uuid
from datetime import datetime, timezone

from confluent_kafka import Producer

TOPIC: str = "comms_intelligence"
BROKER: str = "localhost:9092"

TACTICAL_MESSAGES: list[str] = [
    "Target spotted",
    "Moving to extraction",
    "Requesting air support",
    "Hold position",
    "Package secured",
    "Perimeter breached",
    "Rally at checkpoint alpha",
    "Hostile vehicle approaching",
    "Grid confirmed, fire for effect",
    "Abort mission, fall back",
]

producer: Producer = Producer({"bootstrap.servers": BROKER})


def delivery_report(err: Exception | None, msg: object) -> None:
    """Callback invoked by confluent-kafka after each produce attempt.

    Args:
        err: Delivery error, or None on success.
        msg: The message object that was produced.
    """
    if err is not None:
        print(f"[comms_producer] Delivery FAILED | topic={msg.topic()} | error={err}")
    else:
        print(
            f"[comms_producer] Delivered | topic={msg.topic()} "
            f"partition={msg.partition()} offset={msg.offset()}"
        )


def generate_comms_payload() -> dict:
    """Generate a mock intercepted communications payload.

    Returns:
        A dict representing a tactical comms intercept, suitable for JSON serialisation.
    """
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sender_id": str(uuid.uuid4()),
        "receiver_id": str(uuid.uuid4()),
        "message": random.choice(TACTICAL_MESSAGES),
    }


if __name__ == "__main__":
    print(f"[comms_producer] Starting — producing to topic '{TOPIC}' on {BROKER}")
    try:
        while True:
            payload: dict = generate_comms_payload()
            producer.produce(
                topic=TOPIC,
                value=json.dumps(payload).encode("utf-8"),
                callback=delivery_report,
            )
            producer.poll(0)
            print(f"[comms_producer] Sent message='{payload['message']}'")
            time.sleep(random.uniform(1, 2))
    except KeyboardInterrupt:
        print("\n[comms_producer] Interrupted — flushing remaining messages...")
        producer.flush()
        print("[comms_producer] Shutdown complete.")
