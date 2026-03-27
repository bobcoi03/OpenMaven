"""
video_processor.py

PySpark Structured Streaming pipeline for Layer 2 of the OpenMaven platform.

Reads raw drone frame metadata from the 'drone_video_stream' Kafka topic,
simulates OpenCV-based object detection via a UDF, and writes enriched
detection records to the console for downstream inspection.
"""

import json
import random
from typing import Optional

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StringType

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

KAFKA_BROKER: str = "localhost:9092"
KAFKA_TOPIC: str = "drone_video_stream"
KAFKA_PACKAGE: str = "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0"

DETECTABLE_OBJECTS: list[str] = ["Tank", "Truck", "Personnel", "Artillery"]
CONFIDENCE_MIN: float = 0.70
CONFIDENCE_MAX: float = 0.99

# ---------------------------------------------------------------------------
# SparkSession
# ---------------------------------------------------------------------------


def build_spark_session() -> SparkSession:
    """Build and return a local SparkSession with the Kafka connector package.

    Returns:
        A configured SparkSession ready for structured streaming.
    """
    return (
        SparkSession.builder.appName("OpenMaven_VideoProcessor")
        .master("local[*]")
        .config("spark.jars.packages", KAFKA_PACKAGE)
        .getOrCreate()
    )


# ---------------------------------------------------------------------------
# Object detection simulation
# ---------------------------------------------------------------------------


def simulate_opencv_detection(payload_bytes: Optional[str]) -> str:
    """Simulate OpenCV object detection on a raw frame payload.

    In a production system this function would decode ``payload_bytes`` into
    a NumPy array and pass it through an object detection model (e.g. YOLO
    via cv2.dnn). Here we return randomly generated detections to stand in
    for real inference during development.

    Args:
        payload_bytes: The ``dummy_payload_bytes`` field from the Kafka
            message, representing raw image data.

    Returns:
        A JSON-serialised list of detection dicts, each containing:
        - ``label``      (str):   Detected object class.
        - ``confidence`` (float): Detection confidence score [0.70, 0.99].
    """
    if payload_bytes is None:
        return json.dumps([])

    num_detections: int = random.randint(1, 4)
    detections: list[dict] = [
        {
            "label": random.choice(DETECTABLE_OBJECTS),
            "confidence": round(random.uniform(CONFIDENCE_MIN, CONFIDENCE_MAX), 4),
        }
        for _ in range(num_detections)
    ]
    return json.dumps(detections)


# ---------------------------------------------------------------------------
# Stream construction
# ---------------------------------------------------------------------------


def read_kafka_stream(spark: SparkSession) -> DataFrame:
    """Create a streaming DataFrame subscribed to the drone video Kafka topic.

    Args:
        spark: An active SparkSession.

    Returns:
        A raw streaming DataFrame with Kafka metadata columns (key, value, …).
    """
    return (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BROKER)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", "earliest")
        .load()
    )


def parse_and_enrich(raw_df: DataFrame) -> DataFrame:
    """Parse the Kafka value column and apply the detection UDF.

    Steps:
    1. Cast the binary ``value`` column to a UTF-8 string.
    2. Extract ``frame_id`` and ``dummy_payload_bytes`` via ``from_json``.
    3. Apply the ``simulate_opencv_detection`` UDF to produce ``detected_objects``.

    Args:
        raw_df: The raw streaming DataFrame from :func:`read_kafka_stream`.

    Returns:
        An enriched streaming DataFrame with ``frame_id`` and
        ``detected_objects`` columns.
    """
    detection_udf = F.udf(simulate_opencv_detection, StringType())

    frame_schema = "frame_id STRING, dummy_payload_bytes STRING"

    parsed_df: DataFrame = (
        raw_df.select(F.col("value").cast("string").alias("raw_json"))
        .select(F.from_json(F.col("raw_json"), frame_schema).alias("data"))
        .select(
            F.col("data.frame_id").alias("frame_id"),
            F.col("data.dummy_payload_bytes").alias("dummy_payload_bytes"),
        )
    )

    enriched_df: DataFrame = parsed_df.withColumn(
        "detected_objects",
        detection_udf(F.col("dummy_payload_bytes")),
    ).select("frame_id", "detected_objects")

    return enriched_df


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    spark: SparkSession = build_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    raw_stream: DataFrame = read_kafka_stream(spark)
    enriched_stream: DataFrame = parse_and_enrich(raw_stream)

    query = (
        enriched_stream.writeStream.format("console")
        .outputMode("append")
        .option("truncate", False)
        .start()
    )

    print(
        f"[video_processor] Streaming from topic '{KAFKA_TOPIC}' — "
        "awaiting termination (Ctrl+C to stop)."
    )
    query.awaitTermination()
