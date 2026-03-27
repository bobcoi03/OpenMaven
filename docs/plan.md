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
**Directory:** `detection/` (repo root)

- `detection_engine.py` — Kafka consumer that reads simulation telemetry, generates simulated CV detections with confidence scores
- `targeting_board.py` — state machine: DYNAMIC → PENDING_PAIRING → PAIRED → IN_EXECUTION → COMPLETE
- `alert_rules.py` — geofence/proximity math (haversine, point-in-box)
- `models.py` — dataclasses for Detection, Target, Alert
- Tests for everything

This feeds into the targeting board UI and the detection overlay on the map.

---

## Technical Execution Plan

### Phase 1: Simulation Core (You)

**Branch:** `feature/realtime-ui` off `main`

**1.1 — SimulationManager**
`apps/api/simulation/`
- `manager.py` — holds world state (factions, assets, event queue), runs tick loop as asyncio task
- `rules.py` — strike profiles, weapon profiles, resolve_strike(), infrastructure cascading
- `faction.py` — Faction dataclass, capability recalculation, morale updates
- `events.py` — EventQueue with scheduled events, tick-based firing
- `profiles.py` — category tables (STRIKE_PROFILES, WEAPON_PROFILES, CATEGORY_MAP)

**1.2 — WebSocket Pipeline**
`apps/api/ws/`
- `connection_manager.py` — track connected clients, broadcast diffs
- WebSocket endpoint on FastAPI — clients subscribe, receive state diffs each tick
- Frontend hook (`useSimulation`) — connects, receives updates, patches local state

**1.3 — Live Map**
`apps/web/`
- Replace `tactical-mock.ts` with live WebSocket data
- Asset markers update positions each tick
- Speed controls: play / pause / 1x / 2x / 5x / 10x
- Tick counter display

### Phase 2: Actions & Commands (You)

**2.1 — Action Endpoints**
`apps/api/routes/actions.py`
- POST endpoints for each action type (strike, move, task_isr, set_roe, etc.)
- Each validates input, calls SimulationManager methods, returns result
- WebSocket broadcasts the mutation to all clients

**2.2 — Action UI**
- Right-click asset → context menu (Move, Strike, Details)
- Right-click map → context menu (Set alert zone, Task ISR here)
- Action confirmation dialogs with expected outcomes

**2.3 — LLM Command Panel**
- Chat panel on the right side
- Tool-calling agent with simulation-aware tools (get_faction_state, get_assets_near, etc.)
- Natural language commands translated to structured actions
- Briefing-style responses after significant events

### Phase 3: Consequence Engine (You)

**3.1 — LLM Integration**
`apps/api/simulation/consequence_engine.py`
- Triggered by significant events (not every tick)
- Tool-calling loop: pulls relevant state, generates structured events
- Returns events with probabilities, tick delays, and mutations
- Events injected into the EventQueue

**3.2 — Faction AI**
- Each hostile faction has autonomous behavior between LLM calls
- Simple rules: patrol routes, defend zones, respond to proximity alerts
- LLM handles the big strategic decisions; rules handle the routine

### Phase 4: Integration (Both)

**4.1 — Wire detection engine output to API**
- His detection engine writes to Kafka → your API consumes → targeting board UI populated
- Detection overlay on map (bounding boxes, confidence labels)

**4.2 — Targeting Board UI**
- Kanban-style board: DYNAMIC | PENDING PAIRING | PAIRED | IN EXECUTION | COMPLETE
- Drag targets between stages (or click advance)
- Click target → highlights on map, shows detection details

**4.3 — Scenario System**
- YAML/JSON scenario files defining: theatre bounds, factions, initial asset placement, objectives
- Load scenario → simulation initializes → user starts playing
- Ship 2-3 example scenarios (Syria/Iraq border, island assault, convoy defense)

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
  │     └── detection/
  │
  └── feature/realtime-ui        (you)
        └── apps/api/simulation/
        └── apps/api/ws/
        └── apps/api/routes/actions.py
        └── apps/web/ (map, WebSocket, action UI, command panel)
```

Directories don't overlap. Integration point is the ontology store. His work feeds data in, your work reads it out and displays it.
