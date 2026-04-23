import logging
import os
import sys
import asyncio
import json

from map_parser import MapParser
from state import WorldState
from network import Network
from engine import Engine
from logger import setup_logging

logger = logging.getLogger(__name__)
def build_crud_url():
    url = os.getenv("SIM_URL")
    if not url:
        host = os.getenv("SIM_HOST", "cybermaze-crud")
        port = int(os.getenv("SIM_PORT", "3000"))
        url = f"http://{host}:{port}"
    return url

 
def print_ascii_layout(layout_lines):
    logger.info("Hangar layout:")
    for line in layout_lines:
        logger.info(line)


def fail(msg, *args, code=1):
    logger.critical(msg, *args)
    sys.exit(code)


def extract_layout_from_body(body):
    layout = body.get("layout")

    # If the layout is a JSON-encoded string, decode it
    if isinstance(layout, str):
        try:
            decoded = json.loads(layout)
            layout = decoded
        except Exception:
            # fallback: splitlines (handles multi-line strings)
            lines = [l for l in layout.splitlines() if l.strip()]
            cleaned = [l.strip().strip('"') for l in lines]
            if cleaned:
                layout = cleaned

    return layout


# --- Server Setup ---

async def main():
    setup_logging()
    crud_url = build_crud_url()
    slug = os.getenv("HANGAR_SLUG", "hangar")
    ws_port = int(os.getenv("SIM_WS_PORT", "4000"))
    
    network = Network(crud_url, ws_port, map_data={})

    try:
        logger.info("Requesting Hangar layout...")
        body, error = await network.fetch_map_layout(slug)
        if error:
            fail(error)

        layout = extract_layout_from_body(body)
        if not layout or not isinstance(layout, list):
            logger.debug("Full CRUD response: %s", json.dumps(body))
            fail("No valid 'layout' array present in CRUD response")

        parser = MapParser()
        map_data = await parser.parse(network, layout, slug)
        print_ascii_layout(layout)

        network.map_data = map_data

        CELL_SIZE = int(os.getenv("SIM_CELL_SIZE", "32"))

        params = await network.fetch_params()
        PLAYER_SPEED = params.get("PLAYER_SPEED")
        PLAYER_RADIUS = params.get("PLAYER_RADIUS")
        try:
            if PLAYER_SPEED: PLAYER_SPEED = float(PLAYER_SPEED)
            if PLAYER_RADIUS: PLAYER_RADIUS = float(PLAYER_RADIUS)
        except (ValueError, TypeError):
            PLAYER_SPEED, PLAYER_RADIUS = None, None

        spawn = next((s for s in map_data.get("playerSpawns", []) if s), 
                     {"c": len(map_data["map"][0]) // 2, "r": len(map_data["map"]) // 2})

        state = WorldState(map_data, CELL_SIZE, spawn)
        engine = Engine(network, state, map_data, spawn=spawn, cell_size=CELL_SIZE, player_speed=PLAYER_SPEED or 2.0, player_radius=PLAYER_RADIUS or CELL_SIZE * 0.35)

        logger.info("Parsed map successfully. Starting WebSocket server on port %s", ws_port)
        await network.run(engine.run)

    except KeyboardInterrupt:
        pass
    finally:
        await network.close()


if __name__ == "__main__":
    asyncio.run(main())
