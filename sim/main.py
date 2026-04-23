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

def build_crud_url():
    url = os.getenv("SIM_URL")
    if not url:
        host = os.getenv("SIM_HOST", "cybermaze-crud")
        port = int(os.getenv("SIM_PORT", "3000"))
        url = f"http://{host}:{port}"
    return url

 
def print_ascii_layout(layout_lines):
    print("[LOADED] Hangar layout:")
    for line in layout_lines:
        print(line)


def fail(msg, code=1):
    print(f"[ERROR] {msg}")
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


async def _send_safe(ws, payload, to_remove):
    try:
        await ws.send(payload)
    except Exception:
        to_remove.append(ws)


# --- CRUD API Interaction ---

async def async_upsert_controller(evt, crud_url):
    def sync_post():
        try:
            r = requests.post(f"{crud_url}/controllers", json=evt, timeout=3)
            return r.status_code
        except Exception as e:
            print(f"[SIM][CRUD] upsert error: {e}")
            return None

    await asyncio.to_thread(sync_post)


async def async_update_player(player_id: int, payload: dict, crud_url: str):
    """Asynchronously PATCH player data to the CRUD API."""
    def sync_patch():
        try:
            r = requests.patch(f"{crud_url}/players/{player_id}", json=payload, timeout=3)
            return r.status_code, r.json()
        except Exception as e:
            print(f"[SIM][CRUD] patch player error: {e}")
            return None, None
    
    await asyncio.to_thread(sync_patch)


# --- Game Logic ---

def find_clear_position(spawn_cell, map_data, players_list, cell_size, radius_pixels, max_search=8):
    rows = len(map_data["map"])
    cols = len(map_data["map"][0]) if rows > 0 else 0

    sc = spawn_cell.get("c", 0)
    sr = spawn_cell.get("r", 0)

    cell_radius = max(1, int(ceil(radius_pixels / float(cell_size))))

    def cell_is_free(c, r):
        if c < 0 or r < 0 or r >= rows or c >= cols:
            return False
        return map_data["map"][r][c] == 0

    def collides_with_players(px, py):
        for p in players_list:
            ox = p.get("x", 0)
            oy = p.get("y", 0)
            dx = ox - px
            dy = oy - py
            if dx * dx + dy * dy < (2 * radius_pixels) ** 2:
                return True
        return False

    # search in expanding square rings around spawn cell
    for d in range(0, max_search + 1):
        for dx in range(-d, d + 1):
            for dy in range(-d, d + 1):
                # only check perimeter of current ring to prefer closer spots
                if abs(dx) != d and abs(dy) != d and d != 0:
                    continue
                c = sc + dx
                r = sr + dy
                # ensure candidate cell and neighbors within cell_radius are free (no walls)
                ok = True
                for nc in range(c - cell_radius, c + cell_radius + 1):
                    for nr in range(r - cell_radius, r + cell_radius + 1):
                        if not cell_is_free(nc, nr):
                            ok = False
                            break
                    if not ok:
                        break
                if not ok:
                    continue

                # convert to pixel center
                px = c * cell_size + cell_size / 2
                py = r * cell_size + cell_size / 2

                if collides_with_players(px, py):
                    continue

                return px, py

    # fallback: spawn center
    return spawn_cell["c"] * cell_size + cell_size / 2, spawn_cell["r"] * cell_size + cell_size / 2


async def async_instantiate_player(controller_id: str, state: WorldState, spawn: dict, map_data: dict, CELL_SIZE: int, crud_url: str):
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

    players = state.get_players()
    default_radius = CELL_SIZE * 0.35
    px, py = find_clear_position(spawn, map_data, players, CELL_SIZE, default_radius)


    stats_data = player.get("stats", {})
    if isinstance(stats_data, str):
        try:
            stats_data = json.loads(stats_data)
        except json.JSONDecodeError:
            stats_data = {}
    
    level = player.get("level", 1)
    base_hp = stats_data.get("base_hp", 100)
    base_energy = stats_data.get("base_energy", 100)
    
    max_hp = base_hp * (level * 0.8)
    max_energy = base_energy * (level * 0.6)

    ent = {
        "id": pid,
        "db_id": player.get("id"),
        "x": px,
        "y": py,
        "angle": 0.0,
        "color": player.get("neon_color", "#ffffff"),
        "hp": max_hp,
        "energy": max_energy,
        "max_hp": max_hp,
        "max_energy": max_energy,
    }

    for i, p in enumerate(list(players)):
        if p.get("id") == "p_01":
            try:
                players.pop(i)
            except Exception:
                pass
            break

    ent["x"] = px
    ent["y"] = py
    state.add_player(ent)
    print(f"[SIM] Instantiated player {pid} for controller {controller_id}")


