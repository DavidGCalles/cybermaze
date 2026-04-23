## Story 001-003: Extract the Engine and Main Loop (`engine.py`)

**Description:**
As a developer, I need the 60Hz update cycle (Game Loop) to be a closed, purely logical system, allowing me to implement AI, projectiles, and pathfinding (Phase 2) without navigating web infrastructure or unstructured global states.

**Technical Context:**
The `broadcaster` function in `main.py` is currently a monolithic routine that increments ticks, processes inputs, triggers `process_player_movements` (physics), computes map trigger collisions, and handles async HTTP calls to the CRUD API. The server clock and business logic must be extracted into `engine.py`.

**Acceptance Criteria:**
* `sim/engine.py` file is created.
* It contains the core main loop (`tick()`) executing at a fixed interval (1/60s).
* On each tick, the engine executes operations sequentially: 
  1) Reads the input buffer.
  2) Invokes `physics.py` to resolve movements.
  3) Resolves map interactions (triggers).
  4) Updates the `WorldState`.
* `main.py` is reduced to a pure entry-point script: it loads environment variables, fetches the map from the CRUD, initializes the network, bootstraps the engine, and starts the async execution.