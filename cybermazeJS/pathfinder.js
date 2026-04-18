// pathfinder.js
// ==========================================
// MOTOR DE NAVEGACIÓN (A* ALGORITHM)
// ==========================================

class Pathfinder {
    constructor() {
        // Configuraciones de optimización
        this.maxIterations = 500; // Evita bloqueos si el destino es inalcanzable
    }

    /**
     * Calcula la ruta más corta entre A y B evitando muros.
     * @param {Array<Array<number>>} map - Matriz 2D del grid (0=Aire, 1/2=Muro).
     * @param {Object} start - {c, r} Coordenadas grid inicio.
     * @param {Object} end - {c, r} Coordenadas grid destino.
     * @returns {Array<Object>} - Lista de nodos {c, r} o [] si no hay camino.
     */
    findPath(map, start, end) {
        // 1. Validaciones rápidas
        if (!this.isValid(map, start) || !this.isValid(map, end)) return [];
        
        // Si el destino es una pared, intentamos buscar un vecino libre
        if (!this.isWalkable(map, end)) {
            const validNeighbor = this.findWalkableNeighbor(map, end);
            if (validNeighbor) {
                end = validNeighbor;
            } else {
                return []; // No se puede llegar
            }
        }

        // 2. Estructuras A*
        const openList = [];
        const closedSet = new Set();
        
        // Nodo Inicial
        const startNode = new PathNode(start.c, start.r, null);
        startNode.g = 0;
        startNode.h = this.heuristic(startNode, end);
        startNode.f = startNode.g + startNode.h;
        
        openList.push(startNode);

        let iterations = 0;

        // 3. Bucle Principal
        while (openList.length > 0) {
            // Freno de emergencia
            if (iterations++ > this.maxIterations) {
                // console.warn("Pathfinder: Max iterations reached");
                return []; 
            }

            // Ordenar por mejor coste F (Menor es mejor)
            // Nota: Para grids gigantes usaríamos un BinaryHeap, para 50x30 esto sobra.
            openList.sort((a, b) => a.f - b.f);
            const current = openList.shift();

            // ¿Hemos llegado?
            if (current.c === end.c && current.r === end.r) {
                return this.reconstructPath(current);
            }

            closedSet.add(`${current.c},${current.r}`);

            // Explorar Vecinos (4 Direcciones: Arriba, Abajo, Izq, Der)
            const neighbors = [
                { c: current.c, r: current.r - 1 },
                { c: current.c, r: current.r + 1 },
                { c: current.c - 1, r: current.r },
                { c: current.c + 1, r: current.r }
            ];

            for (let nPos of neighbors) {
                // Si ya lo visitamos o es muro, saltar
                if (closedSet.has(`${nPos.c},${nPos.r}`)) continue;
                if (!this.isWalkable(map, nPos)) continue;

                // Coste G (Distancia desde inicio)
                const gScore = current.g + 1;
                let gScoreIsBest = false;
                
                // Comprobar si ya está en la lista abierta
                const existingNode = openList.find(n => n.c === nPos.c && n.r === nPos.r);
                let neighborNode = existingNode;

                if (!existingNode) {
                    // Es un nodo nuevo
                    gScoreIsBest = true;
                    neighborNode = new PathNode(nPos.c, nPos.r, current);
                    neighborNode.h = this.heuristic(neighborNode, end);
                    openList.push(neighborNode);
                } else if (gScore < existingNode.g) {
                    // Es un camino mejor al mismo nodo
                    gScoreIsBest = true;
                    neighborNode = existingNode; // Reciclamos referencia
                    neighborNode.parent = current; // Cambiamos padre
                }

                if (gScoreIsBest) {
                    neighborNode.g = gScore;
                    neighborNode.f = neighborNode.g + neighborNode.h;
                }
            }
        }

        // Camino imposible
        return [];
    }

    // --- UTILIDADES ---

    isValid(map, p) {
        return p.r >= 0 && p.r < map.length && p.c >= 0 && p.c < map[0].length;
    }

    isWalkable(map, p) {
        if (!this.isValid(map, p)) return false;
        
        const cell = map[p.r][p.c];
        // AHORA PERMITIMOS: 0 (Aire), 3 (Base Aliada), 4 (Base Enemiga)
        // BLOQUEAMOS: 1 (Muro), 2 (Destructible)
        return cell === 0 || cell === 3 || cell === 4;
    }

    findWalkableNeighbor(map, p) {
        const dirs = [{c:0,r:-1}, {c:0,r:1}, {c:-1,r:0}, {c:1,r:0}];
        for (let d of dirs) {
            const neighbor = { c: p.c + d.c, r: p.r + d.r };
            if (this.isWalkable(map, neighbor)) return neighbor;
        }
        return null;
    }

    heuristic(a, b) {
        // Distancia Manhattan (Ideal para grid de 4 direcciones)
        return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
    }

    reconstructPath(node) {
        const path = [];
        let curr = node;
        while (curr.parent) { // No incluimos el nodo start, o sí? Normalmente hasta el padre
            path.push({ c: curr.c, r: curr.r });
            curr = curr.parent;
        }
        // El camino se reconstruye de Fin -> Inicio, así que invertimos
        return path.reverse();
    }
}

// Clase auxiliar ligera para nodos
class PathNode {
    constructor(c, r, parent = null) {
        this.c = c;
        this.r = r;
        this.parent = parent;
        this.g = 0; // Coste desde inicio
        this.h = 0; // Heurística hasta fin
        this.f = 0; // Coste Total (g + h)
    }
}