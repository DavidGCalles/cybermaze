# ADR 002: Transition to Delta Payloads and Dynamic Ballistics

* **Status:** Proposed
* **Date:** 2026-04-23

## Context and Problem Statement

As we enter Phase 2, the simulation must support high-frequency dynamic entities (bullets) and a mutable environment (destructible walls). 

Currently, the `sim/engine.py` broadcasts the full world state, including the entire 50x50 map matrix, at 60Hz. The Pixi.js frontend relies on a naive hash comparison of this map array; if the hash changes, it completely destroys and rebuilds the static geometry container. 

Introducing destructible walls under this architecture will trigger a full geometry rebuild on every bullet impact, collapsing the client's framerate and suffocating network bandwidth with redundant data. How can we support environmental mutation and high-volume projectiles without degrading real-time performance?

## Decision Drivers

* **Network Bandwidth:** The 60Hz tick payload must be as lightweight as possible.
* **Client Performance:** The renderer must update only the specific pixels/sprites that mutate, rather than repainting the entire stage.
* **Garbage Collection:** Bullet instantiation and destruction at high fire rates must not cause micro-stutters in the Python server loop.

## Considered Options

1. **Option 1: God Payload (Status Quo)**
   * Keep the map array in the tick payload. Let the client handle the rendering bottleneck.
2. **Option 2: Map Extraction and State Deltas**
   * Remove the static map from the 60Hz tick. Send the full map matrix only once during the initial connection handshake. Implement a discrete event system (Deltas) for environmental mutations (e.g., `WALL_DESTROYED`) so the client can perform surgical sprite removals.

## Decision Outcome

Chosen option: **Option 2: Map Extraction and State Deltas**. 

We will remove the map from the continuous broadcast loop. Environmental destruction will be handled via targeted delta events. This forces a clean separation between static geometry and dynamic entities, establishing a robust netcode foundation for Phase 2.

### Consequences

* **Good, because** it drastically reduces the byte size of the 60Hz payload.
* **Good, because** it guarantees stable 60 FPS on the client during heavy firefights by avoiding full WebGL container rebuilds.
* **Bad, because** it requires modifying the WebSocket connection flow to ensure the client receives the initial map before processing any ticks.

