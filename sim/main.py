import os
import sys
import time
import asyncio
import json

import requests
import websockets
import nexus_client

from map_parser import MapParser


def build_crud_url():
    url = os.getenv("SIM_URL")
    if not url:
        host = os.getenv("SIM_HOST", "cybermaze-crud")
        port = int(os.getenv("SIM_PORT", "3000"))
        url = f"http://{host}:{port}"
    return url


async def ws_handler(websocket, path, state):
    # Register client
    state["clients"].add(websocket)
    try:
        async for _ in websocket:
            # This server is authoritative and doesn't expect client messages,
            # but keep the connection open and ignore incoming data.
            continue
    except websockets.ConnectionClosed:
        return
    finally:
        state["clients"].discard(websocket)


def print_ascii_layout(layout_lines):
    print("[LOADED] Hangar layout:")
    for line in layout_lines:
        print(line)


def fail(msg, code=1):
    print(f"[ERROR] {msg}")
    sys.exit(code)


def main():
    crud_url = build_crud_url()
    slug = os.getenv("HANGAR_SLUG", "hangar")
    target = f"{crud_url}/maps/{slug}"

    print("[WAITING] Requesting Hangar layout...")
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

    layout = extract_layout_from_body(body)
    if not layout or not isinstance(layout, list):
        print(f"[DEBUG] Full CRUD response: {json.dumps(body)}")
        fail("No valid 'layout' array present in CRUD response")

    # Parse layout
    parser = MapParser()
    map_data = parser.parse(layout)

    # Print ASCII representation (original layout is already ASCII)
    print_ascii_layout(layout)

    # Prepare world state
    ws_port = int(os.getenv("SIM_WS_PORT", "4000"))
    print(f"[READY] Parsed map successfully. Starting WebSocket server on port {ws_port}")

    # Convert cell coordinates to pixel positions on a fixed scale
    CELL_SIZE = int(os.getenv("SIM_CELL_SIZE", "32"))

    # Choose a spawn for dummy player (first available spawn or center)
    spawn = None
    for s in map_data.get("playerSpawns", []):
        if s:
            spawn = s
            break
    if not spawn:
        spawn = {"c": len(map_data["map"][0]) // 2, "r": len(map_data["map"]) // 2}

    # World state template
    world_state = {
        "tick": 0,
        "state": "HANGAR_READY",
        "map": map_data["map"],
        "entities": {
            "players": [
                {
                    "id": "p_01",
                    "x": spawn["c"] * CELL_SIZE + CELL_SIZE / 2,
                    "y": spawn["r"] * CELL_SIZE + CELL_SIZE / 2,
                    "angle": 0.0,
                    "color": "#00ffff"
                }
            ]
        }
    }

    # Shared state for server
    # Add a controllers buffer to hold latest controller inputs from Nexus
    state = {"clients": set(), "world": world_state}
    state["controllers"] = {}

    async def broadcaster():
        # 60Hz tick loop
        interval = 1.0 / 60.0
        try:
            while True:
                # Update world tick
                state["world"]["tick"] += 1

                # Simple demo motion: slight circular motion for the dummy player
                t = state["world"]["tick"] / 60.0
                base_x = spawn["c"] * CELL_SIZE + CELL_SIZE / 2
                base_y = spawn["r"] * CELL_SIZE + CELL_SIZE / 2
                radius = CELL_SIZE * 0.6
                state["world"]["entities"]["players"][0]["x"] = base_x + radius * __import__("math").cos(t)
                state["world"]["entities"]["players"][0]["y"] = base_y + radius * __import__("math").sin(t)

                payload = json.dumps(state["world"]) 

                # Broadcast to all connected clients (remove closed ones)
                to_remove = []
                coros = []
                for ws in list(state["clients"]):
                    coros.append(_send_safe(ws, payload, to_remove))

                if coros:
                    await asyncio.gather(*coros)

                # Clean disconnected clients
                for ws in to_remove:
                    state["clients"].discard(ws)

                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            return

    async def _send_safe(ws, payload, to_remove):
        try:
            await ws.send(payload)
        except Exception:
            to_remove.append(ws)

    async def serve():
        # websockets.serve may call the handler with either (websocket, path)
        # or a single connection-like object depending on the library version.
        # Use a flexible wrapper that accepts any args and forwards websocket/path.
        async def handler(*args):
            websocket = None
            path = "/"
            if len(args) == 2:
                websocket, path = args[0], args[1]
            elif len(args) == 1:
                # Older/newer internals may pass a connection-like object.
                # Best-effort: treat it as the websocket and default path.
                websocket = args[0]
            else:
                # Unexpected signature; log and abort this connection.
                print(f"[WARN] handler received unexpected args: {args}")
                return

            await ws_handler(websocket, path, state)

        async with websockets.serve(handler, "0.0.0.0", ws_port):
            # Start Nexus client (consumes external controller events) and broadcaster
            nexus_uri = os.getenv("NEXUS_WS_URI", "ws://host.docker.internal:8765")
            ctask = asyncio.create_task(nexus_client.run_nexus_client(state["controllers"], nexus_uri))
            btask = asyncio.create_task(broadcaster())
            try:
                await asyncio.Future()  # run until cancelled
            finally:
                ctask.cancel()
                btask.cancel()

    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
