## Story 001-005: Migrate to Native Async HTTP (`aiohttp`)

**Description:**
As a simulation engine, I need to perform non-blocking I/O operations when communicating with the CRUD API to ensure that the 60Hz game loop is never delayed by network latency or thread pool exhaustion.

**Technical Context:**
The current implementation uses `requests` (a synchronous library) wrapped in `asyncio.to_thread`. This is an anti-pattern in a high-frequency simulation loop as it relies on a finite thread pool and can lead to non-deterministic frame times if the API becomes slow. We must migrate to `aiohttp` to handle map fetching, player instantiation, and trigger execution as native asynchronous tasks.

**Acceptance Criteria:**
* `sim/requirements.txt` is updated to include `aiohttp` and remove `requests`.
* The `SimulationEngine` uses a persistent `aiohttp.ClientSession` for all CRUD communications.
* All `asyncio.to_thread` calls involving HTTP requests are replaced with native `await` calls using the async client.
* Error handling is implemented to ensure the engine remains stable if the CRUD service is temporarily unreachable.

This story is totally out of scope with ADR 001 but its a dangerous technical debt that needs to be addresed.