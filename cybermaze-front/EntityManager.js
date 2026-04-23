// cybermaze-front/EntityManager.js

class EntityManager {
  constructor(dynamicContainer, uiManager, simParams, worldToDisplayPos) {
    this.dynamicContainer = dynamicContainer;
    this.uiManager = uiManager;
    this.simParams = simParams;
    this.worldToDisplayPos = worldToDisplayPos;
    this.playersById = new Map();
    this.bulletsById = new Map();
  }

  updatePlayers(players) {
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      let s = this.playersById.get(p.id);
      if (!s) {
        s = new PIXI.Container();
        const avatar = new PIXI.Graphics();
        avatar.name = 'avatar';
        const playerRadiusRatio = (this.simParams && this.simParams.entity_ratios) ? this.simParams.entity_ratios.PLAYER_RADIUS : 0.35;
        const radius = Math.max(6, this.uiManager.displayCellSize * playerRadiusRatio);
        const colNum = (typeof p.color === 'string' && p.color.startsWith('#')) ? parseInt(p.color.slice(1), 16) : 0x00ffff;
        avatar.beginFill(colNum);
        avatar.drawPolygon([-radius, radius * 0.8, radius, 0, -radius, -radius * 0.8]);
        avatar.endFill();
        avatar.pivot.set(0, 0);
        s.addChild(avatar);
        const ui = this.uiManager.createOverCharUI();
        ui.name = 'overCharUi';
        s.addChild(ui);
        const triggerUi = this.uiManager.createTriggerUI();
        triggerUi.name = 'triggerUi';
        s.addChild(triggerUi);
        this.dynamicContainer.addChild(s);
        this.playersById.set(p.id, s);
      }
      const pos = this.worldToDisplayPos(p.x, p.y);
      s.x = pos.x;
      s.y = pos.y;
      const avatar = s.getChildByName('avatar');
      if (avatar) {
        avatar.rotation = p.angle || 0;
        const colNum = (typeof p.color === 'string' && p.color.startsWith('#')) ? parseInt(p.color.slice(1), 16) : 0x00ffff;
        avatar.tint = colNum;
      }
      const uiContainer = s.getChildByName('overCharUi');
      this.uiManager.updateOverCharUI(uiContainer, p);
      const triggerUiContainer = s.getChildByName('triggerUi');
      this.uiManager.updateTriggerUI(triggerUiContainer, p);
    }
    for (const id of Array.from(this.playersById.keys())) {
      if (!seen.has(id)) {
        const container = this.playersById.get(id);
        if (container) container.destroy({ children: true, texture: true, baseTexture: true });
        this.playersById.delete(id);
      }
    }
  }

  updateBullets(bullets, players) {
    const seen = new Set();
    for (const b of bullets) {
      seen.add(b.id);
      let s = this.bulletsById.get(b.id);
      if (!s) {
        s = new PIXI.Graphics();
        const bulletRadiusRatio = (this.simParams && this.simParams.entity_ratios) ? this.simParams.entity_ratios.BULLET_RADIUS : 0.1;
        const radius = Math.max(2, this.uiManager.displayCellSize * bulletRadiusRatio);
        const owner = players.find(p => p.id === b.owner);
        const colNum = owner ? (typeof owner.color === 'string' && owner.color.startsWith('#')) ? parseInt(owner.color.slice(1), 16) : 0x00ffff : 0xffff00;
        s.beginFill(colNum);
        s.drawCircle(0, 0, radius);
        s.endFill();
        this.dynamicContainer.addChild(s);
        this.bulletsById.set(b.id, s);
      }
      const pos = this.worldToDisplayPos(b.x, b.y);
      s.x = pos.x;
      s.y = pos.y;
    }
    for (const id of Array.from(this.bulletsById.keys())) {
      if (!seen.has(id)) {
        const bullet = this.bulletsById.get(id);
        if (bullet) bullet.destroy();
        this.bulletsById.delete(id);
      }
    }
  }
}
