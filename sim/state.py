import asyncio
import json
from grid import Grid

class WorldState:
    def __init__(self, map_data, cell_size, spawn):
        self.clients = set()
        self.controllers = {}
        self.known_controllers = set()
        self.instantiated_players = set()
        self.player_trigger_states = {}

        self.world = {
            "tick": 0,
            "state": "HANGAR_READY",
            "map": map_data["map"],
            "entities": {
                "players": [{
                    "id": "p_01", "x": spawn["c"] * cell_size + cell_size / 2,
                    "y": spawn["r"] * cell_size + cell_size / 2, "angle": 0.0,
                    "color": "#00ffff", "hp": 100, "energy": 75,
                    "max_hp": 100, "max_energy": 100
                }]
            }
        }
        self.grid = Grid(map_data["map"], cell_size, margin_left=0, margin_top=0)

    def add_client(self, ws):
        self.clients.add(ws)

    def remove_client(self, ws):
        self.clients.discard(ws)

    def update_controller(self, cid, event):
        self.controllers[cid] = event

    def add_known_controller(self, cid):
        self.known_controllers.add(cid)

    def add_instantiated_player(self, cid):
        self.instantiated_players.add(cid)

    def get_players(self):
        return self.world["entities"].get("players", [])

    def add_player(self, player_entity):
        self.get_players().append(player_entity)

    def remove_dummy_player(self):
        players = self.get_players()
        for i, p in enumerate(list(players)):
            if p.get("id") == "p_01":
                try:
                    players.pop(i)
                except Exception:
                    pass
                break
    
    def increment_tick(self):
        self.world["tick"] += 1

    def set_game_phase(self, phase):
        self.world["state"] = phase

    def update_player_trigger_state(self, pid, key, value):
        if pid not in self.player_trigger_states:
            self.player_trigger_states[pid] = {}
        self.player_trigger_states[pid][key] = value

    def get_player_trigger_state(self, pid):
        return self.player_trigger_states.get(pid, {})

    def remove_player_trigger_state(self, pid):
        self.player_trigger_states.pop(pid, None)

    async def broadcast(self):
        payload = json.dumps(self.world)
        to_remove = []
        coros = [_send_safe(ws, payload, to_remove) for ws in list(self.clients)]
        if coros:
            await asyncio.gather(*coros)
        for ws in to_remove:
            self.remove_client(ws)

async def _send_safe(ws, payload, to_remove):
    try:
        await ws.send(payload)
    except Exception:
        to_remove.append(ws)

