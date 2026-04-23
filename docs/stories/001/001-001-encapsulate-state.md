## Story 001-001: Encapsulate Global State (`state.py`)

**Description:**
As a simulation engine, I need the world state and player information to be encapsulated in a dedicated, thread-safe data structure to prevent uncontrolled mutations and race conditions caused by the concurrent access of the current coroutines.

**Technical Context:**
Currently, `world_state` and `state` in `sim/main.py` are giant dictionaries passed by reference. Any module can alter the data directly (e.g., `players.append()` or `state["world"]["tick"] += 1`). We must create a `WorldState` class that exposes strict methods to mutate this data safely.

**Acceptance Criteria:**
* `sim/state.py` file is created.
* A `WorldState` class (or equivalent) exists, initializing the base state (map layout, entities, tick counter).
* State mutations (e.g., adding a player, updating controller inputs, changing game phases) are strictly performed through class methods, rather than direct dictionary manipulation.
* `sim/main.py` instantiates this class on startup and injects it as a dependency, replacing the raw dictionary construction.