from grid import Grid

class WorldState:
    def __init__(self, map_data, cell_size, spawn):
        self.known_controllers = set()
        self.instantiated_players = set()
        self.player_trigger_states = {}
        self.player_shooting_states = {}

        self.world = {
            "tick": 0,
            "state": "HANGAR_READY",
            "map": map_data["map"],
            "entities": {
                "players": [],
                "bullets": []
            }
        }
        self.grid = Grid(map_data["map"], cell_size, margin_left=0, margin_top=0)

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
            if p.get("id") == "p_x":
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

    def update_player_shooting_state(self, pid, key, value):
        if pid not in self.player_shooting_states:
            self.player_shooting_states[pid] = {}
        self.player_shooting_states[pid][key] = value

    def get_player_shooting_state(self, pid):
        return self.player_shooting_states.get(pid, {})
