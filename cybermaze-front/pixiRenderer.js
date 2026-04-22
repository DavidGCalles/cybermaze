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
        } else if (val === 5) { // EQUIP_LOADOUT (Pit)
          const pit = new PIXI.Graphics();
          pit.beginFill(0x00ff66, 0.15);
          pit.lineStyle(1, 0x00ff66, 0.9);
          pit.drawRect(x, y, displayCellSize, displayCellSize);
          pit.endFill();
          staticContainer.addChild(pit);
        } else if (val === 6) { // CHANGE_PHASE (Terminal)
          const term = new PIXI.Graphics();
          term.beginFill(0xff00ff, 0.2);
          term.lineStyle(1, 0xff00ff, 1);
          term.drawRect(x + 2, y + 2, displayCellSize - 4, displayCellSize - 4);
          term.endFill();
          term.beginFill(0xff00ff, 0.8);
          term.drawRect(x + 6, y + 6, displayCellSize - 12, 2);
          term.endFill();
          staticContainer.addChild(term);
        } else if (val === 5) { // EQUIP_LOADOUT (Pit)
          const pit = new PIXI.Graphics();
          pit.beginFill(0x00ff66, 0.15);
          pit.lineStyle(1, 0x00ff66, 0.9);
          pit.drawRect(x, y, displayCellSize, displayCellSize);
          pit.endFill();
          staticContainer.addChild(pit);
        } else if (val === 6) { // CHANGE_PHASE (Terminal)
          const term = new PIXI.Graphics();
          term.beginFill(0xff00ff, 0.2);
          term.lineStyle(1, 0xff00ff, 1);
          term.drawRect(x + 2, y + 2, displayCellSize - 4, displayCellSize - 4);
          term.endFill();
          term.beginFill(0xff00ff, 0.8);
          term.drawRect(x + 6, y + 6, displayCellSize - 12, 2);
          term.endFill();
          staticContainer.addChild(term);
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
        s = new PIXI.Container();

        const avatar = new PIXI.Graphics();
        avatar.name = 'avatar';
        const playerRadiusRatio = (REMOTE_SIM_PARAMS && REMOTE_SIM_PARAMS.entity_ratios) ? REMOTE_SIM_PARAMS.entity_ratios.PLAYER_RADIUS : 0.35;
        const radius = Math.max(6, displayCellSize * playerRadiusRatio);
        const colNum = (typeof p.color === 'string' && p.color.startsWith('#')) ? parseInt(p.color.slice(1), 16) : 0x00ffff;
        avatar.beginFill(colNum);
        avatar.drawPolygon([-radius, radius * 0.8, radius, 0, -radius, -radius * 0.8]);
        avatar.endFill();
        avatar.pivot.set(0, 0);
        s.addChild(avatar);

        const ui = createOverCharUI();
        ui.name = 'overCharUi';
        s.addChild(ui);

        const triggerUi = createTriggerUI();
        triggerUi.name = 'triggerUi';
        s.addChild(triggerUi);
        
        dynamicContainer.addChild(s);
        playersById.set(p.id, s);
      }
      const pos = worldToDisplayPos(p.x, p.y);
      s.x = pos.x;
      s.y = pos.y;

      const avatar = s.getChildByName('avatar');
      if (avatar) {
        avatar.rotation = p.angle || 0;
        const colNum = (typeof p.color === 'string' && p.color.startsWith('#')) ? parseInt(p.color.slice(1), 16) : 0x00ffff;
        avatar.tint = colNum;
      }

      // Update UI
      const uiContainer = s.getChildByName('overCharUi');
      updateOverCharUI(uiContainer, p);
      const triggerUiContainer = s.getChildByName('triggerUi');
      updateTriggerUI(triggerUiContainer, p);
    }
    // remove missing players
    for (const id of Array.from(playersById.keys())) {
      if (!seen.has(id)) {
        const container = playersById.get(id);
        if (container) {
          container.destroy({ children: true, texture: true, baseTexture: true });
        }
        playersById.delete(id);
      }
    }
  }

  function createOverCharUI() {
    const ui = new PIXI.Container();

    // Bar dimensions - scale with display cell size for visual consistency
    const ratios = (REMOTE_SIM_PARAMS && REMOTE_SIM_PARAMS.entity_ratios) || {};
    const barWidth = displayCellSize * (ratios.UI_BAR_WIDTH || 1.2);
    const barHeight = displayCellSize * (ratios.UI_BAR_HEIGHT || 0.1);

    // HP bar (background + foreground)
    const hpBarBg = new PIXI.Graphics();
    hpBarBg.beginFill(0x550000, 0.8);
    hpBarBg.drawRect(0, 0, barWidth, barHeight);
    hpBarBg.endFill();
    ui.addChild(hpBarBg);

    const hpBar = new PIXI.Graphics();
    hpBar.beginFill(0xff0000);
    hpBar.drawRect(0, 0, barWidth, barHeight);
    hpBar.endFill();
    hpBar.name = 'hpBar';
    ui.addChild(hpBar);

    // Energy bar
    const energyBarBg = new PIXI.Graphics();
    energyBarBg.beginFill(0x003355, 0.8);
    energyBarBg.drawRect(0, 0, barWidth, barHeight);
    energyBarBg.endFill();
    energyBarBg.y = barHeight + 3;
    ui.addChild(energyBarBg);

    const energyBar = new PIXI.Graphics();
    energyBar.beginFill(0x00ccff);
    energyBar.drawRect(0, 0, barWidth, barHeight);
    energyBar.endFill();
    energyBar.y = barHeight + 3;
    energyBar.name = 'energyBar';
    ui.addChild(energyBar);
    
    // Set a vertical offset so it appears above the avatar
    const uiOffsetRatio = ratios.UI_OFFSET || 0.8;
    ui.y = -displayCellSize * uiOffsetRatio;
    ui.x = -barWidth / 2;

    return ui;
  }

  function updateOverCharUI(uiContainer, player) {
    if (!uiContainer) return;
    const hpBar = uiContainer.getChildByName('hpBar');
    const energyBar = uiContainer.getChildByName('energyBar');

    const ratios = (REMOTE_SIM_PARAMS && REMOTE_SIM_PARAMS.entity_ratios) || {};
    const barWidth = displayCellSize * (ratios.UI_BAR_WIDTH || 1.2);
    
    if (hpBar) {
        const maxHp = player.max_hp || 100;
        const hpPercent = (player.hp || 0) / (maxHp > 0 ? maxHp : 100);
        hpBar.width = barWidth * hpPercent;
    }
    if (energyBar) {
        const maxEnergy = player.max_energy || 100;
        const energyPercent = (player.energy || 0) / (maxEnergy > 0 ? maxEnergy : 100);
        energyBar.width = barWidth * energyPercent;
    }
  }

  function createTriggerUI() {
    const ui = new PIXI.Container();
    const ratios = (REMOTE_SIM_PARAMS && REMOTE_SIM_PARAMS.entity_ratios) || {};
    const barWidth = displayCellSize * (ratios.UI_BAR_WIDTH || 1.2);
    
    // -- Button Prompt --
    const buttonPrompt = new PIXI.Text('Pulsa [A]', {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 3
    });
    buttonPrompt.name = 'buttonPrompt';
    buttonPrompt.anchor.set(0.5);
    buttonPrompt.visible = false;
    ui.addChild(buttonPrompt);

    // -- Hold Progress Bar --
    const holdContainer = new PIXI.Container();
    holdContainer.name = 'holdContainer';
    const holdBarBg = new PIXI.Graphics();
    holdBarBg.beginFill(0x888888, 0.7);
    holdBarBg.drawRect(0, 0, barWidth, 8);
    holdBarBg.endFill();
    holdContainer.addChild(holdBarBg);
    
    const holdBar = new PIXI.Graphics();
    holdBar.beginFill(0xffaa00);
    holdBar.drawRect(0, 0, barWidth, 8);
    holdBar.endFill();
    holdBar.name = 'holdBar';
    holdContainer.addChild(holdBar);

    holdContainer.x = -barWidth / 2; // Center the container
    holdContainer.visible = false;
    ui.addChild(holdContainer);
    
    // Position above stats bars
    const uiOffsetRatio = ratios.UI_OFFSET || 0.8;
    ui.y = -displayCellSize * uiOffsetRatio - 15; // 15px above stats
    
    return ui;
  }

  function updateTriggerUI(uiContainer, player) {
    if (!uiContainer) return;
    const buttonPrompt = uiContainer.getChildByName('buttonPrompt');
    const holdContainer = uiContainer.getChildByName('holdContainer');

    const trigger = player.active_trigger;

    if (!trigger) {
      if (buttonPrompt) buttonPrompt.visible = false;
      if (holdContainer) holdContainer.visible = false;
      return;
    }
    
    if (trigger.type === 'button') {
      if (holdContainer) holdContainer.visible = false;
      if (buttonPrompt) {
        buttonPrompt.text = `Pulsa [${trigger.label || 'A'}]`;
        buttonPrompt.visible = true;
      }
    } else if (trigger.type === 'hold') {
      if (buttonPrompt) buttonPrompt.visible = false;
      if (holdContainer) {
        const holdBar = holdContainer.getChildByName('holdBar');
        const ratios = (REMOTE_SIM_PARAMS && REMOTE_SIM_PARAMS.entity_ratios) || {};
        const barWidth = displayCellSize * (ratios.UI_BAR_WIDTH || 1.2);
        holdBar.width = barWidth * (trigger.progress || 0);
        holdContainer.visible = true;
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
