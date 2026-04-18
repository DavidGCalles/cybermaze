// grid.js
// ==========================================
// GESTOR DEL MAPA, PARSER Y FÍSICA ESTÁTICA
// ==========================================

class Grid {
    constructor(w, h) {
        this.width = w;
        this.height = h;
        this.cellSize = 0; 
        
        // DATOS DEL MAPA
        this.map = []; 
        
        // ENTIDADES DEL MAPA
        this.destructibles = []; 
        this.playerSpawns = [null, null, null, null]; 
        
        // NUEVO: Separación de enemigos
        this.staticEnemies = []; // { c, r, type } -> Se instancian al inicio
        this.emitters = [];      // { c, r, type, timer, cooldown } -> Generan enemigos
        
        this.enemySpawnCandidates = []; // Legacy (Procedural)

        this.pathfinder = new Pathfinder(); 
        this.mapParser = new MapParser(); 

        this.staticLayer = document.createElement('canvas');
        this.staticLayer.width = w;
        this.staticLayer.height = h;
        this.staticCtx = this.staticLayer.getContext('2d');
    }

    loadLevel(levelId, modeId) {
        console.log(`🗺️ CARGANDO NIVEL: ${levelId}`);
        this.reset();

        if (typeof LEVELS !== 'undefined' && LEVELS[levelId]) {
            // MODO ARQUITECTO
            const layout = LEVELS[levelId];
            const rows = layout.length;
            const cols = layout[0].length;
            
            this.cellSize = Math.min(this.width / cols, this.height / rows);
            this.marginLeft = (this.width - (this.cellSize * cols)) / 2;
            this.marginTop = (this.height - (this.cellSize * rows)) / 2;
            
            this.parseSchematic(layout, modeId);
        } else {
            // MODO ROBOT
            this.cellSize = Math.min(this.width / CONFIG.COLS, this.height / CONFIG.ROWS);
            this.marginLeft = (this.width - (this.cellSize * CONFIG.COLS)) / 2;
            this.marginTop = (this.height - (this.cellSize * CONFIG.ROWS)) / 2;
            
            this.generateProcedural(modeId);
        }

        this.bakeStaticLayer();
        return this.cellSize;
    }

    reset() {
        this.map = [];
        this.destructibles = [];
        this.playerSpawns = [null, null, null, null];
        this.staticEnemies = [];
        this.emitters = [];
        this.enemySpawnCandidates = [];
        this.staticCtx.clearRect(0, 0, this.width, this.height);
    }

    // ==========================================
    // PARSER AVANZADO (AHORA CON TIPOS)
    // ==========================================
    parseSchematic(layout, modeId) {
        const parsedData = this.mapParser.parse(layout);
        
        this.map = parsedData.map;
        this.destructibles = parsedData.destructibles;
        this.playerSpawns = parsedData.playerSpawns;
        this.staticEnemies = parsedData.staticEnemies;
        
        const mode = GAME_MODES.find(m => m.id === modeId) || { emitterStock: 0 };
        
        parsedData.emittersToCreate.forEach(emitter => {
            this.addEmitter(emitter.c, emitter.r, emitter.type, mode.emitterStock);
        });
    }

    addEmitter(c, r, type, stock) {
        // Configuramos el emisor con un cooldown inicial aleatorio para que no spawneen todos a la vez
        this.emitters.push({
            c, r,
            type: type,
            cooldown: 300, // 5 segundos base entre spawns (a 60fps)
            timer: Math.floor(Math.random() * 300),
            stock: stock
        });
    }