async def async_execute_trigger_behavior(player_entity, rule, state: WorldState, crud_url):
    """Runs the corresponding logic when a trigger's condition is met."""
    behavior_type = rule.get("behavior_type")
    payload = rule.get("payload", {})
    if not behavior_type:
        return

    print(f"[SIM] Executing trigger for {player_entity['id']}: {behavior_type} with {payload}")

    if isinstance(payload, str):
        payload = json.loads(payload)

    if behavior_type == "CHANGE_PHASE":
        target_phase = payload.get("target_phase")
        if target_phase:
            state.set_game_phase(target_phase)

    elif behavior_type == "EQUIP_LOADOUT":
        db_id = player_entity.get("db_id")
        if not db_id:
            return
        
        update_payload = {}
        if "neon_color" in payload:
            new_color = payload.get("neon_color")
            update_payload["neon_color"] = new_color
            player_entity["color"] = new_color
        
        if update_payload:
            await async_update_player(db_id, update_payload, crud_url)


# --- Main Loop ---

async def broadcaster(state: WorldState, map_data, spawn, CELL_SIZE, PLAYER_SPEED, PLAYER_RADIUS, crud_url):
    interval = 1.0 / 60.0  # 60Hz
    try:
        while True:
            state.increment_tick()

            # Handle controller inputs
            for cid, info in list(state.controllers.items()):
                evt = info.get("event") if isinstance(info, dict) else info
                if not isinstance(evt, dict):
                    continue

                if evt.get("connected") and cid not in state.known_controllers:
                    state.add_known_controller(cid)
                    asyncio.create_task(async_upsert_controller(evt, crud_url))

                buttons = evt.get("buttons", {})
                if buttons.get("start") and cid not in state.instantiated_players:
                    state.add_instantiated_player(cid)
                    asyncio.create_task(async_instantiate_player(cid, state, spawn, map_data, CELL_SIZE, crud_url))

            # Physics and movements
            players_list = state.get_players()
            deadzone = float(os.getenv("SIM_DEADZONE", "0.1"))
            default_speed = CELL_SIZE * 0.09
            default_radius = CELL_SIZE * 0.35
            speed = PLAYER_SPEED if PLAYER_SPEED is not None else default_speed
            radius_px = PLAYER_RADIUS if PLAYER_RADIUS is not None else default_radius
            
            process_player_movements(state.world, state.controllers, state.instantiated_players,
                                     state.grid, speed, radius_px, deadzone)


            # Process triggers
            trigger_zones = map_data.get("triggerZones", [])
            for p in players_list:
                p.pop("active_trigger", None)
                player_in_zone = False
                for zone in trigger_zones:
                    rect, rule = zone.get("rect", [0,0,0,0]), zone.get("rule", {})
                    player_x, player_y = p["x"], p["y"]
                    zone_x, zone_y = rect[0] * CELL_SIZE, rect[1] * CELL_SIZE
                    zone_w, zone_h = rect[2] * CELL_SIZE, rect[3] * CELL_SIZE
                    
                    closest_x = max(zone_x, min(player_x, zone_x + zone_w))
                    closest_y = max(zone_y, min(player_y, zone_y + zone_h))
                    distance_x, distance_y = player_x - closest_x, player_y - closest_y

                    interaction_radius = radius_px
                    mode = rule.get("activation_mode")
                    if mode == "BUTTON_EDGE":
                        interaction_radius += 4

                    if (distance_x**2 + distance_y**2) < (interaction_radius**2):
                        player_in_zone = True
                        pid = p["id"]
                        if pid not in state.player_trigger_states:
                            state.player_trigger_states[pid] = {}

                        cid = pid.split('_')[1]
                        buttons = state.controllers.get(cid, {}).get("event", {}).get("buttons", {})
                        
                        if mode == "BUTTON_EDGE":
                            p["active_trigger"] = {"type": "button", "label": "SOUTH"}
                            last_south = state.get_player_trigger_state(pid).get("last_south_button", False)
                            current_south = buttons.get("south", False)
                            if current_south and not last_south:
                                asyncio.create_task(async_execute_trigger_behavior(p, rule, state, crud_url))
                            state.update_player_trigger_state(pid, "last_south_button", current_south)

                        elif mode == "TIME_HOLD":
                            progress = state.get_player_trigger_state(pid).get("progress", 0) + 1
                            state.update_player_trigger_state(pid, "progress", progress)
                            threshold = rule.get("activation_threshold", 1)
                            normalized_progress = min(progress / threshold, 1.0)
                            p["active_trigger"] = {"type": "hold", "progress": normalized_progress}
                            if normalized_progress >= 1.0:
                                asyncio.create_task(async_execute_trigger_behavior(p, rule, state, crud_url))
                                state.update_player_trigger_state(pid, "progress", 0)
                        break
                
                if not player_in_zone:
                    pid = p.get("id")
                    if pid and pid in state.player_trigger_states:
                        state.remove_player_trigger_state(pid)
            
            # Animate dummy player if present
            for p in players_list:
                if p.get("id") == "p_01":
                    t = state.world["tick"] / 60.0
                    base_x = spawn["c"] * CELL_SIZE + CELL_SIZE / 2
                    base_y = spawn["r"] * CELL_SIZE + CELL_SIZE / 2
                    radius = CELL_SIZE * 0.6
                    p["x"] = base_x + radius * math.cos(t)
                    p["y"] = base_y + radius * math.sin(t)
                    break

            # Broadcast world state
            payload = json.dumps(state.world)
            to_remove = []
            coros = [_send_safe(ws, payload, to_remove) for ws in list(state.clients)]
            if coros:
                await asyncio.gather(*coros)
            for ws in to_remove:
                state.remove_client(ws)

            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        return


