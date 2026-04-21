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
    # Track controllers already registered with CRUD and instantiated players
    state["known_controllers"] = set()
    state["instantiated_players"] = set()

    async def async_upsert_controller(evt):
        # Run the synchronous requests.post call in a thread to avoid blocking
        def sync_post():
            try:
                r = requests.post(f"{crud_url}/controllers", json=evt, timeout=3)
                return r.status_code
            except Exception as e:
                print(f"[SIM][CRUD] upsert error: {e}")
                return None

        await asyncio.to_thread(sync_post)

    async def async_instantiate_player(controller_id: str):
        # Ask CRUD for player profile (creates default if missing)
        def sync_get():
            try:
                r = requests.get(f"{crud_url}/players/by-controller/{controller_id}", timeout=5)
                if r.status_code == 200:
                    return r.json()
            except Exception as e:
                print(f"[SIM][CRUD] fetch/create player error: {e}")
            return None

        player = await asyncio.to_thread(sync_get)
        if not player:
            print(f"[SIM] Failed to obtain player for controller {controller_id}")
            return

        pid = f"p_{controller_id}"
        px = spawn["c"] * CELL_SIZE + CELL_SIZE / 2
        py = spawn["r"] * CELL_SIZE + CELL_SIZE / 2
        ent = {
            "id": pid,
            "x": px,
            "y": py,
            "angle": 0.0,
            "color": player.get("neon_color", "#ffffff"),
        }

        players = state["world"]["entities"].setdefault("players", [])
        # Remove placeholder static test subject if present
        for i, p in enumerate(list(players)):
            if p.get("id") == "p_01":
                try:
                    players.pop(i)
                except Exception:
                    pass
                break

        players.append(ent)
        print(f"[SIM] Instantiated player {pid} for controller {controller_id}")

    async def broadcaster():
        # 60Hz tick loop
        interval = 1.0 / 60.0
        try:
            while True:
                # Update world tick
                state["world"]["tick"] += 1

                # Handle controller inputs: register new controllers and instantiate players
                for cid, info in list(state["controllers"].items()):
                    evt = info.get("event") if isinstance(info, dict) else info
                    if not isinstance(evt, dict):
                        continue

                    # If controller connected, upsert into DB once
                    if evt.get("connected"):
                        if cid not in state["known_controllers"]:
                            state["known_controllers"].add(cid)
                            asyncio.create_task(async_upsert_controller(evt))

                    # If START pressed, instantiate a persistent player for this controller
                    buttons = evt.get("buttons", {})
                    if buttons.get("start"):
                        if cid not in state["instantiated_players"]:
                            state["instantiated_players"].add(cid)
                            asyncio.create_task(async_instantiate_player(cid))

                # Simple demo motion: slight circular motion for the dummy player (if still present)
                t = state["world"]["tick"] / 60.0
                base_x = spawn["c"] * CELL_SIZE + CELL_SIZE / 2
                base_y = spawn["r"] * CELL_SIZE + CELL_SIZE / 2
                radius = CELL_SIZE * 0.6
                # If placeholder player exists, animate it; otherwise leave instantiated players to be controlled
                players_list = state["world"]["entities"].get("players", [])
                if players_list:
                    # find placeholder by id
                    for p in players_list:
                        if p.get("id") == "p_01":
                            p["x"] = base_x + radius * __import__("math").cos(t)
                            p["y"] = base_y + radius * __import__("math").sin(t)
                            break

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
