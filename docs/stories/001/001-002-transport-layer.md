## Story 001-002: Isolate the Transport Layer (`network.py`)

**Description:**
As an authoritative server, I need the network logic (client WebSockets and Nexus controller connections) to be completely decoupled from the game rules, ensuring the physics engine remains agnostic to how data is ingested or broadcasted.

**Technical Context:**
Functions like `ws_handler`, `serve`, `_send_safe`, and the `nexus_client` task are currently embedded in `main.py` and interact directly with the game loop. These must be extracted into a dedicated module that acts solely as a dumb data carrier.

**Acceptance Criteria:**
* `sim/network.py` file is created.
* All `websockets.serve` boilerplate and send/receive coroutines are migrated to this file.
* The network module accepts a `WorldState` instance (from 001-001) strictly for read-only packaging and broadcasting. It **must not** calculate collisions or process inputs.
* Incoming network events feed an isolated "input buffer", rather than injecting data directly into game entities in real-time.