# OpenMaven

Open-source intelligence platform that turns raw data into explorable knowledge graphs. Upload CSVs, PDFs, spreadsheets, or web pages — OpenMaven detects schemas, extracts entities, and builds a graph you can search, expand, and query with AI.

Inspired by Palantir Gotham. Built for analysts, researchers, and anyone working with messy, interconnected data.

## What It Does

- **Multi-format ingestion** — CSV, XLSX, JSON, PDF, DOCX, PPTX, HTML, URLs
- **Automatic KG construction** — LLM-powered entity/relationship extraction via neo4j-graphrag
- **Investigation graph** — Search to seed, click to inspect, double-click to expand neighbors
- **Entity detail panel** — Properties, relationships, and actions for any entity
- **AI query** — Ask questions about your knowledge graph in natural language
- **Table + Map views** — Browse all objects or view geolocated entities on a map

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4 |
| Graph Viz | react-force-graph-2d (canvas, force-directed) |
| Maps | MapLibre GL JS |
| Backend | FastAPI, Python 3.11 |
| Graph DB | Neo4j 5 (Docker) |
| KG Extraction | neo4j-graphrag (SimpleKGPipeline) with Anthropic + OpenAI |
| Package Mgr | pnpm (JS) + uv (Python) |

## Prerequisites

- **Node.js** >= 20 and **pnpm** (`npm i -g pnpm`)
- **Python** >= 3.11 and **uv** (`pip install uv` or `brew install uv`)
- **Docker** (for Neo4j)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/bobcoi03/OpenMaven.git
cd OpenMaven

# Frontend
cd apps/web
pnpm install
cd ../..

# Backend
cd apps/api
uv sync
cd ../..
```

### 2. Start Neo4j

```bash
docker compose up -d
```

This starts Neo4j on `bolt://localhost:7687` (browser at http://localhost:7474).

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=openmaven

# Optional: enable AI-powered KG extraction and querying
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional: load YC demo data on startup
# LOAD_SEED=true
```

**Without API keys:** Ingestion uses the flat CSV/document pipeline (schema detection + direct import). No LLM costs.

**With API keys:** Ingestion uses neo4j-graphrag SimpleKGPipeline for entity extraction. AI query endpoint becomes functional. Uses Claude Haiku (cheap).

### 4. Start the API

```bash
cd apps/api
uv run uvicorn main:app --reload --port 8000
```

### 5. Start the frontend

```bash
cd apps/web
pnpm dev
```

Open http://localhost:3000.

## Project Structure

```
/OpenMaven
  /apps
    /web                  # Next.js frontend
      /src
        /app/(dashboard)  # Graph, Table, Map, Sources pages
        /components       # App shell, graph view, entity panel, sources view
        /lib              # API client, data context, graph expander hook
    /api                  # FastAPI backend
      /routes             # ingest, query, ontology, objects, graph, search, health
      /ingestion          # CSV detector, document parser, URL fetcher
      /kg                 # neo4j-graphrag pipeline, Graphiti client
      /ontology           # Pydantic models, registry, STIX 2.1 aligned
      /store              # BaseStore ABC, MemoryStore, Neo4jStore
      /data/seed          # YC demo dataset (305 companies + founders)
  docker-compose.yml      # Neo4j
```

## Usage

1. **Upload data** — Go to Sources tab, drop files or paste a URL
2. **Search** — Type in the search bar to find entities
3. **Investigate** — Click a search result to seed the graph, double-click nodes to expand
4. **Inspect** — Single-click any node to see its properties and relationships
5. **Query** — Ask questions in the AI panel (right sidebar)

## Ingestion Pipeline Priority

1. **neo4j-graphrag** — LLM-powered KG extraction (if ANTHROPIC_API_KEY + OPENAI_API_KEY + NEO4J_URI set)
2. **Graphiti** — Temporal KG construction (if API keys set, fallback)
3. **Flat pipeline** — Schema detection + direct import (always available, no LLM cost)

## License

Apache 2.0 — see [LICENSE](LICENSE).
