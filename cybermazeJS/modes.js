// modes.js
// ==========================================
// GESTOR DE MENÚS (MODOS Y NIVELES)
// ==========================================

const GAME_MODES = [
    { id: 'operations', name: 'OPERACIONES', desc: 'Misiones tácticas en mapas diseñados.', emitterStock: 10 },
    { id: 'clear', name: 'LIMPIEZA DE ZONA', desc: 'Mapa Procedural. Elimina hostiles.', emitterStock: 5 },
    { id: 'survival', name: 'SUPERVIVENCIA', desc: '[WIP] Resiste en un mapa infinito.', emitterStock: -1 },
    { id: 'pvp', name: 'DEATHMATCH', desc: '[WIP] Combate 4 jugadores.', emitterStock: 0 }
];

// Estado del Menú de Modos
let selectedModeIdx = 0;
let modePlayers = []; 

// Estado del Menú de Niveles
let levelSelectActive = false;
let selectedLevelIdx = 0;
let availableLevels = []; // Se rellenará leyendo LEVELS

let menuCooldown = 0;

function initModeSelect(players) {
    modePlayers = players;
    selectedModeIdx = 0;
    menuCooldown = 20; 
    levelSelectActive = false;
    
    // Cargar lista de niveles disponibles desde levels.js
    if (typeof LEVELS !== 'undefined') {
        availableLevels = Object.keys(LEVELS);
    } else {
        availableLevels = ['NO LEVELS FOUND'];
    }
}

// ==========================================
// UPDATE (Lógica de Navegación)
// ==========================================
function updateModeSelect() {
    if (menuCooldown > 0) menuCooldown--;
    if (modePlayers.length === 0) return;

    const hostId = modePlayers[0].id;
    const pad = window.getController(hostId);
    if (!pad) return;

    // --- A. SUBMENÚ: SELECCIÓN DE NIVEL ---
    if (levelSelectActive) {
        if (menuCooldown === 0) {
            // Navegar Arriba/Abajo
            if (pad.axes.ly > 0.5 || pad.buttons.d_up) { 
                selectedLevelIdx = (selectedLevelIdx - 1 + availableLevels.length) % availableLevels.length;
                menuCooldown = 12;
            } 
            else if (pad.axes.ly < -0.5 || pad.buttons.d_down) {
                selectedLevelIdx = (selectedLevelIdx + 1) % availableLevels.length;
                menuCooldown = 12;
            }
            
            // CONFIRMAR (A/Start) -> LANZAR JUEGO
            if (pad.buttons.south || pad.buttons.start) {
                const modeId = GAME_MODES[selectedModeIdx].id;
                const levelId = availableLevels[selectedLevelIdx];
                window.launchGame(modeId, levelId); // <--- Pasamos el Nivel
            }
            
            // CANCELAR (B/East) -> Volver a Modos
            if (pad.buttons.east) {
                levelSelectActive = false;
                menuCooldown = 15;
            }
        }
        return;
    }

    // --- B. MENÚ PRINCIPAL: SELECCIÓN DE MODO ---
    if (menuCooldown === 0) {
        // Navegar
        if (pad.axes.ly > 0.5 || pad.buttons.d_up) { 
            selectedModeIdx = (selectedModeIdx - 1 + GAME_MODES.length) % GAME_MODES.length;
            menuCooldown = 12; 
        } 
        else if (pad.axes.ly < -0.5 || pad.buttons.d_down) {
            selectedModeIdx = (selectedModeIdx + 1) % GAME_MODES.length;
            menuCooldown = 12;
        }

        // CONFIRMAR
        if (pad.buttons.south || pad.buttons.start) {
            const mode = GAME_MODES[selectedModeIdx];
            
            if (mode.id === 'operations') {
                // Si es Operaciones, vamos al submenú
                levelSelectActive = true;
                selectedLevelIdx = 0;
                menuCooldown = 15;
            } else {
                // Si es otro, lanzamos directo (Procedural)
                window.launchGame(mode.id, null);
            }
        }
    }
}

// ==========================================
// DRAW (Renderizado de UI)
// ==========================================
function drawModeSelect(ctx, w, h) {
    // Fondo
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);

    // Si estamos seleccionando nivel, pintamos ese menú
    if (levelSelectActive) {
        drawLevelMenu(ctx, w, h);
        return;
    }

    // --- MENÚ DE MODOS ---
    ctx.textAlign = 'center';
    
    // Título
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;
    ctx.font = 'bold 60px Segoe UI';
    ctx.fillText("SELECCIONAR MODO", w/2, h * 0.2);
    ctx.shadowBlur = 0;

    const startY = h * 0.4;
    const gap = 70;

    GAME_MODES.forEach((mode, i) => {
        const isSelected = i === selectedModeIdx;
        const y = startY + i * gap;

        if (isSelected) {
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 45px Segoe UI';
            ctx.fillText(`> ${mode.name} <`, w/2, y);
            
            ctx.fillStyle = '#aaaaaa';
            ctx.font = 'italic 24px Segoe UI';
            ctx.fillText(mode.desc, w/2, h * 0.85);
            
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(w/2 - 250, y - 40, 500, 55);
        } else {
            ctx.fillStyle = '#444';
            ctx.font = '30px Segoe UI';
            ctx.fillText(mode.name, w/2, y);
        }
    });

    drawFooter(ctx, w, h, "A: SELECT  |  HOST ONLY");
}

function drawLevelMenu(ctx, w, h) {
    ctx.textAlign = 'center';
    
    ctx.fillStyle = '#ffff00'; // Amarillo táctico
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 10;
    ctx.font = 'bold 60px Segoe UI';
    ctx.fillText("OPERACIONES: MISIONES", w/2, h * 0.2);
    ctx.shadowBlur = 0;

    const startY = h * 0.4;
    const gap = 60;

    if (availableLevels.length === 0) {
        ctx.fillStyle = '#555';
        ctx.fillText("NO DATA FOUND", w/2, h/2);
        return;
    }

    availableLevels.forEach((lvl, i) => {
        const isSelected = i === selectedLevelIdx;
        const y = startY + i * gap;

        if (isSelected) {
            ctx.fillStyle = '#ffff00';
            ctx.font = 'bold 40px Segoe UI';
            ctx.fillText(`[ ${lvl} ]`, w/2, y);
        } else {
            ctx.fillStyle = '#554400';
            ctx.font = '30px Segoe UI';
            ctx.fillText(lvl, w/2, y);
        }
    });

    drawFooter(ctx, w, h, "A: DEPLOY  |  B: BACK");
}

function drawFooter(ctx, w, h, text) {
    ctx.fillStyle = '#fff';
    ctx.font = '20px monospace';
    ctx.fillText(text, w/2, h - 50);
}