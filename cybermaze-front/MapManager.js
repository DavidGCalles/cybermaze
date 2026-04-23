// cybermaze-front/MapManager.js

class MapManager {
  constructor(app, colors) {
    this.app = app;
    this.staticContainer = new PIXI.Container();
    this.app.stage.addChild(this.staticContainer);
    this.COLORS = colors;
    this.displayCellSize = 0;
    this.marginLeft = 0;
    this.marginTop = 0;
    this.wallGrid = []; // To hold references to wall graphics
  }

  buildStatic(map) {
    this.staticContainer.removeChildren();
    this.wallGrid = [];
    if (!map || !map.length) return;

    const rows = map.length;
    const cols = map[0].length;
    this.displayCellSize = Math.min(this.app.screen.width / cols, this.app.screen.height / rows);
    this.marginLeft = (this.app.screen.width - (this.displayCellSize * cols)) / 2;
    this.marginTop = (this.app.screen.height - (this.displayCellSize * rows)) / 2;

    const bg = new PIXI.Graphics();
    bg.beginFill(this.COLORS.BG);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    this.staticContainer.addChild(bg);

    const g = new PIXI.Graphics();
    for (let r = 0; r < rows; r++) {
      this.wallGrid[r] = [];
      for (let c = 0; c < cols; c++) {
        const val = map[r][c];
        const x = this.marginLeft + c * this.displayCellSize;
        const y = this.marginTop + r * this.displayCellSize;
        if (val === 1) {
          g.lineStyle(2, this.COLORS.WALL_NEON);
          g.drawRect(x, y, this.displayCellSize, this.displayCellSize);
        } else if (val === 2) {
          const wallSegment = new PIXI.Graphics();
          wallSegment.lineStyle(2, this.COLORS.DEST_WALL);
          const pad = 4;
          const size = this.displayCellSize - pad * 2;
          wallSegment.drawRect(x + pad, y + pad, size, size);
          wallSegment.moveTo(x + pad, y + pad);
          wallSegment.lineTo(x + pad + size, y + pad + size);
          wallSegment.moveTo(x + pad + size, y + pad);
          wallSegment.lineTo(x + pad, y + pad + size);
          this.staticContainer.addChild(wallSegment);
          this.wallGrid[r][c] = wallSegment;
        } else if (val === 3 || val === 4) {
          const color = val === 3 ? 0x00ffff : 0xff0033;
          const b = new PIXI.Graphics();
          b.beginFill(color, 0.12);
          b.drawRect(x, y, this.displayCellSize, this.displayCellSize);
          b.endFill();
          b.lineStyle(1, color);
          b.drawRect(x + 4, y + 4, this.displayCellSize - 8, this.displayCellSize - 8);
          const label = new PIXI.Text(val === 3 ? 'A' : 'E', { fill: color, fontSize: Math.max(10, this.displayCellSize / 2), fontFamily: 'monospace' });
          label.x = x + this.displayCellSize / 2 - label.width / 2;
          label.y = y + this.displayCellSize / 2 - label.height / 2;
          this.staticContainer.addChild(b);
          this.staticContainer.addChild(label);
        } else if (val === 5) {
          const pit = new PIXI.Graphics();
          pit.beginFill(0x00ff66, 0.15);
          pit.lineStyle(1, 0x00ff66, 0.9);
          pit.drawRect(x, y, this.displayCellSize, this.displayCellSize);
          pit.endFill();
          this.staticContainer.addChild(pit);
        } else if (val === 6) {
          const term = new PIXI.Graphics();
          term.beginFill(0xff00ff, 0.2);
          term.lineStyle(1, 0xff00ff, 1);
          term.drawRect(x + 2, y + 2, this.displayCellSize - 4, this.displayCellSize - 4);
          term.endFill();
          term.beginFill(0xff00ff, 0.8);
          term.drawRect(x + 6, y + 6, this.displayCellSize - 12, 2);
          term.endFill();
          this.staticContainer.addChild(term);
        }
      }
    }
    this.staticContainer.addChild(g);
  }

  removeWall(c, r) {
    if (this.wallGrid[r] && this.wallGrid[r][c]) {
      this.wallGrid[r][c].destroy();
      this.wallGrid[r][c] = null;
    }
  }

  getDisplayCellSize() {
    return this.displayCellSize;
  }

  getMarginLeft() {
    return this.marginLeft;
  }

  getMarginTop() {
    return this.marginTop;
  }
}
