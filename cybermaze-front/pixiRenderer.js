// pixiRenderer.js
// Dumb view renderer: listens to sim websocket and renders the provided world state with PixiJS.


(function () {
  const DEFAULT_SIM_CELL = 32; // fallback if we can't estimate
  // Remote simulation parameters fetched from cybermaze-crud
  let REMOTE_SIM_PARAMS = null;

  // Try to fetch /params from same origin, fall back to api on port 3000
  (function fetchParams() {
    const tryUrls = [
      '/params',
      `http://${location.hostname}:3000/params`
    ];
    for (const u of tryUrls) {
      fetch(u).then(r => {
        if (!r.ok) throw new Error('no');
        return r.json();
      }).then(j => {
        REMOTE_SIM_PARAMS = j;
        if (j.cell_size) {
          simCellSize = j.cell_size;
        }
        // allow remote colors or other overrides if provided
        if (j.colors) {
          Object.assign(COLORS, j.colors);
        }
        console.log('pixiRenderer: loaded /params', j);
      }).catch(() => {});
      if (REMOTE_SIM_PARAMS) break;
    }
  })();

  // App + containers are created by `init()` to keep rendering decoupled from transport
  let app = null;
  let staticContainer = null;
  let dynamicContainer = null;

  // State
  let currentMapHash = null;
  let displayCellSize = 0;
  let marginLeft = 0, marginTop = 0;
  let simCellSize = DEFAULT_SIM_CELL;
  const playersById = new Map();

  // Colors (match legacy)
  const COLORS = {
    WALL_NEON: 0x0088ff,
    DEST_WALL: 0xffcc00,
    BG: 0x050505,
    EMITTER: 0xff00ff
  };

  let tickText = null;

  // No local estimation: sim cell size comes from remote `/params`.

  function buildStatic(map) {
    if (!staticContainer) return;
    staticContainer.removeChildren();
    if (!map || !map.length) return;
    const rows = map.length;
    const cols = map[0].length;

    displayCellSize = Math.min(app.screen.width / cols, app.screen.height / rows);
    marginLeft = (app.screen.width - (displayCellSize * cols)) / 2;
    marginTop = (app.screen.height - (displayCellSize * rows)) / 2;

    // Background
    const bg = new PIXI.Graphics();
    bg.beginFill(COLORS.BG);
    bg.drawRect(0, 0, app.screen.width, app.screen.height);
    bg.endFill();
    staticContainer.addChild(bg);

    // Walls & bases & destructibles
    const g = new PIXI.Graphics();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = map[r][c];
        const x = marginLeft + c * displayCellSize;
        const y = marginTop + r * displayCellSize;
        if (val === 1) {
          g.lineStyle(2, COLORS.WALL_NEON);
          g.drawRect(x, y, displayCellSize, displayCellSize);
        } else if (val === 2) {
          // destructible: rectangle with X
          g.lineStyle(2, COLORS.DEST_WALL);
          const pad = 4;
          const size = displayCellSize - pad * 2;
          g.drawRect(x + pad, y + pad, size, size);
          g.moveTo(x + pad, y + pad);
          g.lineTo(x + pad + size, y + pad + size);
          g.moveTo(x + pad + size, y + pad);
          g.lineTo(x + pad, y + pad + size);
        } else if (val === 3 || val === 4) {
          // bases
          const color = val === 3 ? 0x00ffff : 0xff0033;
          const b = new PIXI.Graphics();
          b.beginFill(color, 0.12);
          b.drawRect(x, y, displayCellSize, displayCellSize);
          b.endFill();
          b.lineStyle(1, color);
          b.drawRect(x + 4, y + 4, displayCellSize - 8, displayCellSize - 8);
          const label = new PIXI.Text(val === 3 ? 'A' : 'E', { fill: color, fontSize: Math.max(10, displayCellSize / 2), fontFamily: 'monospace' });
          label.x = x + displayCellSize / 2 - label.width / 2;
          label.y = y + displayCellSize / 2 - label.height / 2;
          staticContainer.addChild(b);
          staticContainer.addChild(label);
        }
      }
    }
    staticContainer.addChild(g);
  }

  function worldToDisplayPos(x, y) {
    // Convert simulator pixel coords (based on simCellSize) into display pixels
    const c = Math.floor(x / simCellSize);
    const r = Math.floor(y / simCellSize);
    const localX = (x - (c * simCellSize)) / simCellSize; // 0..1
    const localY = (y - (r * simCellSize)) / simCellSize;
    const dx = marginLeft + (c + localX) * displayCellSize;
    const dy = marginTop + (r + localY) * displayCellSize;
    return { x: dx, y: dy };
  }

  function updatePlayers(players) {
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      let s = playersById.get(p.id);
      if (!s) {
        // create
        s = new PIXI.Graphics();
        s.radius = Math.max(6, displayCellSize * 0.35);
        // convert hex string like '#00ffff' to number
        const colNum = (typeof p.color === 'string' && p.color.startsWith('#')) ? parseInt(p.color.slice(1), 16) : 0x00ffff;
        s.beginFill(colNum);
        s.drawPolygon([-s.radius, s.radius * 0.8, s.radius, 0, -s.radius, -s.radius * 0.8]);
        s.endFill();
        s.pivot.set(0, 0);
        dynamicContainer.addChild(s);
        playersById.set(p.id, s);
      }
      const pos = worldToDisplayPos(p.x, p.y);
      s.x = pos.x;
      s.y = pos.y;
      s.rotation = p.angle || 0;
    }
    // remove missing players
    for (const id of Array.from(playersById.keys())) {
      if (!seen.has(id)) {
        const g = playersById.get(id);
        if (g && g.parent) g.parent.removeChild(g);
        playersById.delete(id);
      }
    }
  }

  function applyPayload(payload) {
    if (!payload) return;
    if (!app) init();
    if (tickText) tickText.text = `tick: ${payload.tick || '?'}  state: ${payload.state || ''}`;

    // Rebuild static when map changed
    const mapHash = payload.map ? JSON.stringify(payload.map) : '';
    if (mapHash !== currentMapHash) {
      currentMapHash = mapHash;
      buildStatic(payload.map);
    }

    // Use server-provided sim cell size (if available). Do not estimate locally.
    if (REMOTE_SIM_PARAMS && REMOTE_SIM_PARAMS.cell_size) {
      simCellSize = REMOTE_SIM_PARAMS.cell_size;
    }

    // Update dynamic objects
    const players = (payload.entities && payload.entities.players) ? payload.entities.players : [];
    updatePlayers(players);
  }

  // Create the PIXI app and containers. Called by external code (e.g. ws client).
  function init() {
    if (app) return;

    // Create a dedicated canvas and pass it to Pixi to avoid incompatible options across versions
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    document.body.appendChild(canvas);

    app = new PIXI.Application({ view: canvas, width: window.innerWidth, height: window.innerHeight, backgroundColor: COLORS.BG });

    staticContainer = new PIXI.Container();
    dynamicContainer = new PIXI.Container();
    app.stage.addChild(staticContainer);
    app.stage.addChild(dynamicContainer);

    tickText = new PIXI.Text('', { fill: 0xffffff, fontSize: 14 });
    tickText.x = 8; tickText.y = 8; app.stage.addChild(tickText);

    // Ensure renderer size matches window
    function doResize() {
      const w = window.innerWidth; const h = window.innerHeight;
      app.renderer.resize(w, h);
      if (currentMapHash) {
        try { buildStatic(JSON.parse(currentMapHash)); } catch (e) {}
      }
    }
    window.addEventListener('resize', doResize);

    // Resize handler: rebuild static to adjust margin/scale
    window.addEventListener('resize', () => {
      if (currentMapHash) {
        try { buildStatic(JSON.parse(currentMapHash)); } catch (e) {}
      }
    });

    // If there was a map already provided before init, build it now
    if (currentMapHash) {
      try { buildStatic(JSON.parse(currentMapHash)); } catch (e) {}
    }
  }

  // Expose a minimal API so transport (WebSocket) can simply forward payloads
  window.CyberRenderer = {
    init,
    applyPayload
  };
})();
