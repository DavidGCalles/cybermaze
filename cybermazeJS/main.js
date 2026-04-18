// main.js

const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');

let w, h;
let gameState = 'lobby'; 
let players = []; 
let enemies = []; 
let bullets = []; 
let activeNoises = []; // Buffer de sonido para la IA
let gameGrid = null;     

// Datos temporales
let lobbyData = [];
let currentMode = null;

// CONFIGURACIÓN DE PARTIDA
const FRIENDLY_FIRE = false; 

// --- SETUP ---
function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- TRANSICIÓN 1: LOBBY -> MODE SELECT ---
window.goToModeSelect = function(playersFromLobby) {
    lobbyData = playersFromLobby; 
    window.initModeSelect(lobbyData); 
    gameState = 'mode-select';
}

// --- TRANSICIÓN 2: LANZAMIENTO ---
// Acepta levelId opcional (String de levels.js)
window.launchGame = function(modeId, levelId) {
    console.log(`🚀 LANZANDO: ${modeId} @ ${levelId || 'PROCEDURAL'}`);
    currentMode = modeId;

    gameGrid = new Grid(w, h); 
    const mapToLoad = levelId || 'RANDOM';
    const finalCellSize = gameGrid.loadLevel(mapToLoad, currentMode);
    updateEntityScale(finalCellSize); 

    // 1. SPAWN JUGADORES
    players = lobbyData.map((p, index) => {
        const spawn = gameGrid.getPlayerSpawn(index);
        return new Player(p.id, spawn.x, spawn.y, p.color);
    });
    
    bullets = []; 
    enemies = [];

    // 2. SPAWN ENEMIGOS ESTÁTICOS (Guarnición)
    gameGrid.staticEnemies.forEach(e => {
        const px = gameGrid.gridToPixel(e.r, e.c);
        enemies.push(new Enemy(e.type, px.x, px.y));
    });

    gameState = 'playing';
}

function randomEnemyType() {
    const r = Math.random();
    if (r > 0.7) return 'square';
    if (r > 0.9) return 'diamond';
    return 'circle';
}

// --- GAME LOOP ---
function loop() {
    requestAnimationFrame(loop);

    ctx.fillStyle = '#050505'; 
    ctx.fillRect(0, 0, w, h);
    
    activeNoises = []; // Reset ruidos por frame

    if (gameState === 'lobby') {
        updateLobby();
        drawLobby(ctx, w, h);
    }
    else if (gameState === 'mode-select') {
        updateModeSelect();       
        drawModeSelect(ctx, w, h); 
    } 
    else if (gameState === 'playing') {
        if (!gameGrid) return; 

        // 1. MAPA
        gameGrid.draw(ctx);

        // 2. BALAS
        const prevBulletCount = bullets.length;
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.update(gameGrid, w, h);
            
            if (!b.alive) {
                bullets.splice(i, 1);
                continue;
            }

            // Colisiones Bala -> Enemigo
            if (b.ownerId !== 'enemy') {
                for (let e of enemies) {
                    if (e.alive && Math.hypot(b.x - e.x, b.y - e.y) < e.radius + 4) {
                        e.takeDamage(ENTITY_CONFIG.BULLET_DAMAGE);
                        b.alive = false;
                        break;
                    }
                }
            }

            // Colisiones Bala -> Jugador
            if (b.alive) {
                players.forEach(p => {
                    if (p.isDead) return;
                    if (b.ownerId === p.id) return; 
                    if (!FRIENDLY_FIRE && b.ownerId !== 'enemy') return; 

                    if (Math.hypot(b.x - p.x, b.y - p.y) < p.radius + 4) {
                        p.takeDamage(10); 
                        b.alive = false;
                    }
                });
            }
            b.draw(ctx);
        }

        // 3. JUGADORES (Generar Ruido)
        players.forEach(player => {
            if (!player.isDead) {
                const pad = window.getController(player.id);
                // Si disparó (simplificado: detectamos input de disparo validado)
                if (pad && pad.axes.rt > 0.5 && player.energy >= ENTITY_CONFIG.SHOT_COST && player.shotCooldown <= 0) {
                    activeNoises.push({ x: player.x, y: player.y, type: 'SHOT' });
                }
                player.update(gameGrid, w, h, bullets); 
                player.draw(ctx);
            }
        });

        // 4. GESTIÓN DE EMISORES (Generadores de Enemigos)
        if (gameGrid) {
            for (let i = gameGrid.emitters.length - 1; i >= 0; i--) {
                const emitter = gameGrid.emitters[i];

                // Si un emisor agotó su stock en el frame anterior, se elimina ahora.
                if (emitter.stock === 0) {
                    console.log(`EMITTER REMOVED: Stock is 0.`, emitter);
                    gameGrid.emitters.splice(i, 1);
                    continue;
                }
                
                emitter.timer--;
                if (emitter.timer <= 0) {
                    emitter.timer = emitter.cooldown;
                    
                    if (enemies.length < 30) {
                        const px = gameGrid.gridToPixel(emitter.r, emitter.c);
                        
                        let typeToSpawn = emitter.type;
                        if (typeToSpawn === 'random') {
                             typeToSpawn = randomEnemyType();
                        }
                        
                        enemies.push(new Enemy(typeToSpawn, px.x, px.y));

                        // Solo se reduce el stock si es un número finito (no infinito -1)
                        if (emitter.stock > 0) {
                            emitter.stock--;
                             console.log(`EMITTER SPAWN: Stock reduced to ${emitter.stock}`, emitter);
                        }
                    }
                }
            }
        }

        // 4. ENEMIGOS (IA OODA)
        let activeEnemies = 0;
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.alive) continue;
            activeEnemies++;

            e.update(gameGrid, players, bullets, w, h, enemies);
            e.draw(ctx);

            // Daño por contacto
            players.forEach(p => {
                if (!p.isDead && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius) {
                    p.takeDamage(1); 
                }
            });
        }

        // 5. HUD / VICTORIA
        // (Lógica simplificada por ahora)
        if (currentMode === 'clear' || currentMode === 'operations') {
            if (activeEnemies === 0 && gameGrid.emitters.length === 0) {
                drawOverlay(ctx, w, h, '#00ff00', "MISSION ACCOMPLISHED");
                checkReset(players);
            } else if (players.every(p => p.isDead)) {
                drawOverlay(ctx, w, h, '#ff0000', "CRITICAL FAILURE");
                checkReset(players);
            }
        }
    }
}

function drawOverlay(ctx, w, h, color, text) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = 'center';
    ctx.font = 'bold 80px Segoe UI';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, w/2, h/2);
    ctx.font = '30px Segoe UI';
    ctx.fillText("PRESS START TO RTB", w/2, h/2 + 60);
}

function checkReset(players) {
    if (players.length > 0) {
        const hostPad = window.getController(players[0].id);
        if (hostPad && hostPad.buttons.start) {
            window.goToModeSelect(lobbyData);
        }
    }
}

loop();