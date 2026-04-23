# ADR 001: Decoupling the Simulation Engine Monolith

* **Status:** Proposed
* **Date:** 2026-04-23

## Context and Problem Statement

The current simulation engine for Cybermaze V2 is concentrated almost entirely within a single file (`sim/main.py`). This "God Module" tightly couples WebSocket networking, CRUD API blocking calls, game loop execution, state mutation, and physics resolution. 

As we prepare for Phase 2 (introducing AI Finite State Machines, pathfinding, and projectile management), this architecture presents severe risks:
1. **Concurrency Hazards:** The global `world_state` dictionary is mutated in real-time by multiple async coroutines without strict boundaries.
2. **Coupling:** Network transport logic is inseparable from business rules (e.g., executing trigger behaviors is triggered directly inside the broadcaster loop).
3. **Maintainability:** Adding tactical AI to a 400+ line monolith will exponentially increase technical debt and create a "spaghetti" flow of data.

How should we restructure the simulation engine to ensure a deterministic, scalable, and transparent execution flow before adding new features?

## Decision Drivers

* **Separation of Concerns:** Networking, State Management, and Game Logic must be strictly isolated.
* **Determinism:** State mutations must happen in a predictable, controlled order.
* **Development Velocity:** The solution should not over-engineer the current MVP but must support the upcoming Phase 2 complexity.
* **Data Integrity:** Prevent race conditions in async operations.

## Considered Options

1.  **Option 1: Clean Architecture Split (Modular Separation)**
    * Deconstruct `sim/main.py` into distinct domains: `network.py` (transport), `engine.py` (game loop/tick), `state.py` (world state class), and `physics.py` (systems).
2.  **Option 2: Full Entity-Component-System (ECS) Architecture**
    * Rewrite the engine using a strict ECS pattern (e.g., using `esper` or a custom implementation) to handle entities, components (Position, Velocity), and systems (MovementSystem, CollisionSystem).
3.  **Option 3: Procedural Extraction (Band-aid)**
    * Keep the core loop in `main.py` but extract helper functions into separate files to reduce file size without changing the underlying architecture.
4.  **Option 4: Delay Refactoring**
    * Proceed with Phase 2 (AI and projectiles) in the current monolith and refactor only when performance or bugs force it.

## Decision Outcome

Chosen option: **Option 1: Clean Architecture Split (Modular Separation)**. 

We will halt all new feature development to decouple the simulation engine into distinct modules. This provides the most immediate value by eliminating the "God Module" anti-pattern without incurring the massive overhead of implementing a full ECS in Python right now. It creates a safe, transparent environment of pure logic where networking only transports data, and the game loop strictly manages the tick order.

### Consequences

* **Good, because** it immediately resolves the tight coupling between WebSockets and game logic.
* **Good, because** encapsulating the world state into a dedicated Class/Object prevents unstructured mutations and makes the data contract explicit.
* **Good, because** it sets a clear boundary for where Phase 2 code (AI FSM, Pathfinding) will live.
* **Bad, because** it requires a short-term freeze on gameplay features while the foundation is rebuilt.

## Pros and Cons of the Options

### Option 1: Clean Architecture Split
* `+` Drastically reduces cognitive load when modifying specific systems.
* `+` Highly testable (we can test the game loop without spinning up WebSockets).
* `-` Requires mapping out and untangling current async dependencies carefully.

### Option 2: Full Entity-Component-System (ECS)
* `+` The most scalable and performant architecture for complex game simulations.
* `-` Overkill for the current Python prototype. It would require rewriting the entire entity data structure (currently dictionaries) and physics logic from scratch.

### Option 3: Procedural Extraction
* `+` Fast to execute.
* `-` Does not solve the underlying architectural flaw (the broadcaster loop still dictates business logic). It just hides the issues in other files.

### Option 4: Delay Refactoring
* `+` Zero immediate refactoring cost.
* `-` Guarantees a critical failure during Phase 2. The technical debt will compound, making future refactoring significantly harder and error-prone.