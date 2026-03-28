# OpenMaven — Simulation Platform Plan

## Vision

OpenMaven is an open-source military simulation & C2 platform. Users download the repo, define a scenario (factions, assets, theatre), and run a simulation where they act as a commander — issuing strikes, moving assets, tasking sensors — and the system generates plausible consequences. Think Palantir Maven meets Paradox grand strategy.

The simulation loop: **User decides → mechanics resolve → world state updates → LLM generates strategic consequences → events unfold over time → user observes → decides again.**

---

## Architecture: The Simulation Loop

### How it works end-to-end

```
User action (strike, move, task sensor, change ROE)
  │
  ▼
RULES ENGINE (deterministic, math-based)
  - Strike resolution: weapon accuracy × target hardness × defenses
  - Movement: speed × terrain × distance
  - Sensor coverage: range, revisit rate, detection probability
  - Infrastructure cascades: power grid down → base loses radar
  │
  ▼
WORLD STATE UPDATES (immediate)
  - Asset statuses change (destroyed, damaged, repositioned)
  - Leaders removed/replaced
  - Faction capability scores recalculated
  - Ontology objects updated in the store
  │
  ▼
LLM CONSEQUENCE ENGINE (fires on significant events only)
  - Significant = strike, leader killed, faction loses >30% capability,
    alliance triggered, threshold crossed
  - LLM uses tools to pull relevant state (NOT the full 10k asset dump):
      get_faction_state(faction_id)
      get_assets_near(lat, lon, radius_km)
      get_asset_details(asset_id)
      run_cypher(query)
  - Returns structured events with probabilities and timelines
  │
  ▼
EVENT QUEUE
  - Events scheduled at future ticks (retaliation at tick+6, reinforcements at tick+12)
  - Each event fires at its scheduled tick
  - Each event updates world state via the rules engine
  - May trigger further LLM evaluation (cascading consequences)
  │
  ▼
WEBSOCKET BROADCAST
  - Diff pushed to all connected clients each tick
  - Map updates, alerts fire, targeting board refreshes
  │
  ▼
USER OBSERVES → DECIDES NEXT ACTION → LOOP REPEATS
```

### Real-time with pause

Not turn-based. The simulation ticks continuously — enemy acts on their own timelines. But the user can:
- **Pause** — freeze, inspect, issue orders, think
- **Play at 1x / 2x / 5x / 10x** — speed control
- **Step** — advance one tick at a time

### Where the simulation lives

The simulation engine runs **inside the FastAPI process** as an asyncio background task. No Kafka in the critical loop. Commands mutate state in the same process — zero latency. WebSocket broadcasts happen right after each tick. Kafka is a side-channel for external consumers (detection engine, logging, replay).

```
┌──────────────── API Process ────────────────┐
│                                             │
│  SimulationManager (holds all world state)  │
│    ├── tick_loop()     (background task)    │
│    ├── handle_command() (from WebSocket)    │
│    └── broadcast_diff() (to all clients)   │
│                                             │
│  LLM fires on significant events only      │
│  Kafka publish as side-effect (optional)    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Rules Engine: Category-Based, Not Per-Asset

Rules are defined per **category**. Assets inherit from their category. ~15 categories cover everything.

### Strike profiles (how hard things are to destroy)

```python
STRIKE_PROFILES = {
    "armored_vehicle":       StrikeProfile(hardness=0.8,  crew_survival=0.3),
    "soft_vehicle":          StrikeProfile(hardness=0.2,  crew_survival=0.1),
    "reinforced_structure":  StrikeProfile(hardness=0.9,  crew_survival=0.5),
    "light_structure":       StrikeProfile(hardness=0.3,  crew_survival=0.6),
    "infantry_squad":        StrikeProfile(hardness=0.05, crew_survival=0.4),
    "aircraft_grounded":     StrikeProfile(hardness=0.4,  crew_survival=0.2),
    "aircraft_airborne":     StrikeProfile(hardness=0.1,  crew_survival=0.05),
    "naval_vessel":          StrikeProfile(hardness=0.7,  crew_survival=0.4),
    "radar_installation":    StrikeProfile(hardness=0.5,  crew_survival=0.7),
    "supply_depot":          StrikeProfile(hardness=0.3,  crew_survival=0.8),
    "bridge":                StrikeProfile(hardness=0.6,  crew_survival=1.0),
    "command_node":          StrikeProfile(hardness=0.7,  crew_survival=0.5),
}

