## Story 001-006: Refactor Dummy Entity as a Standard Game Character

**Description:**
As a developer, I need the "Dummy" player (`p_01`) to be treated as a standard game entity handled by the game loop's logic systems, rather than having its behavior hardcoded within the engine's core update routine.

**Technical Context:**
The method `_animate_dummy()` in `sim/engine.py` currently manipulates the coordinates of `p_01` directly. This bypasses the physics and behavior systems. To maintain architectural integrity, the dummy should be a regular `Player` entity whose inputs are driven by a simple "Automated/Test Controller" or a basic script, allowing it to go through the same movement and collision pipelines as human players.

**Acceptance Criteria:**
* The hardcoded `_animate_dummy()` method is completely removed from `SimulationEngine`.
* `p_01` is instantiated using the standard player creation flow.
* A simple "Auto-Input" mechanism is implemented (within the state or a dedicated system) to provide the movement vectors previously handled by the hardcoded animation.
* The dummy character's movement is correctly resolved by the `physics.py` module, respecting collisions and grid boundaries.