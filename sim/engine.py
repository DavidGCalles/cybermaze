import asyncio
import os
import math
import requests
import json
from math import ceil

from physics import process_player_movements
from state import WorldState
from network import Network

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


class Engine:
    def __init__(self, state: WorldState, network: Network, map_data: dict, crud_url: str, spawn: dict, cell_size: int, player_speed: float, player_radius: float):
        self.state = state
        self.network = network
        self.map_data = map_data
        self.crud_url = crud_url
        self.spawn = spawn
        self.cell_size = cell_size
        self.player_speed = player_speed
        self.player_radius = player_radius

    async def tick(self):
        self.state.increment_tick()

        # Handle controller inputs
        for cid, info in list(self.network.controllers.items()):
            evt = info.get("event") if isinstance(info, dict) else info
            if not isinstance(evt, dict):
                continue

            if evt.get("connected") and cid not in self.state.known_controllers:
                self.state.add_known_controller(cid)
                asyncio.create_task(async_upsert_controller(evt, self.crud_url))

            buttons = evt.get("buttons", {})
            if buttons.get("start") and cid not in self.state.instantiated_players:
                self.state.add_instantiated_player(cid)
                asyncio.create_task(async_instantiate_player(cid, self.state, self.spawn, self.map_data, self.cell_size, self.crud_url))

        # Physics and movements
        players_list = self.state.get_players()
        deadzone = float(os.getenv("SIM_DEADZONE", "0.1"))
        default_speed = self.cell_size * 0.09
        default_radius = self.cell_size * 0.35
        speed = self.player_speed if self.player_speed is not None else default_speed
        radius_px = self.player_radius if self.player_radius is not None else default_radius
        
        process_player_movements(self.state.world, self.network.controllers, self.state.instantiated_players,
                                    self.state.grid, speed, radius_px, deadzone)

        # Process triggers
        trigger_zones = self.map_data.get("triggerZones", [])
        for p in players_list:
            p.pop("active_trigger", None)
            player_in_zone = False
            for zone in trigger_zones:
                rect, rule = zone.get("rect", [0,0,0,0]), zone.get("rule", {})
                player_x, player_y = p["x"], p["y"]
                zone_x, zone_y = rect[0] * self.cell_size, rect[1] * self.cell_size
                zone_w, zone_h = rect[2] * self.cell_size, rect[3] * self.cell_size
                
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
                    if pid not in self.state.player_trigger_states:
                        self.state.player_trigger_states[pid] = {}

                    cid = pid.split('_')[1]
                    buttons = self.network.controllers.get(cid, {}).get("event", {}).get("buttons", {})
                    
                    if mode == "BUTTON_EDGE":
                        p["active_trigger"] = {"type": "button", "label": "SOUTH"}
                        last_south = self.state.get_player_trigger_state(pid).get("last_south_button", False)
                        current_south = buttons.get("south", False)
                        if current_south and not last_south:
                            asyncio.create_task(async_execute_trigger_behavior(p, rule, self.state, self.crud_url))
                        self.state.update_player_trigger_state(pid, "last_south_button", current_south)

                    elif mode == "TIME_HOLD":
                        progress = self.state.get_player_trigger_state(pid).get("progress", 0) + 1
                        self.state.update_player_trigger_state(pid, "progress", progress)
                        threshold = rule.get("activation_threshold", 1)
                        normalized_progress = min(progress / threshold, 1.0)
                        p["active_trigger"] = {"type": "hold", "progress": normalized_progress}
                        if normalized_progress >= 1.0:
                            asyncio.create_task(async_execute_trigger_behavior(p, rule, self.state, self.crud_url))
                            self.state.update_player_trigger_state(pid, "progress", 0)
                    break
            
            if not player_in_zone:
                pid = p.get("id")
                if pid and pid in self.state.player_trigger_states:
                    self.state.remove_player_trigger_state(pid)
        
        # Animate dummy player if present
        for p in players_list:
            if p.get("id") == "p_01":
                t = self.state.world["tick"] / 60.0
                base_x = self.spawn["c"] * self.cell_size + self.cell_size / 2
                base_y = self.spawn["r"] * self.cell_size + self.cell_size / 2
                radius = self.cell_size * 0.6
                p["x"] = base_x + radius * math.cos(t)
                p["y"] = base_y + radius * math.sin(t)
                break

    async def run(self):
        interval = 1.0 / 60.0  # 60Hz
        try:
            while True:
                await self.tick()
                await self.network.broadcast(self.state.world)
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            return