CATEGORY_MAP = {
    "Tank": "armored_vehicle", "APC": "armored_vehicle",
    "Truck": "soft_vehicle", "MRAP": "soft_vehicle",
    "Oil Plant": "reinforced_structure", "Power Grid": "reinforced_structure",
    "Infantry": "infantry_squad",
    "Jet": "aircraft_grounded",  # or aircraft_airborne if in flight
    "Cargo Plane": "aircraft_grounded",
    "Bridge": "bridge",
    ...
}
```

### Weapon profiles

```python
WEAPON_PROFILES = {
    "gbu_38_jdam":    WeaponProfile(accuracy=0.90, blast_radius_m=30,  penetration=0.7),
    "hellfire":       WeaponProfile(accuracy=0.85, blast_radius_m=15,  penetration=0.9),
    "artillery_155":  WeaponProfile(accuracy=0.60, blast_radius_m=50,  penetration=0.5),
    "cruise_missile": WeaponProfile(accuracy=0.92, blast_radius_m=40,  penetration=0.95),
    "mortar_81mm":    WeaponProfile(accuracy=0.50, blast_radius_m=20,  penetration=0.3),
}
```

### Strike resolution — one function

```python
def resolve_strike(weapon: WeaponProfile, target: StrikeProfile) -> StrikeResult:
    p_hit = weapon.accuracy
    p_destroy = p_hit * (weapon.penetration / max(target.hardness, 0.01))
    destroyed = random.random() < min(p_destroy, 1.0)
    ...
```

### Infrastructure cascading

Define dependency links in the ontology:
- Power Grid SUPPLIES Base → base loses radar if grid destroyed
- Bridge CONNECTS Region A to Region B → movement blocked if bridge destroyed
- Supply Depot SUPPLIES Forward Base → base degrades over time without resupply

These are just link types in the graph. When an asset is destroyed, walk its outgoing SUPPLIES/CONNECTS links and degrade the dependents.

---

## Faction Model

Each faction is a structured object in the ontology:

```python
@dataclass
class Faction:
    faction_id: str
    name: str
    doctrine: Doctrine           # AGGRESSIVE / DEFENSIVE / ASYMMETRIC / GUERRILLA
    leadership: list[Leader]     # ordered succession chain
    capability_score: float      # 0.0–1.0, recalculated from remaining assets
    morale: float                # 0.0–1.0, takes hits from losses
    alliances: list[str]         # faction IDs of allies
    resources: Resources         # fuel, ammo, manpower
    retaliation_threshold: float # capability loss % that triggers retaliation
    known_assets: list[str]      # asset IDs (what they know about the enemy)