# --- Server Setup ---

async def ws_handler(websocket, path, state: WorldState):
    state.add_client(websocket)
    try:
        async for _ in websocket:
            # Authoritative server, ignore client messages
            continue
    except websockets.ConnectionClosed:
        pass
    finally:
        state.remove_client(websocket)


async def serve(state: WorldState, map_data, CELL_SIZE, PLAYER_SPEED, PLAYER_RADIUS, ws_port, crud_url):
    async def handler_wrapper(*args):
        websocket = args[0] if args else None
        path = args[1] if len(args) > 1 else "/"
        if websocket:
            await ws_handler(websocket, path, state)

    spawn = next((s for s in map_data.get("playerSpawns", []) if s), 
                 {"c": len(map_data["map"][0]) // 2, "r": len(map_data["map"]) // 2})

    async with websockets.serve(handler_wrapper, "0.0.0.0", ws_port):
        nexus_uri = os.getenv("NEXUS_WS_URI", "ws://host.docker.internal:8765")
        ctask = asyncio.create_task(nexus_client.run_nexus_client(state.controllers, nexus_uri))
        btask = asyncio.create_task(broadcaster(state, map_data, spawn, CELL_SIZE, PLAYER_SPEED, PLAYER_RADIUS, crud_url))
        
        try:
            await asyncio.Future()  # Run forever
        finally:
            ctask.cancel()
            btask.cancel()


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

    layout = extract_layout_from_body(body)
    if not layout or not isinstance(layout, list):
        print(f"[DEBUG] Full CRUD response: {json.dumps(body)}")
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


    print(f"[READY] Parsed map successfully. Starting WebSocket server on port {ws_port}")
    try:
        asyncio.run(serve(state, map_data, CELL_SIZE, PLAYER_SPEED, PLAYER_RADIUS, ws_port, crud_url))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
