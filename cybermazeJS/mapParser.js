// mapParser.js
// ==========================================
// PARSER DE MAPAS A PARTIR DE SCHEMATICS
// ==========================================

class MapParser {
    parse(layout) {
        const rows = layout.length;
        const cols = layout[0].length;
        
        const mapData = {
            map: Array(rows).fill().map(() => Array(cols).fill(0)),
            destructibles: [],
            playerSpawns: [null, null, null, null],
            staticEnemies: [],
            emittersToCreate: []
        };

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const char = layout[r][c];
                let val = 0; // Por defecto suelo (.)

                switch(char) {
                    // TERRENO
                    case '#': val = 1; break; // Muro
                    case '+': 
                        val = 2; 
                        mapData.destructibles.push({ c, r, active: true });
                        break;
                    case '_': val = 3; break; // Base Aliada
                    case '^': val = 4; break; // Base Enemiga
                    
                    // SPAWNS JUGADOR
                    case '1': mapData.playerSpawns[0] = { c, r }; break;
                    case '2': mapData.playerSpawns[1] = { c, r }; break;
                    case '3': mapData.playerSpawns[2] = { c, r }; break;
                    case '4': mapData.playerSpawns[3] = { c, r }; break;

                    // ENEMIGOS ESTÁTICOS (Minúsculas)
                    case 'x': mapData.staticEnemies.push({ c, r, type: 'square' }); break;
                    case 'o': mapData.staticEnemies.push({ c, r, type: 'circle' }); break;
                    case 'd': mapData.staticEnemies.push({ c, r, type: 'diamond' }); break;

                    // GENERADORES / EMISORES (Mayúsculas)
                    case 'X': mapData.emittersToCreate.push({ c, r, type: 'square' }); break;
                    case 'O': mapData.emittersToCreate.push({ c, r, type: 'circle' }); break;
                    case 'D': mapData.emittersToCreate.push({ c, r, type: 'diamond' }); break;
                    case 'S': mapData.emittersToCreate.push({ c, r, type: 'random' }); break; // Legacy
                    
                    default: val = 0;
                }
                mapData.map[r][c] = val;
            }
        }
        return mapData;
    }
}