    // ==========================================
    // PROCEDURAL (LEGACY ADAPTER)
    // ==========================================
    generateProcedural(modeId) {
        this.map = Array(CONFIG.ROWS).fill().map(() => Array(CONFIG.COLS).fill(1));
        const wCorr = CONFIG.MAZE_CORRIDOR_WIDTH || 2;
        const step = wCorr * 2;
        const stack = [{ c: 1, r: 1 }];
        const carve = (r, c) => {
            for (let dr = 0; dr < wCorr; dr++) {
                for (let dc = 0; dc < wCorr; dc++) {
                    if (this.isValid(r + dr, c + dc)) this.map[r + dr][c + dc] = 0;
                }
            }
        };
        carve(1, 1);
        while (stack.length) {
            const cur = stack[stack.length - 1];
            const dirs = [[0, -step], [0, step], [-step, 0], [step, 0]].sort(() => Math.random() - 0.5);
            let found = false;
            for (let [dc, dr] of dirs) {
                const nc = cur.c + dc, nr = cur.r + dr;
                if (nc > 0 && nc < CONFIG.COLS - wCorr && nr > 0 && nr < CONFIG.ROWS - wCorr && this.map[nr][nc] === 1) { 
                    carve(cur.r + dr/2, cur.c + dc/2); carve(nr, nc);
                    stack.push({ c: nc, r: nr }); found = true; break;
                }
            }
            if (!found) stack.pop();
        }
        
        // Muros destructibles
        for (let r = 1; r < CONFIG.ROWS - 1; r++) {
            for (let c = 1; c < CONFIG.COLS - 1; c++) {
                if (this.map[r][c] === 1 && Math.random() < 0.3) {
                    this.map[r][c] = 2; 
                    this.destructibles.push({ c, r, active: true });
                }
            }
        }

        this.findStrategicSpawns(modeId);
    }

    findStrategicSpawns(modeId) {
        const candidates = [];
        const centerX = CONFIG.COLS / 2;
        const centerY = CONFIG.ROWS / 2;
        for (let r = 1; r < CONFIG.ROWS - 1; r++) {
            for (let c = 1; c < CONFIG.COLS - 1; c++) {
                if (this.map[r][c] === 0) {
                    const dist = Math.pow(c - centerX, 2) + Math.pow(r - centerY, 2);
                    candidates.push({ r, c, dist });
                }
            }
        }
        // Jugadores lejos
        candidates.sort((a, b) => b.dist - a.dist);
        this.playerSpawnCandidates = candidates.slice(0, 16);

        // Generadores cerca del centro
        candidates.sort((a, b) => a.dist - b.dist);
        const emitterCount = 4; 
        const mode = GAME_MODES.find(m => m.id === modeId) || { emitterStock: 0 };
        for(let i=0; i<emitterCount; i++) {
            const pt = candidates[i];
            if(pt) this.addEmitter(pt.c, pt.r, 'random', mode.emitterStock);
        }
    }

    getPlayerSpawn(playerIndex) {
        if (playerIndex !== undefined && this.playerSpawns[playerIndex]) {
            const pt = this.playerSpawns[playerIndex];
            return this.gridToPixel(pt.r, pt.c);
        }
        if (this.playerSpawnCandidates && this.playerSpawnCandidates.length > 0) {
            const idx = Math.floor(Math.random() * this.playerSpawnCandidates.length);
            const pt = this.playerSpawnCandidates[idx];
            return this.gridToPixel(pt.r, pt.c);
        }
        return this.gridToPixel(1, 1);
    }

