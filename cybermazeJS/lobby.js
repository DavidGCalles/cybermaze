// lobby.js
const PLAYER_COLORS = ['#00ffff', '#ff0055', '#ffff00', '#00ff00']; 
let joinedPlayers = []; // { id: number, color: string }

function updateLobby() {
    const activePads = window.getAllControllers();
    
    activePads.forEach(pad => {
        const isJoined = joinedPlayers.some(p => p.id === pad.id);
        
        // JOIN: Botón 'South' (A/X)
        if (pad.buttons.south && !isJoined) {
            if (joinedPlayers.length < 4) {
                console.log(`🎮 Player JOIN: ID ${pad.id}`);
                joinedPlayers.push({
                    id: pad.id,
                    color: PLAYER_COLORS[joinedPlayers.length]
                });
            }
        }
    });

    // START: Host avanza a Selección de Modo
    if (joinedPlayers.length > 0) {
        const hostPlayer = joinedPlayers[0];
        const hostPad = window.getController(hostPlayer.id);
        
        if (hostPad && hostPad.buttons.start) {
            console.log("➡️ Host avanza a Selección de Modo");
            // CAMBIO AQUÍ: Ya no iniciamos el juego directo, vamos al menú
            window.goToModeSelect(joinedPlayers);
        }
    }
}

function drawLobby(ctx, w, h) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 60px Segoe UI';
    ctx.fillText("NEXUS LOBBY", w/2, h * 0.2);
    
    ctx.font = '24px monospace';
    ctx.fillStyle = '#666';
    ctx.fillText("WAITING FOR PLAYERS...", w/2, h * 0.25);

    const slotSize = 200;
    const gap = 50;
    const totalW = (slotSize * 4) + (gap * 3);
    const startX = (w - totalW) / 2;
    const startY = h / 2 - slotSize / 2;

    for (let i = 0; i < 4; i++) {
        const x = startX + i * (slotSize + gap);
        const player = joinedPlayers[i];
        
        ctx.lineWidth = 4;
        ctx.strokeStyle = player ? player.color : '#333';
        ctx.strokeRect(x, startY, slotSize, slotSize);

        if (player) {
            ctx.fillStyle = player.color;
            ctx.globalAlpha = 0.2;
            ctx.fillRect(x, startY, slotSize, slotSize);
            ctx.globalAlpha = 1.0;

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 40px Segoe UI';
            ctx.fillText(`P${i + 1}`, x + slotSize/2, startY + slotSize/2);
            
            if (i === 0) {
                ctx.font = '16px monospace';
                ctx.fillStyle = '#ffff00';
                ctx.fillText("HOST (PRESS START)", x + slotSize/2, startY + slotSize - 20);
            }
        } else {
            ctx.fillStyle = '#333';
            ctx.font = 'italic 20px Segoe UI';
            ctx.fillText("Press A", x + slotSize/2, startY + slotSize/2);
        }
    }
}