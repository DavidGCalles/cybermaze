class MapParser:
    def parse(self, layout):
        rows = len(layout)
        cols = len(layout[0]) if rows > 0 else 0

        mapData = {
            "map": [[0 for _ in range(cols)] for _ in range(rows)],
            "destructibles": [],
            "playerSpawns": [None, None, None, None],
            "staticEnemies": [],
            "emittersToCreate": []
        }

        for r in range(rows):
            for c in range(cols):
                char = layout[r][c]
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

                # set map cell (for spawns/enemies, map still gets default val)
                mapData["map"][r][c] = val

        return mapData
