"""
global_stats_engine.py

PySpark Structured Streaming aggregation engine for the Smart Maven Strategic
Dashboard — Layer 2 of the OpenMaven platform.

Reads asset telemetry from the ``smart_maven_telemetry`` Kafka topic, applies
a 10-second event-time watermark to absorb late-arriving simulation data, then
computes a rolling summary table every 5 seconds grouped by ``asset_class``:

  - All classes:      count of active units in the current window.
  - Infrastructure:   average operational metric (efficiency / output / structural).
  - Military:         average speed (km/h) — a spike signals a coordinated push.

Output is written to the console in ``complete`` mode so the full aggregated
picture is reprinted on every trigger.
"""

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    DoubleType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

KAFKA_BROKER: str = "localhost:9092"
KAFKA_TOPIC: str = "smart_maven_telemetry"
KAFKA_PACKAGE: str = "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0"

WATERMARK_THRESHOLD: str = "10 seconds"
TRIGGER_INTERVAL: str = "5 seconds"

# Explicit schema for the incoming simulation JSON.
# ``status`` is present on Infrastructure assets; ``speed_kmh`` on mobile ones.
# Both fields are nullable so a single schema covers all asset subclasses.
TELEMETRY_SCHEMA: StructType = StructType(
    [
        StructField("timestamp",   TimestampType(), nullable=False),
        StructField("asset_id",    StringType(),    nullable=False),
        StructField("asset_type",  StringType(),    nullable=False),
        StructField("asset_class", StringType(),    nullable=False),
        StructField("latitude",    DoubleType(),    nullable=True),
        StructField("longitude",   DoubleType(),    nullable=True),
        # Infrastructure-only fields
        StructField("status",           StringType(), nullable=True),
        StructField("efficiency_pct",   DoubleType(), nullable=True),
        StructField("output_mw",        DoubleType(), nullable=True),
        StructField("structural_pct",   DoubleType(), nullable=True),
        # Mobile-only fields
        StructField("speed_kmh",    DoubleType(), nullable=True),
        StructField("heading_deg",  DoubleType(), nullable=True),
    ]
)

# ---------------------------------------------------------------------------
# SparkSession
# ---------------------------------------------------------------------------


def build_spark_session() -> SparkSession:
    """Build and return a local SparkSession configured for Kafka streaming.

    Returns:
        A :class:`~pyspark.sql.SparkSession` ready for structured streaming.
    """
    return (
        SparkSession.builder.appName("OpenMaven_GlobalStatsEngine")
        .master("local[*]")
        .config("spark.jars.packages", KAFKA_PACKAGE)
        # Complete-mode aggregations require in-memory state; keep it bounded.
        .config("spark.sql.streaming.stateStore.providerClass",
                "org.apache.spark.sql.execution.streaming.state"
                ".HDFSBackedStateStoreProvider")
        .getOrCreate()
    )


# ---------------------------------------------------------------------------
# Stream ingestion
# ---------------------------------------------------------------------------


def read_kafka_stream(spark: SparkSession) -> DataFrame:
    """Subscribe to the Smart Maven telemetry Kafka topic.

    Args:
        spark: An active :class:`~pyspark.sql.SparkSession`.

    Returns:
        A raw streaming :class:`~pyspark.sql.DataFrame` with Kafka metadata
        columns (key, value, topic, partition, offset, timestamp, …).
    """
    return (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BROKER)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", "earliest")
        .load()
    )


# ---------------------------------------------------------------------------
# Parsing & watermarking
# ---------------------------------------------------------------------------


def parse_telemetry(raw_df: DataFrame) -> DataFrame:
    """Cast the Kafka value to a string and parse all telemetry fields from JSON.

    Applies a 10-second event-time watermark on the ``timestamp`` field so
    that late-arriving messages (e.g. from a lagging simulation shard) are
    still included in the correct aggregation window rather than dropped.

    Args:
        raw_df: The raw Kafka :class:`~pyspark.sql.DataFrame` from
            :func:`read_kafka_stream`.

    Returns:
        A typed, watermarked :class:`~pyspark.sql.DataFrame` with columns
        matching :data:`TELEMETRY_SCHEMA`, plus the original Kafka
        ``timestamp`` renamed to ``event_time``.
    """
    return (
        raw_df.select(F.col("value").cast("string").alias("raw_json"))
        .select(
            F.from_json(F.col("raw_json"), TELEMETRY_SCHEMA).alias("d")
        )
        .select(
            F.col("d.timestamp").alias("event_time"),
            F.col("d.asset_id"),
            F.col("d.asset_type"),
            F.col("d.asset_class"),
            F.col("d.status"),
            F.col("d.efficiency_pct"),
            F.col("d.output_mw"),
            F.col("d.structural_pct"),
            F.col("d.speed_kmh"),
        )
        .withWatermark("event_time", WATERMARK_THRESHOLD)
    )


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


def build_aggregations(parsed_df: DataFrame) -> DataFrame:
    """Compute per-asset-class KPIs using a 5-second tumbling window.

    Aggregations produced:

    * ``active_units``      — COUNT of distinct asset IDs in the window.
    * ``avg_speed_kmh``     — mean speed of mobile (Military/Logistics) assets;
                              NULL for Infrastructure rows.
    * ``avg_health_metric`` — mean of whichever health column is populated
                              (efficiency_pct, output_mw, or structural_pct);
                              NULL for mobile rows.

    The ``COALESCE`` picks the first non-NULL health column per row, making
    the aggregation schema-agnostic to the specific metric name used by each
    Infrastructure subtype.

    Args:
        parsed_df: The watermarked, typed DataFrame from :func:`parse_telemetry`.

    Returns:
        An aggregated :class:`~pyspark.sql.DataFrame` with one row per
        ``asset_class`` per 5-second window.
    """
    # Unify the three infra health columns into a single nullable float
    health_col = F.coalesce(
        F.col("efficiency_pct"),
        F.col("output_mw"),
        F.col("structural_pct"),
    )

    return (
        parsed_df.groupBy(
            F.window("event_time", TRIGGER_INTERVAL),
            F.col("asset_class"),
        )
        .agg(
            F.count("asset_id").alias("active_units"),
            F.round(F.avg("speed_kmh"), 2).alias("avg_speed_kmh"),
            F.round(F.avg(health_col), 2).alias("avg_health_metric"),
        )
        # Flatten the window struct to separate start/end columns for readability
        .select(
            F.col("window.start").alias("window_start"),
            F.col("window.end").alias("window_end"),
            F.col("asset_class"),
            F.col("active_units"),
            F.col("avg_speed_kmh"),
            F.col("avg_health_metric"),
        )
        .orderBy("asset_class")
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    spark: SparkSession = build_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    raw_stream: DataFrame = read_kafka_stream(spark)
    parsed_stream: DataFrame = parse_telemetry(raw_stream)
    aggregated_stream: DataFrame = build_aggregations(parsed_stream)

    query = (
        aggregated_stream.writeStream.outputMode("complete")
        .format("console")
        .trigger(processingTime=TRIGGER_INTERVAL)
        .option("truncate", False)
        .option("numRows", 50)
        .start()
    )

    print(
        f"[global_stats_engine] Streaming from topic '{KAFKA_TOPIC}' — "
        f"aggregating every {TRIGGER_INTERVAL} with "
        f"{WATERMARK_THRESHOLD} watermark."
    )
    print("[global_stats_engine] Awaiting termination (Ctrl+C to stop).")
    query.awaitTermination()
