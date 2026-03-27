# Project: OpenMaven

## What
OpenMaven is an open-source, autonomous surveillance analysis platform inspired by Palantir's Maven Smart System. It ingests real-time sensor data, extracts objects via computer vision, maps them into a shared relational structure, and applies strict rules of engagement.

## Architecture & Tech Stack
* **Layer 1 (Ingestion):** Apache Kafka (Topics: `drone_video_stream`, `comms_intelligence`, `satellite_gps_telemetry`)
* **Layer 2 (Extraction):** Apache Spark Streaming + OpenCV (Frame segmentation, object detection)
* **Layer 3 & 4 (Ontology & Graph):** Neo4j (Nodes/Edges mapping via Cypher queries)
* **Layer 5 (Policy Engine):** Open Policy Agent (OPA) / Rego (Rules of engagement)

## Coding Guidelines
* **Language:** Python 3.13
* **Typing:** Use strict, explicit type hinting for all variables, arguments, and return types.
* **Documentation:** Include clear, concise docstrings for all classes and functions.
* **Architecture:** Strictly separate infrastructure logic (e.g., Kafka producers/consumers) from core business logic.
* **Resilience:** Implement robust exception handling, especially for real-time streaming components.
* **Environment:** All code must be designed to run within the active `openmaven_env` virtual environment.

## Current Focus
We are in the initial setup phase. The immediate objective is implementing Layer 1: The Apache Kafka data ingestion engine.
