## Story 001-004: Implement Centralized Logging (`logger.py`)

**Description:**
As a developer and system operator, I need a centralized logging configuration using Python's standard `logging` module to replace scattered `print()` statements, allowing me to trace errors, monitor network events, and debug engine physics deterministically with appropriate severity levels.

**Technical Context:**
Currently, the simulation engine relies on raw `print()` calls (e.g., `print(f"[SIM] Failed to obtain player...")`) spread across the codebase. In a containerized microservices architecture (Docker), we require structured logging directed to `stdout`/`stderr` with proper formatting (timestamp, log level, module name). We must establish a centralized configuration and utilize hierarchical loggers (e.g., `logging.getLogger("sim.network")`, `logging.getLogger("sim.engine")`) across all decoupled modules.

**Acceptance Criteria:**
* A central configuration module (`sim/logger.py`) is created to define standard formatters and handlers (at a minimum, a `StreamHandler` for console output).
* Hierarchical loggers are initialized at the top of each refactored module (e.g., `logger = logging.getLogger(__name__)`).
* All existing `print()` statements within the `sim/` directory are completely removed and replaced with appropriate logging calls (`logger.debug()`, `logger.info()`, `logger.warning()`, `logger.error()`).
* The defined log format explicitly includes the timestamp, severity level, module origin, and the message itself.