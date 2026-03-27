"""
gps_producer.py

Simulates a real-time satellite GPS telemetry stream by producing mock
positional data payloads to the 'satellite_gps_telemetry' Kafka topic.
"""

import json
import random
import time
import uuid
from datetime import datetime, timezone

from confluent_kafka import Producer

TOPIC: str = "satellite_gps_telemetry"
BROKER: str = "localhost:9092"

# Bounding box approximating a generic operational theatre (Middle East region)
LAT_MIN: float = 29.0
LAT_MAX: float = 37.0
LON_MIN: float = 38.0
LON_MAX: float = 48.0
ALT_MIN: float = 0.0
ALT_MAX: float = 5000.0

producer: Producer = Producer({"bootstrap.servers": BROKER})


def delivery_report(err: Exception | None, msg: object) -> None:
    """Callback invoked by confluent-kafka after each produce attempt.

    Args:
        err: Delivery error, or None on success.
        msg: The message object that was produced.
    """
    if err is not None:
        print(f"[gps_producer] Delivery FAILED | topic={msg.topic()} | error={err}")
    else:
        print(
            f"[gps_producer] Delivered | topic={msg.topic()} "
            f"partition={msg.partition()} offset={msg.offset()}"
        )


def generate_gps_payload() -> dict:
    """Generate a mock satellite GPS telemetry payload.

    Returns:
        A dict containing positional telemetry data suitable for JSON serialisation.
    """
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "object_id": str(uuid.uuid4()),
        "latitude": round(random.uniform(LAT_MIN, LAT_MAX), 6),
        "longitude": round(random.uniform(LON_MIN, LON_MAX), 6),
        "altitude": round(random.uniform(ALT_MIN, ALT_MAX), 2),
    }


if __name__ == "__main__":
    print(f"[gps_producer] Starting — producing to topic '{TOPIC}' on {BROKER}")
    try:
        while True:
            payload: dict = generate_gps_payload()
            producer.produce(
                topic=TOPIC,
                value=json.dumps(payload).encode("utf-8"),
                callback=delivery_report,
            )
            producer.poll(0)
            print(
                f"[gps_producer] Sent object_id={payload['object_id']} "
                f"lat={payload['latitude']} lon={payload['longitude']} "
                f"alt={payload['altitude']}m"
            )
            time.sleep(random.uniform(1, 2))
    except KeyboardInterrupt:
        print("\n[gps_producer] Interrupted — flushing remaining messages...")
        producer.flush()
        print("[gps_producer] Shutdown complete.")
