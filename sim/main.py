import logging
import functools
import os
import sys
import time
import asyncio
import json
import math
from math import ceil

import requests
import websockets
import nexus_client

from map_parser import MapParser
from grid import Grid
from physics import process_player_movements
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


def fail(msg, code=1):
    logger.critical(msg)
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

def main():
    setup_logging()
    crud_url = build_crud_url()
    slug = os.getenv("HANGAR_SLUG", "hangar")
    target = f"{crud_url}/maps/{slug}"

    logger.info("Requesting Hangar layout...")
    try:
        resp = requests.get(target, timeout=10)
    except Exception as e:
        fail(f"Failed to contact CRUD at {target}: {e}")

    if resp.status_code != 200:
        fail(f"CRUD returned status {resp.status_code} when requesting {target}")

    try:
        body = resp.json()
    except Exception as e:
        fail(f"Invalid JSON response from CRUD: {e}")

    layout = extract_layout_from_body(body)
    if not layout or not isinstance(layout, list):
        logger.debug(f"Full CRUD response: {json.dumps(body)}")
        fail("No valid 'layout' array present in CRUD response")

    parser = MapParser()
    map_data = parser.parse(layout, slug, crud_url)
    print_ascii_layout(layout)

    ws_port = int(os.getenv("SIM_WS_PORT", "4000"))
    CELL_SIZE = int(os.getenv("SIM_CELL_SIZE", "32"))

    PLAYER_SPEED, PLAYER_RADIUS = None, None
    try:
        p_resp = requests.get(f"{crud_url}/params", timeout=3)
        if p_resp.status_code == 200:
            pbody = p_resp.json()
            if "PLAYER_SPEED" in pbody:
                try: PLAYER_SPEED = float(pbody["PLAYER_SPEED"])
                except: pass
            if "PLAYER_RADIUS" in pbody:
                try: PLAYER_RADIUS = float(pbody["PLAYER_RADIUS"])
                except: pass
    except Exception:
        pass

    spawn = next((s for s in map_data.get("playerSpawns", []) if s), 
                 {"c": len(map_data["map"][0]) // 2, "r": len(map_data["map"]) // 2})

    state = WorldState(map_data, CELL_SIZE, spawn)
    network = Network(ws_port)
    engine = Engine(state, network, map_data, crud_url, spawn, CELL_SIZE, PLAYER_SPEED, PLAYER_RADIUS)

    logger.info(f"Parsed map successfully. Starting WebSocket server on port {ws_port}")
    try:
        asyncio.run(network.run(engine.run))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
