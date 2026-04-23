// pixiRenderer.js (CyberRenderer)
// Main renderer: initializes Pixi, managers, and delegates websocket payloads.

(function () {
  const DEFAULT_SIM_CELL = 32; // fallback if we can't estimate
  let REMOTE_SIM_PARAMS = null;

  const COLORS = { WALL_NEON: 0x0088ff, DEST_WALL: 0xffcc00, BG: 0x050505, EMITTER: 0xff00ff };
  let simCellSize = DEFAULT_SIM_CELL;

  let app = null;
  let tickText = null;

  let mapManager = null;
  let entityManager = null;
  let uiManager = null;

  (function fetchParams() {
    const tryUrls = ['/params', `http://${location.hostname}:3000/params`];
    for (const u of tryUrls) {
      fetch(u).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
        REMOTE_SIM_PARAMS = j;
        if (j.cell_size) simCellSize = j.cell_size;
        if (j.colors) Object.assign(COLORS, j.colors);
        console.log('pixiRenderer: loaded /params', j);
      }).catch(() => {});
      if (REMOTE_SIM_PARAMS) break;
    }
  })();
  
  function worldToDisplayPos(x, y) {
    const c = Math.floor(x / simCellSize);
    const r = Math.floor(y / simCellSize);
    const localX = (x - (c * simCellSize)) / simCellSize;
    const localY = (y - (r * simCellSize)) / simCellSize;
    const dx = mapManager.getMarginLeft() + (c + localX) * mapManager.getDisplayCellSize();
    const dy = mapManager.getMarginTop() + (r + localY) * mapManager.getDisplayCellSize();
    return { x: dx, y: dy };
  }

  function init() {
    const container = document.getElementById('canvas-container');
    if (!container) {
      console.error('Missing #canvas-container');
      return;
    }
    app = new PIXI.Application({
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: COLORS.BG,
      resizeTo: container
    });
    container.innerHTML = '';
    container.appendChild(app.view);
    
    mapManager = new MapManager(app, COLORS);
    const dynamicContainer = new PIXI.Container();
    app.stage.addChild(dynamicContainer);

    uiManager = new UIManager(mapManager.getDisplayCellSize(), REMOTE_SIM_PARAMS);
    entityManager = new EntityManager(dynamicContainer, uiManager, REMOTE_SIM_PARAMS, worldToDisplayPos);

    tickText = new PIXI.Text('Connecting...', { fill: 0xaaaaaa, fontSize: 12, fontFamily: 'monospace' });
    tickText.x = 10;
    tickText.y = 10;
    app.stage.addChild(tickText);
  }

  function applyPayload(payload) {
    if (!app) return;
    tickText.text = `TICK: ${payload.tick}\nPHASE: ${payload.state}`;
    if (payload.events) {
      for (const event of payload.events) {
        if (event.event === 'WALL_DESTROYED') {
          mapManager.removeWall(event.c, event.r);
        }
      }
    }
    if (!payload.entities) return;
    const players = payload.entities.players || [];
    const bullets = payload.entities.bullets || [];
    entityManager.updatePlayers(players);
    entityManager.updateBullets(bullets, players);
  }

  function setMap(map) {
    mapManager.buildStatic(map);
    // After building the map, we have the display cell size, so we can update the UI manager
    uiManager.displayCellSize = mapManager.getDisplayCellSize();
  }

  window.CyberRenderer = { init, applyPayload, setMap };

})();
