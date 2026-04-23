import logging
import sys

def setup_logging():
    """Configures centralized logging for the simulation."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        stream=sys.stdout
    )

    # Example of setting a specific logger's level
    # logging.getLogger("sim.network").setLevel(logging.DEBUG)