    // ==========================================
    // RENDER & FÍSICA
    // ==========================================
    bakeStaticLayer() {
        const ctx = this.staticCtx;
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        const rows = this.map.length;
        const cols = this.map[0].length;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = this.marginLeft + c * this.cellSize;
                const y = this.marginTop + r * this.cellSize;
                const val = this.map[r][c];

                if (val === 1) { // Muro
                    ctx.strokeStyle = CONFIG.WALL_NEON || '#0088ff';
                    ctx.shadowColor = CONFIG.WALL_NEON || '#0088ff';
                    ctx.shadowBlur = 10;
                    ctx.strokeRect(x, y, this.cellSize, this.cellSize);
                    ctx.shadowBlur = 0;
                } 
                else if (val === 3) { // Base Aliada
                    this.drawBase(ctx, x, y, '#00ffff', 'A');
                }
                else if (val === 4) { // Base Enemiga
                    this.drawBase(ctx, x, y, '#ff0033', 'E');
                }
            }
        }
    }

    drawBase(ctx, x, y, color, label) {
        ctx.fillStyle = color + '22'; // Transparencia hex
        ctx.fillRect(x, y, this.cellSize, this.cellSize);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x+4, y+4, this.cellSize-8, this.cellSize-8);
        ctx.fillStyle = color;
        ctx.font = `${this.cellSize/2}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + this.cellSize/2, y + this.cellSize/2);
    }

    draw(ctx) {
        ctx.drawImage(this.staticLayer, 0, 0);
        
        // Muros Destructibles
        ctx.strokeStyle = CONFIG.DEST_WALL_COLOR || '#ffcc00';
        ctx.shadowColor = CONFIG.DEST_WALL_COLOR || '#ffcc00';
        ctx.shadowBlur = 5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.destructibles.forEach(d => {
            if (d.active) {
                const x = this.marginLeft + d.c * this.cellSize;
                const y = this.marginTop + d.r * this.cellSize;
                const pad = 4;
                const size = this.cellSize - (pad * 2);
                ctx.rect(x + pad, y + pad, size, size);
                ctx.moveTo(x + pad, y + pad);
                ctx.lineTo(x + pad + size, y + pad + size);
                ctx.moveTo(x + pad + size, y + pad);
                ctx.lineTo(x + pad, y + pad + size);
            }
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        // DIBUJAR EMISORES (Visualmente Distintos)
        this.emitters.forEach(e => {
            const pt = this.gridToPixel(e.r, e.c);
            const size = this.cellSize * 0.6;
            
            ctx.fillStyle = '#222';
            ctx.strokeStyle = '#ff00ff'; // Magenta neon
            ctx.lineWidth = 2;
            
            // Base del generador
            ctx.fillRect(pt.x - size/2, pt.y - size/2, size, size);
            ctx.strokeRect(pt.x - size/2, pt.y - size/2, size, size);
            
            // Indicador de carga
            const charge = 1 - (e.timer / e.cooldown);
            ctx.fillStyle = `rgba(255, 0, 255, ${charge * 0.8})`;
            ctx.fillRect(pt.x - size/2, pt.y - size/2, size, size * charge);
            
            // NUEVO: Indicador de Stock
            if (e.stock !== -1) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(e.stock, pt.x, pt.y + size * 0.7);
            }
        });
    }

    // ... (Colisiones y pathfinding se mantienen igual) ...
    checkCollision(x, y, radius) {
        const localX = x - this.marginLeft;
        const localY = y - this.marginTop;
        const startC = Math.floor((localX - radius) / this.cellSize);
        const endC = Math.floor((localX + radius) / this.cellSize);
        const startR = Math.floor((localY - radius) / this.cellSize);
        const endR = Math.floor((localY + radius) / this.cellSize);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                if (!this.isValid(r, c)) return true;
                const val = this.map[r][c];
                if (val === 1 || val === 2) {
                    const cellX = c * this.cellSize;
                    const cellY = r * this.cellSize;
                    if (localX + radius > cellX && localX - radius < cellX + this.cellSize &&
                        localY + radius > cellY && localY - radius < cellY + this.cellSize) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    checkProjectileHit(x, y) {
        const pt = this.pixelToGrid(x, y);
        if (!this.isValid(pt.r, pt.c)) return 'SOLID';
        const cell = this.map[pt.r][pt.c];
        if (cell === 1) return 'SOLID';
        if (cell === 2) { 
            this.map[pt.r][pt.c] = 0; 
            const target = this.destructibles.find(d => d.c === pt.c && d.r === pt.r);
            if (target) target.active = false;
            return 'DESTROYED_WALL';
        }
        return null;
    }

    getPath(startX, startY, targetX, targetY) {
        const start = this.pixelToGrid(startX, startY);
        const end = this.pixelToGrid(targetX, targetY);
        const pathNodes = this.pathfinder.findPath(this.map, start, end);
        return pathNodes.map(node => this.gridToPixel(node.r, node.c));
    }
    
    hasLineOfSight(x0, y0, x1, y1) {
        const start = this.pixelToGrid(x0, y0);
        const end = this.pixelToGrid(x1, y1);
        let x = start.c, y = start.r;
        const dx = Math.abs(end.c - start.c), dy = Math.abs(end.r - start.r);
        const sx = (start.c < end.c) ? 1 : -1, sy = (start.r < end.r) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            const val = this.map[y][x];
            if (val === 1 || val === 2) return false;
            if (x === end.c && y === end.r) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
            if (!this.isValid(y, x)) return false;
        }
        return true;
    }

    isValid(r, c) { return r >= 0 && r < this.map.length && c >= 0 && c < this.map[0].length; }
    gridToPixel(r, c) { return { x: this.marginLeft + (c * this.cellSize) + (this.cellSize / 2), y: this.marginTop + (r * this.cellSize) + (this.cellSize / 2) }; }
    pixelToGrid(x, y) { return { c: Math.floor((x - this.marginLeft) / this.cellSize), r: Math.floor((y - this.marginTop) / this.cellSize) }; }
}