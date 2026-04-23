import logging

from network import Network

logger = logging.getLogger(__name__)

class MapParser:
    async def parse(self, network: Network, grid, map_slug):
        # Fetch trigger rules from the database via the CRUD API
        triggers_by_coord = await network.fetch_map_triggers(map_slug)

        rows = len(grid)
        cols = len(grid[0]) if rows > 0 else 0

        mapData = {
            "map": [[0 for _ in range(cols)] for _ in range(rows)],
            "destructibles": [],
            "playerSpawns": [None, None, None, None],
            "staticEnemies": [],
            "emittersToCreate": [],
            "triggerZones": []
        }

        for r in range(rows):
            for c in range(cols):
                char = grid[r][c]
                val = 0
                if char == '#':
                    val = 1
                elif char == '+':
                    val = 2
                    mapData["destructibles"].append({"c": c, "r": r, "active": True})
                elif char == '_':
                    val = 3
                elif char == '^':
                    val = 4
                elif char == '1':
                    mapData["playerSpawns"][0] = {"c": c, "r": r}
                elif char == '2':
                    mapData["playerSpawns"][1] = {"c": c, "r": r}
                elif char == '3':
                    mapData["playerSpawns"][2] = {"c": c, "r": r}
                elif char == '4':
                    mapData["playerSpawns"][3] = {"c": c, "r": r}
                elif char == 'T':
                    rule = triggers_by_coord.get((c, r))
                    if rule:
                        zone = {
                            "rect": [c, r, 1, 1],
                            "rule": rule
                        }
                        mapData["triggerZones"].append(zone)
                        
                        # Assign tile IDs based on behavior for rendering, while preserving physics
                        if rule.get("behavior_type") == 'CHANGE_PHASE':
                            val = 6  # Solid terminal
                        elif rule.get("behavior_type") == 'EQUIP_LOADOUT':
                            val = 5  # Walkable pit
                        else:
                            val = 0 # Default for unknown behaviors
                    else:
                        val = 0 # No rule for this T, treat as empty
                elif char == 'x':
                    mapData["staticEnemies"].append({"c": c, "r": r, "type": "square"})
                elif char == 'o':
                    mapData["staticEnemies"].append({"c": c, "r": r, "type": "circle"})
                elif char == 'd':
                    mapData["staticEnemies"].append({"c": c, "r": r, "type": "diamond"})
                elif char == 'X':
                    mapData["emittersToCreate"].append({"c": c, "r": r, "type": "square"})
                elif char == 'O':
                    mapData["emittersToCreate"].append({"c": c, "r": r, "type": "circle"})
                elif char == 'D':
                    mapData["emittersToCreate"].append({"c": c, "r": r, "type": "diamond"})
                elif char == 'S':
                    mapData["emittersToCreate"].append({"c": c, "r": r, "type": "random"})
                else:
                    val = 0

                mapData["map"][r][c] = val

        return mapData