```

The LLM gets this as structured JSON when reasoning about consequences. It can't generate responses that exceed the faction's actual capability — e.g., can't launch cruise missiles if the faction has none.

---

## LLM Consequence Engine

### When it fires

Not every tick. Only on **significant events**:
- A strike is executed
- A leader is killed or captured
- A faction's capability drops below a threshold
- An alliance obligation is triggered
- A geofence is breached by hostile assets
- User explicitly requests analysis

### How it gets context

Tool-calling pattern (already built for the query agent). The LLM has:

| Tool | What it returns |
|------|----------------|
| `get_faction_state(faction_id)` | Doctrine, capability, morale, leadership, resources |
| `get_assets_near(lat, lon, radius_km)` | Summary of nearby assets (not all 10k) |
| `get_asset_details(asset_id)` | Full metadata for one specific asset |
| `get_recent_events(faction_id, n)` | Last N events affecting this faction |
| `run_cypher(query)` | Arbitrary graph query for complex lookups |

### What it returns

Structured JSON — not free text:

```json
{
  "events": [
    {
      "description": "IRGC Commander Soleimani II assumes leadership",
      "type": "leadership_change",
      "faction_id": "red",
      "tick_delay": 1,
      "probability": 0.85,
      "mutations": [
        {"action": "update_leader", "faction_id": "red", "new_leader": "soleimani_ii"},
        {"action": "update_doctrine", "faction_id": "red", "doctrine": "AGGRESSIVE"}
      ]
    },
    {
      "description": "Retaliatory ballistic missile strike on Al-Asad Air Base",
      "type": "strike",
      "faction_id": "red",
      "tick_delay": 6,
      "probability": 0.60,
      "mutations": [
        {"action": "execute_strike", "target_id": "al_asad_base", "weapon": "ballistic_missile"}
      ]
    }
  ],
  "briefing": "Strike successful. HVT confirmed KIA. Expect retaliatory action within 12 hours..."
}
```

Each event has a `tick_delay` (when it fires) and `mutations` (structured ontology changes). The rules engine processes the mutations — the LLM never directly modifies state.

---

## User Actions

~10 action types, each maps to a structured mutation:

| Action | What it does |
|--------|-------------|
| **Strike** | Select target + weapon → rules engine resolves → LLM evaluates consequences |
| **Move asset** | Select asset + destination → movement over ticks based on speed/terrain |
| **Task ISR** | Point sensor at area → increases detection rate there |
| **Set ROE** | Change rules of engagement for a zone (aggressive / defensive / hold fire) |
| **Set alert zone** | Define geofence → get notified on breach |
| **Request analysis** | LLM summarizes activity in a region |
| **Allocate resources** | Move supply convoy to forward base (takes time) |
| **Request reinforcements** | Pull from reserves (delayed arrival) |
| **Nominate target** | Flag a detection as a formal target → enters targeting board |
| **Advance target** | Move target through workflow stages (DYNAMIC → ... → COMPLETE) |

---

## What the Friend is Building (Separate Branch)

**Branch:** `feature/detection-engine` off `main`
**Directory:** `apps/api/detection/`

**Task 1: Detection & Targeting Engine**
- `detection_engine.py` — pure function module, takes asset state dict → returns simulated CV detections
- `targeting_board.py` — state machine: DYNAMIC → PENDING_PAIRING → PAIRED → IN_EXECUTION → COMPLETE
- `alert_rules.py` — geofence/proximity math (haversine, point-in-box)
- `models.py` — dataclasses for Detection, Target, Alert, Zone
- No Kafka, no I/O — pure functions. Integration wired in later.

**Task 2: Expanded Asset Library**
- Add adversary equipment for: Russia, China, Iran, North Korea, Syria, ISIS, Hezbollah, Houthis
- For each asset type: find Sketchfab 3D model embed URL, add to `ASSET_EMBED_MAP`
- Workflow: web search asset types → search Sketchfab → grab embed URL → add to code → manual QA pass for bad picks (~20% need fixing)
- See `docs/adversary-assets.md` for the full reference catalog
- When no Sketchfab model exists, fall back to NATO symbology (already in codebase)

---

## Technical Execution Plan

### Phase 1: Simulation Core ✅ DONE

**1.1 — SimulationManager** `apps/api/simulation/`
- `manager.py` — world state, tick loop as asyncio task
- `rules.py` — strike/weapon profiles, resolve_strike(), infrastructure cascading
- `faction.py` — Faction dataclass, capability/morale
- `events.py` — EventQueue with scheduled events
- `profiles.py` — category tables

**1.2 — WebSocket Pipeline** `apps/api/ws/`
- Connection manager, broadcast diffs, frontend `useSimulation` hook

**1.3 — Live Map** `apps/web/`
- NATO symbology markers, speed controls, tick counter, 3D model embeds

### Phase 2: Actions, Commands & Design System ✅ DONE

**2.1 — Action Endpoints** — strike, move, set_speed via WebSocket
**2.2 — Action UI** — right-click context menu, move-to mode, strike confirmation
**2.3 — LLM Command Panel** — sim query agent with tool-calling
**2.4 — Design System** — `--om-*` CSS tokens, system font, Blueprint blue accent, design showcase page

### Phase 3: Fog of War & Sensors

The single biggest upgrade. Without it, the player is omniscient and there's no tension.

**3.1 — Detection Model** `apps/api/simulation/detection.py`
- Each tick: for each enemy asset, check if any friendly sensor can detect it
- Detection probability: `1.0 - (distance / sensor_range)^2` × asset signature value
- Signature values by type: MBT=0.9, Technical=0.6, Infantry=0.2, F-35=0.1, DDG=1.0
- Returns `{enemy_asset_id: Detection}` dict with position, confidence, detecting sensor

**3.2 — Fog of War Frontend**
- `simAssetsToTactical()` filters: always show own faction, only show enemies if detected
- "Ghost" markers: previously detected but now out-of-range enemies show faded at last-known position with age timestamp
- Sensor coverage overlay: semi-transparent circles for each friendly sensor range on map

**3.3 — Strike Targeting Fix**
- Right-clicking enemy shows "Strike" option → finds closest friendly asset with appropriate weapon → confirms the strike pairing
- Make it explicit in the UI: "REAPER-01 → GBU-38 → TARGET" so it's clear who is striking

### Phase 4: Fuel & Logistics

Assets have finite fuel. Adds urgency and forces real logistics decisions.

**4.1 — Fuel System** `apps/api/simulation/profiles.py`
- Add `FUEL_PROFILES` dict: fuel capacity (L), burn rate (L/km), terrain multiplier
- Key data: M1 Abrams 1900L/4.7L/km=400km, HMMWV 95L/0.16L/km=600km, F-16 550km combat radius, MQ-9 1850km range
- In `_tick_movement`: calculate distance traveled, call `consume_fuel()`, if fuel=0 → status=HOLDING (stranded), if fuel<20% → alert
- Aircraft: burn rate per minute (not per km), combat radius = half max range

**4.2 — Range Visualization (Frontend)**
- When selecting an asset in move mode, show translucent range circle on map
- `max_range_km = fuel_remaining / burn_rate_per_km`
- Concentric rings at 25/50/75/100% fuel for polish
- For aircraft: halve for combat radius (need fuel to return)

**4.3 — Resupply**
- `command_resupply(supplier_id, target_id)` — moves supplier to target, transfers fuel on arrival
- M977 HEMTT and CH-47 Chinook serve as resupply assets with `cargo_fuel_liters` field
- Supply depots act as infinite fuel sources within a radius

### Phase 5: Faction AI & Combat Behaviors

Enemy factions fight back. Three tiers of intelligence.

**5.1 — Rule-Based Reactive AI** `apps/api/simulation/combat_ai.py`
- Utility-based scoring system (not behavior trees — simpler to debug)
- Per-asset each tick: score HOLD, ENGAGE, RETREAT, SEEK_COVER, CALL_SUPPORT, ADVANCE
- Scoring factors: health (< 0.3 → retreat), threat proximity, numerical advantage (local allies vs threats within 10km), doctrine modifier
- Doctrine: AGGRESSIVE ×1.3 engage/advance, DEFENSIVE ×1.3 hold/retreat, GUERRILLA hit-and-run pattern
- Patrol zones: rectangular areas per faction, assets cycle through waypoints

**5.2 — Combat Behaviors**
- **Retreat when damaged**: health < 30% → move toward nearest FOB, status=RTB
- **Call for reinforcements**: outnumbered → broadcast contact event → nearby friendlies converge
- **Suppression**: under fire → reduce accuracy and speed for N ticks (`suppressed_until_tick`)
- **Cover bonus**: assets near structures get 20-40% damage reduction

**5.3 — LLM Faction Commander** `apps/api/simulation/consequence_engine.py`
- One LLM call per significant event per faction (not every tick)
- Triggers: strike executed, leader killed, capability < threshold, geofence breach
- Prompt includes: faction state, nearby assets, recent events, available commands
- Returns JSON array of commands: move, engage, retreat, hold, concentrate
- Cost: ~$0.00024/call (gpt-4o-mini), ~$0.012/hour of gameplay

### Phase 6: Road Pathfinding (OSRM)

Ground vehicles follow actual road networks instead of flying in straight lines.

**6.1 — Self-Hosted OSRM**
- Docker: `osrm/osrm-backend` with Syria/Iraq OSM extract from Geofabrik (~180MB)
- Preprocess with car.lua profile (or custom military vehicle profile)
- API: `GET /route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson`
- Response: distance, duration, GeoJSON LineString geometry

**6.2 — Integration with Sim**
- In `command_move`: if asset domain is ground, call OSRM → get waypoint list
- Store `waypoints: list[tuple[float, float]]` in MovementOrder
- In `_tick_movement`: interpolate along polyline (not straight line)
- Send full route to frontend → MapLibre draws as LineString layer
- Fallback: if OSRM unavailable, straight-line (current behavior)

**6.3 — Alternative: Valhalla**
- Built-in truck costing model with height/weight/width constraints (better for military vehicles)
- Isochrone generation: "area reachable within X hours" → irregular polygons following road density
- Dynamic costing: avoid certain roads per request without reprocessing
- Can replace OSRM if more realism needed

### Phase 7: OSM Infrastructure Integration

Real-world infrastructure as targetable objects. Power plants, bridges, oil facilities from OpenStreetMap.

**7.1 — Overpass API Queries**
- Self-hosted Overpass instance (Docker: `wiktorn/overpass-api`) with Middle East extract (~2GB)
- Query infrastructure within scenario bounding box: `[out:json]; nwr["power"="plant"](bbox); out center;`
- Tag mapping: `power=plant`, `aeroway=aerodrome`, `military=airfield`, `bridge=yes`, `industrial=refinery`, `man_made=petroleum_well`, `landuse=military`
- Returns JSON with lat/lon, name, type tags

**7.2 — Scenario Builder**
- Script: query Overpass → convert to SimAsset objects → inject into scenario
- Each infrastructure asset gets: position (lat/lon from OSM), type, hardness profile, dependency links
- Infrastructure cascading: destroy power plant → bases within 50km lose radar capability

**7.3 — Coverage Notes**
- Iraq: good coverage (airports, oil, power, military)
- Syria: 173k km roads mapped, major infrastructure present, some gaps in rural areas
- Military facilities: often under-mapped (intentional), use `landuse=military` outlines
- OSM data = baseline terrain layer; asset status (intact/destroyed) maintained separately in sim

### Phase 8: LLM Asset Pilots

Chat with individual friendly assets. The ultimate demo feature.

**8.1 — Per-Asset Chat Endpoint**
- `POST /api/simulation/chat/{asset_id}`
- System prompt: pilot personality, current status (position, fuel, health, weapons, contacts, orders)
- Military radio brevity, SALUTE reports, standard phraseology
- Natural language orders → extracted as structured commands via tool-calling

**8.2 — Chat UI**
- Chat input in asset detail panel (when friendly asset selected)
- Military-style terminal aesthetic
- Example: "REAPER-01, orbit Al-Mayadin and report vehicle movement" → pilot acknowledges, adjusts orbit
- Pilot expresses concern if ordered into danger with low fuel/health

**8.3 — Cost**
- ~500 tokens in + ~100 tokens out per message = ~$0.0001 per turn (gpt-4o-mini)
- Negligible even with heavy use

### Phase 9: Integration (Both)

**9.1 — Wire Detection Engine**
- Friend's detection module called from tick loop → detections feed into fog-of-war system
- Detection overlay on map (confidence badges, source labels)

**9.2 — Targeting Board**
- Kanban UI already exists at `/decisions`
- Wire to friend's targeting_board.py state machine
- Click target → highlights on map, shows detection details

**9.3 — Scenario System**
- YAML/JSON scenario files: theatre bounds, factions, initial asset placement, objectives, OSM infrastructure query bbox
- Load scenario → query OSM → populate assets → simulation starts
- Ship 2-3 scenarios: Syria/Iraq border, Strait of Hormuz, South China Sea island chain

---

## Phase 10+: Experimental / Future Vision

Ideas that push OpenMaven from "impressive simulation" to "holy shit" territory.

### 10.1 — Simulated Drone Feeds & Camera Views

The Palantir demo shows live drone video feeds alongside the map. We can simulate this.

**Approach A: Satellite imagery viewport (easiest)**
- MapLibre GL supports 3D terrain via `setTerrain()` with Mapbox/MapTiler DEM tiles
- Render a second MapLibre instance positioned at the drone's lat/lon/altitude, pitched 60-80° downward, bearing = drone heading
- This gives a "drone camera" view showing real satellite imagery of the terrain below
- Update position every tick as the drone moves — looks like a live feed
- Overlay: crosshairs, lat/lon readout, altitude bar, "FLIR" color filter (grayscale + white-hot)

**Approach B: Street-level imagery**
- [Mapillary](https://www.mapillary.com/) has free crowdsourced street-level imagery with API access
- For ground assets: show nearest street-level photo at asset's position
- Limited coverage in conflict zones but dramatic where available

**Approach C: AI-generated synthetic imagery (experimental)**
- Given lat/lon + altitude + heading, use an image generation model to create what a camera would see
- Train on satellite/aerial imagery for the theatre
- Very experimental but could produce convincing "sensor feeds"

### 10.2 — Real-Time Data Overlays

Layer real-world live data onto the simulation map alongside simulated assets.

| Data Source | What It Provides | API / Access |
|-------------|-----------------|-------------|
| **ADS-B Exchange / OpenSky Network** | Live aircraft positions globally (civilian + some military) | Free API, 5s updates |
| **MarineTraffic / AIS** | Live ship positions, vessel type, heading, speed | Free tier available |
| **GDELT Project** | Real-time news events geocoded to lat/lon, conflict/protest/disaster | Free, updated every 15 min |
| **ACLED** | Armed conflict events with precise lat/lon, fatalities, actor names | Free for researchers |
| **OpenWeatherMap** | Temperature, wind, cloud cover, precipitation | Free tier, affects sim ops |
| **Sentinel-2 (ESA)** | Free satellite imagery, 10m resolution, updated every 5 days | Copernicus Open Access Hub |
| **FIRMS (NASA)** | Active fire/thermal anomaly data globally | Free, near-real-time |

**Integration concept:** Toggle layers on/off in the map sidebar. Real ADS-B aircraft appear alongside simulated assets. GDELT news events show as markers with headlines. Weather affects sensor detection range and aircraft operations. Creates a "mixed reality" where simulated operations play out against a backdrop of real-world data.

### 10.3 — Replay & After-Action Review (AAR)

Record every tick's state diff. Play it back like a movie.

- **Event log:** Every action (user + AI) timestamped and stored
- **Replay mode:** Slider scrubs through tick history, map animates, events replay
- **LLM AAR:** After simulation ends, LLM generates a written after-action report: what happened, key turning points, what could have been done differently
- **Heat maps:** Show where most combat occurred, asset movement trails, sensor coverage over time

### 10.4 — Multiplayer (Adversarial)

Two players, two factions, fog of war between them.

- Each player only sees their own assets + detected enemies
- WebSocket rooms: player A's commands only affect faction A
- Could also do cooperative: two players commanding different aspects of the same faction (air commander + ground commander)
- Spectator mode: sees everything, useful for training/review

### 10.5 — Voice Commands

Speech-to-text for issuing orders. Extremely authentic military feel.

- Browser Web Speech API (free, built-in) or Whisper API
- "REAPER-01, this is OVERLORD, orbit grid reference 38SLH 445 608, report all movers"
- Parse with LLM → structured command → execute
- Audio feedback: text-to-speech for pilot responses (ElevenLabs or browser TTS)

### 10.6 — 3D Globe View (CesiumJS)

Strategic zoom-out showing the full theatre on a 3D globe.

- [CesiumJS](https://cesium.com/platform/cesiumjs/) — open-source 3D globe with terrain, buildings, satellite imagery
- Seamless transition: globe view (strategic) → map view (tactical) → street level (ground truth)
- Missile trajectories rendered as 3D arcs across the globe
- Satellite orbits visualized for ISR coverage windows

### 10.7 — Electronic Warfare & Cyber

- **Jamming:** EW assets reduce enemy sensor range within a radius
- **SIGINT:** Intercept enemy communications → reveal nearby enemy positions
- **Spoofing:** Create false radar contacts that enemy AI reacts to
- **Cyber attacks:** Degrade enemy C2 network → slower reaction time, reduced coordination
- All implemented as status effects on assets/factions, not actual network attacks

### 10.8 — Terrain & Weather Effects

- **Elevation data:** Mapbox Terrain-DEM tiles → line-of-sight calculations (can't see behind hills)
- **Weather zones:** Cloud cover reduces air sensor detection, rain slows ground movement by 30%, sandstorms reduce all sensor range by 50%
- **Night/day cycle:** Thermal sensors gain advantage at night, visual sensors degraded
- **Terrain speed modifiers:** Desert ×0.7, mountain ×0.3, urban ×0.5 for ground vehicles (already partially implemented)

### 10.9 — Intelligence Reports & Briefings

- LLM generates formatted intelligence products: INTSUM, SITREP, OPORD
- Updated automatically as situation evolves
- PDF/printable export for realism
- "Morning briefing" generated at simulation start summarizing known enemy disposition

### 10.10 — Diplomatic & Information Operations

- **Negotiate:** Open a channel with enemy faction (ceasefire, prisoner exchange, withdrawal terms)
- **Propaganda:** Information operations that affect enemy morale over time
- **Alliance management:** Request allied faction support, coordinate joint operations
- **Civilian impact tracking:** Collateral damage score, humanitarian corridor management

---

## MiroFish Patterns Worth Borrowing

From the MiroFish research (44k star social simulation engine):

1. **Document → KG → Agent pipeline** — they auto-extract entities from documents and turn them into agents. We can do the same: ingest an intelligence report → extract entities → populate the ontology → create faction/asset objects automatically.

2. **Graph memory feedback loop** — simulation events write back to the knowledge graph. Our ontology serves the same purpose: every consequence updates the graph, and future LLM calls read the updated graph.

3. **Pluggable graph storage** — their offline fork swaps between Neo4j, KuzuDB, Zep. We already have BaseStore → MemoryStore / Neo4jStore.

Key difference: MiroFish simulates social media opinion dynamics (abstract, no geography). We simulate physical military operations (spatial, ontological, kinetic). Completely different domain but similar architectural patterns.

---

## Palantir Maven Reference Architecture

What Maven does that we're replicating:

| Maven Feature | OpenMaven Equivalent |
|--------------|---------------------|
| Foundry (data ingestion from 150+ sources) | Kafka ingestion + simulation engine |
| Gaia (geospatial map with overlays) | Mapbox/MapLibre tactical map |
| Target Workbench (DRAFT → EXECUTION → CLOSED) | Targeting board state machine |
| Maverick (CV model deployment) | Simulated detection engine |
| Action types with submission criteria | Action endpoints with validation |
| Ontology (semantic + kinetic + dynamic layers) | STIX 2.1 ontology + rules engine + action system |
| Ava (LLM interface) | LLM command panel with tool-calling |
| Activities audit trail | Event log (every action + consequence recorded) |

What we're NOT replicating: real sensor feeds, real CV models, real classification security. Everything is simulated — that's the point.

---

## Asset Visualization (Option 3: NATO Symbols + 3D Models)

Two layers of asset rendering, matching how Palantir does it:

### Map Layer: MIL-STD-2525 NATO Symbology

On the tactical map (zoomed out, thousands of assets), use standard NATO military symbols:
- **Library:** [milsymbol](https://github.com/spatialillusions/milsymbol) — JS library that generates SVG symbols from SIDC codes
- Blue = friendly, Red = hostile, Green = neutral, Yellow = unknown
- Shape encodes type: rectangle = ground unit, diamond = armor, semicircle = air
- Small, lightweight SVGs — scales to thousands of markers on the map

### Detail Panel: 3D Asset Models

When clicking a specific asset, show a **3D model view** in the detail/telemetry panel (like Palantir's drone telemetry view with the MQ-9 Reaper):
- **Source:** Free models from [Sketchfab](https://sketchfab.com) (CC-licensed, low-poly military assets)
- **Renderer:** React Three Fiber (Three.js for React)
- **Models needed:** MQ-9 Reaper drone, Main Battle Tank (T-72/M1 style), Fighter Jet, Transport Helicopter, Cargo Plane, Infantry figure, Truck/MRAP, Naval vessel
- Model rotates based on live heading data from simulation
- Panel shows telemetry alongside: altitude, speed, heading, pitch/roll, sensor type, location (MGRS)
- Caption: "Notional model — may not reflect actual asset type" (same as Palantir)

### Asset model mapping

```
Asset Type      → Map Symbol (SIDC)              → 3D Model (Sketchfab)
Tank            → Ground unit, armored            → Low-poly MBT
Jet             → Air, fixed wing                 → Fighter jet
Infantry        → Ground unit, infantry           → Soldier figure
Truck           → Ground unit, logistics          → Military truck
Cargo Plane     → Air, cargo fixed wing           → C-130 style
Oil Plant       → Installation, petroleum         → Industrial structure
Power Grid      → Installation, electric power    → Power station
Bridge          → Installation, bridge            → Bridge structure
Drone (future)  → Air, UAV                        → MQ-9 Reaper
Helicopter (f.) → Air, rotary wing                → UH-60 style
Ship (future)   → Sea, surface                    → Frigate/destroyer
```

### Implementation phase

This is **Phase 5 (polish)** — do it after the core simulation loop, actions, and consequence engine are working. The map works fine with simple colored circles/icons initially. NATO symbols and 3D models are the upgrade that makes it look like a real C2 system.

---

## Git Strategy

```
main  ←  stable, merge via PRs only
  │
  ├── feature/detection-engine   (friend)
  │     └── apps/api/detection/
  │     └── apps/web/src/components/asset-detail-panel.tsx (Sketchfab embeds)
  │
  └── feature/<phase-name>       (you, one branch per phase)
        └── apps/api/simulation/
        └── apps/api/ws/
        └── apps/web/
```

Merge each phase to main via PR before starting the next. Friend's detection + asset library work is independent — no merge conflicts expected.

## Priority Matrix

| # | Feature | Complexity | Demo Impact | Depends On |
|---|---------|-----------|------------|------------|
| 3 | Fog of War & Sensors | Medium | **Very High** | — |
| 4 | Fuel & Logistics | Medium | High | — |
| 4.2 | Range Visualization | Low | High | Phase 4 |
| 5.1 | Rule-Based Faction AI | Medium | High | — |
| 5.2 | Combat Behaviors | Medium | Medium | Phase 5.1 |
| 6 | Road Pathfinding | Medium-High | **Very High** | Docker/OSRM |
| 5.3 | LLM Faction Commander | Medium | Very High | Phase 5.1 |
| 7 | OSM Infrastructure | Medium | High | Overpass setup |
| 8 | LLM Asset Pilots | Medium | **Extremely High** | — |
| 9 | Integration | Medium | High | Friend's work |
