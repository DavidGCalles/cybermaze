// cybermaze-front/UIManager.js

class UIManager {
  constructor(displayCellSize, simParams) {
    this.displayCellSize = displayCellSize;
    this.simParams = simParams;
  }

  createOverCharUI() {
    const ui = new PIXI.Container();
    const ratios = (this.simParams && this.simParams.entity_ratios) || {};
    const barWidth = this.displayCellSize * (ratios.UI_BAR_WIDTH || 1.2);
    const barHeight = this.displayCellSize * (ratios.UI_BAR_HEIGHT || 0.1);
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
    const uiOffsetRatio = ratios.UI_OFFSET || 0.8;
    ui.y = -this.displayCellSize * uiOffsetRatio;
    ui.x = -barWidth / 2;
    return ui;
  }

  updateOverCharUI(uiContainer, player) {
    if (!uiContainer) return;
    const hpBar = uiContainer.getChildByName('hpBar');
    const energyBar = uiContainer.getChildByName('energyBar');
    const ratios = (this.simParams && this.simParams.entity_ratios) || {};
    const barWidth = this.displayCellSize * (ratios.UI_BAR_WIDTH || 1.2);
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

  createTriggerUI() {
    const ui = new PIXI.Container();
    const text = new PIXI.Text('', { fill: 0xffffff, fontSize: 12, fontFamily: 'monospace' });
    text.name = 'triggerText';
    text.anchor.set(0.5);
    const ratios = (this.simParams && this.simParams.entity_ratios) || {};
    const uiOffsetRatio = ratios.UI_OFFSET || 0.8;
    text.y = -this.displayCellSize * uiOffsetRatio - 15;
    ui.addChild(text);
    return ui;
  }

  updateTriggerUI(uiContainer, player) {
    if (!uiContainer) return;
    const text = uiContainer.getChildByName('triggerText');
    if (text) {
      if (player.active_trigger) {
        if (player.active_trigger.type === 'button') {
          text.text = `[${player.active_trigger.label}]`;
          text.visible = true;
        } else if (player.active_trigger.type === 'hold') {
          const progress = Math.round(player.active_trigger.progress * 10);
          text.text = `[${'#'.repeat(progress)}${'-'.repeat(10 - progress)}]`;
          text.visible = true;
        } else {
          text.visible = false;
        }
      } else {
        text.visible = false;
      }
    }
  }
}
