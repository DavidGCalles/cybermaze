# Architecture Document: Cybermaze V2 (Local Stack)

## 1. Scope and primary objective

This document defines the technical architecture and execution strategy for migrating Cybermaze. The goal is to transition the current browser-monolith prototype (Canvas rendering) to a containerized microservices architecture using Docker.

The system will adopt an authoritative client‑server topology, decoupling state and physics logic from the presentation layer. This ensures deterministic simulation, persistent data, and high-performance rendering.

## 2. System topology

The local stack will be orchestrated with `docker compose` and split into four dedicated services:

- **`cybermaze-db` (PostgreSQL)**: Persistence layer. The single source of truth for map schemas, entity archetypes, and game configuration.
- **`cybermaze-crud` (API)**: Data management service. Exposes database information via endpoints and isolates the simulation engine from heavy disk queries.
- **`cybermaze-sim` (Simulation Engine)**: Headless server (no rendering). Runs the real-time update loop (tick rate), resolves physics (collisions, pathfinding), manages player state, and emits world state.
- **`cybermaze-front` (Pixi.js Frontend)**: Dumb rendering client. Consumes simulation state over WebSocket and renders via WebGL with vector post-processing (Bloom/Glow filters).

## 3. Implementation strategy — Phase 1 (Walking Skeleton)

To reduce integration risk, the migration starts with a strict MVP named **Hangar**. This phase establishes a full communication pipeline from DB to renderer, exercising the infra with minimal game logic.

### 3.1 MVP startup and runtime flow

Persistence participates from the first millisecond to avoid hardcoded data in the simulation engine. Flow:

1. **Initial seed (DB)**: On stack startup, PostgreSQL is seeded with a single record containing the Hangar map matrix.
2. **Simulation bootstrap (Sim & CRUD)**: `cybermaze-sim` boots with player access closed, requests the Hangar schema from `cybermaze-crud`, parses it in-memory, then opens the WebSocket.
3. **Input ingestion (backend)**: Players connect; gamepad commands are sent to the server, where the engine computes movement and resolves collisions against the in-memory map.
4. **State emission (network)**: On each tick (e.g., 30 Hz), the server packages authoritative entity coordinates and broadcasts them to connected clients.
5. **Rendering (frontend)**: Pixi.js receives the payload, updates avatar positions, and renders the scene.
6. **State transitions**: When a player reaches a physical trigger in the Hangar and presses the confirm button, the server changes the global match state.

### 3.2 Base network contract (World State Payload)

To enable parallel development, the WebSocket state payload will initially follow this JSON structure:

```json
{
  "tick": 10245,
  "state": "HANGAR_READY",
  "entities": {
    "players": [
      {
        "id": "p_01",
        "x": 450.5,
        "y": 320.0,
        "angle": 1.57,
        "color": "#00ffff"
      }
    ]
  }
}
```

## 4. Future expansion phases

After Phase 1, the pipeline will be widened to absorb the original prototype logic:

- **Phase 2 — Tactical migration**: Move AI (FSM), pathfinding (A*), and projectile management to the authoritative server. Network payloads will expand to include enemies and projectiles.
- **Phase 3 — Smooth rendering**: Implement linear interpolation (LERP) in the Pixi.js client to smooth movement between server ticks.
- **Phase 4 — Level management**: Extend DB schema to store multiple maps (Operations, Survival), configurable at runtime via the CRUD service.

## 5. Legacy deprecation

The current codebase (`cybermazeJS`) will be frozen. Pure math and simulation logic will be extracted and adapted for the server; DOM-specific dependencies (Canvas API, `requestAnimationFrame`) will be removed.

---

If you want, I can also produce a shorter summary README or a `docker-compose` example for this stack.
