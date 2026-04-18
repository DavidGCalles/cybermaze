// entities.js
// ==========================================
// ARQUITECTURA DE IA: MAQUINA DE ESTADOS (FSM) + UI TÁCTICA
// ==========================================

// 1. CONFIGURACIÓN
// ==========================================
const ENTITY_RATIOS = {
    PLAYER_SPEED: 0.09,
    PLAYER_RADIUS: 0.35,
    BULLET_SPEED: 0.5,
    BULLET_RADIUS: 0.12,
    ENEMY_SPEED: 0.03,
    ENEMY_VISION: 14.0, 
    UI_BAR_WIDTH: 0.8,
    UI_BAR_HEIGHT: 0.1,
    UI_OFFSET: 0.5
};

const ENTITY_CONFIG = {
    PLAYER_HP: 100,
    DASH_SPEED_MULT: 3.0,
    DASH_DURATION: 12,
    DASH_COST: 25,
    MAX_ENERGY: 100,
    ENERGY_REGEN: 0.8,
    SHOT_COST: 40,
    SHOT_COOLDOWN: 15,
    BULLET_DAMAGE: 25,
    ENEMY_FIRE_RATE: 60,
    ALERT_DURATION: 240, 
};

function updateEntityScale(cellSize) {
    console.log(`⚖️ Entities: Escala aplicada para celda ${cellSize.toFixed(1)}px`);
    ENTITY_CONFIG.PLAYER_SPEED = cellSize * ENTITY_RATIOS.PLAYER_SPEED;
    ENTITY_CONFIG.PLAYER_RADIUS = cellSize * ENTITY_RATIOS.PLAYER_RADIUS;
    ENTITY_CONFIG.BULLET_SPEED = cellSize * ENTITY_RATIOS.BULLET_SPEED;
    ENTITY_CONFIG.BULLET_RADIUS = cellSize * ENTITY_RATIOS.BULLET_RADIUS;
    ENTITY_CONFIG.ENEMY_SPEED = cellSize * ENTITY_RATIOS.ENEMY_SPEED;
    ENTITY_CONFIG.ENEMY_VISION = cellSize * ENTITY_RATIOS.ENEMY_VISION;
    
    ENTITY_CONFIG.UI_W = cellSize * ENTITY_RATIOS.UI_BAR_WIDTH;
    ENTITY_CONFIG.UI_H = cellSize * ENTITY_RATIOS.UI_BAR_HEIGHT;
    ENTITY_CONFIG.UI_Y_OFFSET = cellSize * ENTITY_RATIOS.UI_OFFSET;
}

// 2. CLASES BASE
// ==========================================
class GameEntity {
    constructor(x, y, color, radius) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = radius;
        this.alive = true;
    }
}

class LivingEntity extends GameEntity {
    constructor(x, y, color, radius, hp) {
        super(x, y, color, radius);
        this.hp = hp;
        this.maxHp = hp;
        this.isDead = false;
    }

    takeDamage(amount) {
        if (this.isDead) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
        }
    }

    die() {
        this.isDead = true;
        this.alive = false;
    }

    drawUI(ctx) {
        const w = ENTITY_CONFIG.UI_W;
        const h = ENTITY_CONFIG.UI_H;
        const x = this.x - w / 2;
        const y = this.y - this.radius - ENTITY_CONFIG.UI_Y_OFFSET;

        // Barra de Vida
        ctx.fillStyle = '#330000';
        ctx.fillRect(x, y, w, h);
        const hpPct = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = hpPct > 0.3 ? '#00ff00' : '#ff0000';
        ctx.fillRect(x, y, w * hpPct, h);
    }
}

// 3. JUGADOR Y PROYECTILES
// ==========================================
class Bullet extends GameEntity {
    constructor(x, y, angle, ownerId, color) {
        super(x, y, color, ENTITY_CONFIG.BULLET_RADIUS);
        this.vx = Math.cos(angle) * ENTITY_CONFIG.BULLET_SPEED;
        this.vy = Math.sin(angle) * ENTITY_CONFIG.BULLET_SPEED;
        this.ownerId = ownerId;
    }

    update(grid, w, h) {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) { this.alive = false; return; }
        if (grid.checkProjectileHit(this.x, this.y)) this.alive = false;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Player extends LivingEntity {
    constructor(id, x, y, color) {
        super(x, y, color, ENTITY_CONFIG.PLAYER_RADIUS, ENTITY_CONFIG.PLAYER_HP);
        this.id = id;
        this.angle = 0;
        this.energy = ENTITY_CONFIG.MAX_ENERGY;
        this.shotCooldown = 0;
        this.isDashing = false;
        this.dashFrame = 0;
        this.dashVector = { x: 0, y: 0 };
    }

    takeDamage(amount) {
        if (this.isDashing) return;
        super.takeDamage(amount);
    }

    update(grid, w, h, bullets) {
        if (this.isDead) return;
        this.radius = ENTITY_CONFIG.PLAYER_RADIUS;

        const pad = window.getController(this.id);
        if (!pad) return;

        if (this.shotCooldown > 0) this.shotCooldown--;
        if (!this.isDashing && this.energy < ENTITY_CONFIG.MAX_ENERGY) {
            this.energy = Math.min(ENTITY_CONFIG.MAX_ENERGY, this.energy + ENTITY_CONFIG.ENERGY_REGEN);
        }

        if (pad.axes.rt > 0.5 && this.shotCooldown <= 0 && this.energy >= ENTITY_CONFIG.SHOT_COST) {
            this.shoot(bullets);
        }
        const dashPressed = (pad.axes.lt > 0.5) || pad.buttons.south;
        if (dashPressed && !this.isDashing && this.energy >= ENTITY_CONFIG.DASH_COST) {
            this.startDash(pad);
        }

        let dx = 0, dy = 0;
        if (this.isDashing) {
            const speed = ENTITY_CONFIG.PLAYER_SPEED * ENTITY_CONFIG.DASH_SPEED_MULT;
            dx = this.dashVector.x * speed;
            dy = this.dashVector.y * speed;
            this.dashFrame--;
            if (this.dashFrame <= 0) this.isDashing = false;
        } else {
            const rawLx = Math.abs(pad.axes.lx) > 0.1 ? pad.axes.lx : 0;
            const rawLy = Math.abs(pad.axes.ly) > 0.1 ? -pad.axes.ly : 0;
            dx = rawLx * ENTITY_CONFIG.PLAYER_SPEED;
            dy = rawLy * ENTITY_CONFIG.PLAYER_SPEED;
            if (dx !== 0 || dy !== 0) this.angle = Math.atan2(dy, dx);
        }

        if (!grid.checkCollision(this.x + dx, this.y, this.radius)) this.x += dx;
        if (!grid.checkCollision(this.x, this.y + dy, this.radius)) this.y += dy;
        
        const aimX = Math.abs(pad.axes.rx) > 0.1 ? pad.axes.rx : 0;
        const aimY = Math.abs(pad.axes.ry) > 0.1 ? -pad.axes.ry : 0;
        if (aimX !== 0 || aimY !== 0) this.angle = Math.atan2(aimY, aimX);
    }

    shoot(bullets) {
        this.energy -= ENTITY_CONFIG.SHOT_COST;
        this.shotCooldown = ENTITY_CONFIG.SHOT_COOLDOWN;
        const tipX = this.x + Math.cos(this.angle) * (this.radius * 1.5);
        const tipY = this.y + Math.sin(this.angle) * (this.radius * 1.5);
        bullets.push(new Bullet(tipX, tipY, this.angle, this.id, this.color));
    }

    startDash(pad) {
        let dirX = pad.axes.lx;
        let dirY = -pad.axes.ly;
        if (Math.abs(dirX) < 0.1 && Math.abs(dirY) < 0.1) {
            dirX = Math.cos(this.angle);
            dirY = Math.sin(this.angle);
        }
        const len = Math.hypot(dirX, dirY);
        this.dashVector = (len > 0.01) ? { x: dirX / len, y: dirY / len } : { x: 1, y: 0 };
        this.isDashing = true;
        this.dashFrame = ENTITY_CONFIG.DASH_DURATION;
        this.energy -= ENTITY_CONFIG.DASH_COST;
    }

    draw(ctx) {
        if (this.isDead) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(-this.radius, this.radius * 0.8);
        ctx.lineTo(-this.radius * 0.4, 0);
        ctx.lineTo(-this.radius, -this.radius * 0.8);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = this.isDashing ? 25 : 8;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
        this.drawUI(ctx);
        
        // Barra Energía (Solo Jugador)
        const w = ENTITY_CONFIG.UI_W;
        const h = ENTITY_CONFIG.UI_H;
        const x = this.x - w / 2;
        const y = (this.y - this.radius - ENTITY_CONFIG.UI_Y_OFFSET) + h + 2;
        ctx.fillStyle = '#003333'; ctx.fillRect(x, y, w, h);
        const enPct = this.energy / ENTITY_CONFIG.MAX_ENERGY;
        ctx.fillStyle = '#00ffff'; ctx.fillRect(x, y, w * enPct, h);
    }
}

// ==========================================
// 4. SISTEMA DE IA TÁCTICA (Miedo + Cobertura)
// ==========================================

// --- DEFINICIÓN DE ESTADOS ---

class EnemyState {
    enter(enemy) {}
    execute(enemy, grid, perception) {}
    exit(enemy) {}
}

class IdleState extends EnemyState {
    enter(enemy) { 
        enemy.stateIcon = null; 
    } 
    execute(enemy, grid, perception) {
        if (!enemy.spawnPoint) {
            enemy.spawnPoint = { x: enemy.x, y: enemy.y };
        }
        if (perception.visibleEnemies.length > 0) {
            enemy.changeState(new CombatState(perception.visibleEnemies[0].entity));
            return;
        }

        enemy.patrolTimer--;
        if (enemy.patrolTimer <= 0 || !enemy.navTarget || enemy.hasReachedTarget()) {
            const patrolRadius = 4 * (enemy.grid ? enemy.grid.cellSize : 16); 
            const angle = Math.random() * Math.PI * 2;
            const patrolX = enemy.spawnPoint.x + Math.cos(angle) * patrolRadius;
            const patrolY = enemy.spawnPoint.y + Math.sin(angle) * patrolRadius;
            
            enemy.navTarget = { x: patrolX, y: patrolY };
            enemy.patrolTimer = 180 + Math.random() * 120; // 3-5 seconds
        }
    }
}

class CombatState extends EnemyState {
    constructor(target) {
        super();
        this.target = target;
    }
    enter(enemy) { 
        enemy.stateIcon = '!'; 
        enemy.iconColor = '#ff0000'; // Rojo Agresivo
    } 
    execute(enemy, grid, perception) {
        const distToTarget = Math.hypot(this.target.x - enemy.x, this.target.y - enemy.y);
        
        // 1. EVALUACIÓN DE SUPERVIVENCIA (El Bucle del Miedo)
        const lowHealth = enemy.hp < enemy.maxHp * 0.3;
        const takingFire = enemy.wasHitRecently > 0; // Necesitamos añadir este contador en Enemy
        const isMelee = !enemy.canShoot;

        // Si estoy muriendo, HUYO.
        if (lowHealth) {
            enemy.changeState(new RetreatState(this.target));
            return;
        }

        // Si soy melee, estoy lejos (> 250px) y me disparan: BUSCO COBERTURA (No cargo a lo loco)
        if (isMelee && takingFire && distToTarget > 250) {
            const cover = enemy.findCover(grid, this.target);
            if (cover) {
                // Ir a cobertura en lugar de al jugador
                enemy.navTarget = cover;
                return; 
            }
        }

        // 2. COMBATE ESTÁNDAR
        const stillVisible = perception.visibleEnemies.find(e => e.entity === this.target);
        
        if (stillVisible) {
            enemy.memory.lkp = { x: this.target.x, y: this.target.y };
            
            // Si no estoy buscando cobertura, voy a por el objetivo
            enemy.navTarget = { x: this.target.x, y: this.target.y };
            
            if (enemy.canShoot && grid.hasLineOfSight(enemy.x, enemy.y, this.target.x, this.target.y)) {
                enemy.tryShoot(this.target);
            }
        } else {
            enemy.changeState(new AlertState(enemy.memory.lkp));
        }
    }
}

class RetreatState extends EnemyState {
    constructor(threat) {
        super();
        this.threat = threat;
        this.patience = 350; // 6 segundos intentando huir
    }
    enter(enemy) {
        enemy.stateIcon = '💔'; // Icono de pánico/herido
        enemy.iconColor = '#ff00ff'; 
        enemy.navTarget = null;
    }
    execute(enemy, grid, perception) {
        this.patience--;

        // 1. Buscar Cobertura (Sitio donde NO vea a la amenaza)
        if (!enemy.navTarget || enemy.hasReachedTarget()) {
            const cover = enemy.findCover(grid, this.threat);
            if (cover) {
                enemy.navTarget = cover;
            } else {
                // Si no hay cobertura, correr en dirección opuesta (Flee vector simple)
                const angle = Math.atan2(enemy.y - this.threat.y, enemy.x - this.threat.x);
                const fleeDist = 100;
                enemy.navTarget = {
                    x: enemy.x + Math.cos(angle) * fleeDist,
                    y: enemy.y + Math.sin(angle) * fleeDist
                };
            }
        }

        // 2. Condición de Salida: Si me curo (futuro) o pierdo de vista al enemigo mucho tiempo
        // Por ahora, si se acaba la paciencia, volvemos a Alert para reevaluar
        if (this.patience <= 0) {
            enemy.changeState(new AlertState(enemy.memory.lkp || {x: enemy.x, y: enemy.y}));
        }
    }
}

class AlertState extends EnemyState {
    constructor(lkp) {
        super();
        this.lkp = lkp;
        this.phase = 'APPROACH'; // APPROACH, OBSERVE, SWEEP
        this.timer = 0;
        this.sweeps = 0;
    }

    enter(enemy) {
        enemy.stateIcon = '?';
        enemy.iconColor = '#ffff00';
        this.executePhase(enemy);
    }

    execute(enemy, grid, perception) {
        if (perception.visibleEnemies.length > 0) {
            enemy.changeState(new CombatState(perception.visibleEnemies[0].entity));
            return;
        }

        this.timer--;
        if (this.timer <= 0) {
            this.executePhase(enemy);
        } else if (enemy.hasReachedTarget()) {
             // Si llega antes de que acabe el timer (ej. en Approach), pasamos a la siguiente fase
            this.timer = 0;
            this.executePhase(enemy);
        }
    }

    executePhase(enemy) {
        const grid = enemy.grid; // Necesitamos acceso al grid

        if (this.phase === 'APPROACH') {
            const vantagePoint = enemy.findVantagePoint(grid, this.lkp);
            enemy.navTarget = vantagePoint || this.lkp; // Fallback al LKP
            this.phase = 'OBSERVE';
            // No ponemos timer, la condición de llegada nos hará pasar de fase
        } 
        else if (this.phase === 'OBSERVE') {
            this.timer = 60; // 1 segundo de observación
            this.phase = 'SWEEP';
        }
        else if (this.phase === 'SWEEP') {
            if (this.sweeps >= 2) {
                enemy.changeState(new IdleState());
                return;
            }

            this.sweeps++;
            // Generar un punto aleatorio cercano para investigar
            const randomAngle = Math.random() * Math.PI * 2;
            const randomDist = 150 + Math.random() * 100; // Radio medio
            const searchPos = {
                x: enemy.x + Math.cos(randomAngle) * randomDist,
                y: enemy.y + Math.sin(randomAngle) * randomDist
            };
            
            // Buscar una posición segura cerca del punto aleatorio
            const safeSearchPoint = enemy.findVantagePoint(grid, searchPos);
            enemy.navTarget = safeSearchPoint || searchPos; // Fallback al punto aleatorio

            this.phase = 'SWEEP_MOVE';
        }
        else if (this.phase === 'SWEEP_MOVE') {
             // Al llegar al punto de sweep, observamos un poco y preparamos el siguiente sweep
            this.phase = 'OBSERVE';
            this.timer = 45; // 0.75s de observación
        }
    }
}

// --- CLASE ENEMIGO ACTUALIZADA ---

class Enemy extends LivingEntity {
    constructor(type, x, y) {
        super(x, y, '#fff', ENTITY_CONFIG.PLAYER_RADIUS, 100);
        
        this.type = type;
        this.configureArchetype(type);
        this.baseColor = this.color; 

        this.currentState = new IdleState();
        this.memory = { lkp: null }; 
        this.navTarget = null;
        this.wasHitRecently = 0; // Cooldown de "dolor"
        
        this.stateIcon = null;
        this.iconColor = '#fff';
        
        this.path = [];
        this.pathTimer = 0;
        this.shootTimer = 0;
    }

    configureArchetype(type) {
        this.radius = ENTITY_CONFIG.PLAYER_RADIUS;
        if (type === 'square') {
            this.hp = this.maxHp = 300;
            this.speedFactor = 0.8;
            this.color = '#ff0055';
            this.canShoot = false;
        } else if (type === 'circle') {
            this.hp = this.maxHp = 180;
            this.speedFactor = 1.3;
            this.color = '#ff9900';
            this.canShoot = false;
        } else if (type === 'diamond') {
            this.hp = this.maxHp = 150;
            this.speedFactor = 0.9;
            this.color = '#cc00ff';
            this.canShoot = true;
        }
    }

    changeState(newState) {
        if (this.currentState) this.currentState.exit(this);
        this.currentState = newState;
        this.currentState.enter(this);
    }

    update(grid, players, bullets, w, h, enemies) {
        if (this.isDead) return;
        this.grid = grid; // Referencia para estados complejos

        // Gestión del contador de dolor
        if (this.wasHitRecently > 0) this.wasHitRecently--;

        const perception = this.sense(grid, players);

        if (this.currentState) {
            this.currentState.execute(this, grid, perception);
        }

        this.move(grid, enemies);
        if (this.canShoot) this.updateCooldown(bullets);
    }

    // --- NUEVO CEREBRO TÁCTICO: BUSCAR COBERTURA ---
    findVantagePoint(grid, targetPos) {
        const searchRadius = 8; 
        const myGridPos = grid.pixelToGrid(this.x, this.y);
        let bestVantage = null;
        let bestScore = -1;

        for (let r = -searchRadius; r <= searchRadius; r++) {
            for (let c = -searchRadius; c <= searchRadius; c++) {
                const checkR = myGridPos.r + r;
                const checkC = myGridPos.c + c;
                
                if (grid.isValid(checkR, checkC) && (grid.map[checkR][checkC] === 0 || grid.map[checkR][checkC] === 3 || grid.map[checkR][checkC] === 4)) {
                    const pixelPos = grid.gridToPixel(checkR, checkC);
                    
                    if (grid.hasLineOfSight(pixelPos.x, pixelPos.y, targetPos.x, targetPos.y)) {
                        let score = 0;
                        let wallCount = 0;
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                if (dr === 0 && dc === 0) continue;
                                if (!grid.isValid(checkR + dr, checkC + dc) || grid.map[checkR + dr][checkC + dc] === 1) {
                                    wallCount++;
                                }
                            }
                        }

                        score += wallCount * 10; 

                        const distToMe = Math.hypot(pixelPos.x - this.x, pixelPos.y - this.y);
                        score -= distToMe / grid.cellSize;

                        if (score > bestScore) {
                            bestScore = score;
                            bestVantage = pixelPos;
                        }
                    }
                }
            }
        }
        return bestVantage;
    }

    findCover(grid, threat) {
        // Busca en un radio alrededor de sí mismo
        const searchRadius = 4; // Celdas
        const myGridPos = grid.pixelToGrid(this.x, this.y);
        let bestCover = null;
        let minDistToMe = Infinity;

        // Barrido simple alrededor
        for (let r = -searchRadius; r <= searchRadius; r++) {
            for (let c = -searchRadius; c <= searchRadius; c++) {
                const checkR = myGridPos.r + r;
                const checkC = myGridPos.c + c;
                
                // Si es un suelo válido (Pathfinder.isWalkable lógica manual aquí o helper)
                if (grid.isValid(checkR, checkC) && (grid.map[checkR][checkC] === 0 || grid.map[checkR][checkC] === 3 || grid.map[checkR][checkC] === 4)) {
                    const pixelPos = grid.gridToPixel(checkR, checkC);
                    
                    // CRÍTICO: ¿Desde aquí veo a la amenaza?
                    // Si NO la veo, es cobertura.
                    if (!grid.hasLineOfSight(pixelPos.x, pixelPos.y, threat.x, threat.y)) {
                        
                        // Queremos la cobertura más cercana a mí para llegar rápido
                        const distToMe = Math.hypot(pixelPos.x - this.x, pixelPos.y - this.y);
                        
                        // Pero que no me acerque al enemigo (Opcional, pero inteligente)
                        const distToEnemy = Math.hypot(pixelPos.x - threat.x, pixelPos.y - threat.y);
                        const currentDist = Math.hypot(this.x - threat.x, this.y - threat.y);

                        // Solo aceptamos cobertura si no me acerco suicidamente
                        if (distToMe < minDistToMe && distToEnemy >= currentDist * 0.8) {
                            minDistToMe = distToMe;
                            bestCover = pixelPos;
                        }
                    }
                }
            }
        }
        return bestCover;
    }

    hasReachedTarget() {
        if (!this.navTarget) return true;
        const dist = Math.hypot(this.navTarget.x - this.x, this.navTarget.y - this.y);
        return dist < this.radius;
    }

    // ... (Métodos sense, move, tryShoot, updateCooldown, drawUI se mantienen) ...
    
    sense(grid, players) {
        const visible = [];
        players.forEach(p => {
            if (p.isDead) return;
            const dist = Math.hypot(p.x - this.x, p.y - this.y);
            if (dist < ENTITY_CONFIG.ENEMY_VISION) {
                if (grid.hasLineOfSight(this.x, this.y, p.x, p.y)) {
                    visible.push({ entity: p, dist: dist });
                }
            }
        });
        visible.sort((a, b) => a.dist - b.dist);
        return { visibleEnemies: visible };
    }

    move(grid, enemies) {
        let moveX = 0;
        let moveY = 0;

        // --- Pathfinding Movement ---
        if (this.navTarget) {
            if (this.pathTimer > 0 && this.path.length > 0) {
                this.pathTimer--;
            } else {
                this.path = grid.getPath(this.x, this.y, this.navTarget.x, this.navTarget.y);
                this.pathTimer = 15;
            }

            if (this.path && this.path.length > 0) {
                const nextNode = this.path[0];
                const dx = nextNode.x - this.x;
                const dy = nextNode.y - this.y;
                const dist = Math.hypot(dx, dy);

                if (dist < this.radius * 0.5) { 
                    this.path.shift();
                } else {
                    const angle = Math.atan2(dy, dx);
                    const spd = ENTITY_CONFIG.ENEMY_SPEED * this.speedFactor;
                    moveX = Math.cos(angle) * spd;
                    moveY = Math.sin(angle) * spd;
                }
            }
        }

        // --- Separation Behavior ---
        let separationX = 0;
        let separationY = 0;
        const separationRadius = this.radius * 2.5; 
        let neighbors = 0;

        for (const other of enemies) {
            if (other === this || !other.alive) continue;
            
            const dist = Math.hypot(this.x - other.x, this.y - other.y);
            if (dist < separationRadius && dist > 0) {
                const dx = this.x - other.x;
                const dy = this.y - other.y;
                separationX += dx / dist;
                separationY += dy / dist;
                neighbors++;
            }
        }

        if (neighbors > 0) {
            separationX /= neighbors;
            separationY /= neighbors;
            const sepMag = Math.hypot(separationX, separationY);
            if (sepMag > 0) {
                const spd = ENTITY_CONFIG.ENEMY_SPEED * this.speedFactor;
                separationX = (separationX / sepMag) * spd * 1.2; // Separation is slightly stronger
                separationY = (separationY / sepMag) * spd * 1.2;
                
                // --- Blend Behaviors ---
                moveX = moveX * 0.6 + separationX * 0.4;
                moveY = moveY * 0.6 + separationY * 0.4;
            }
        }

        if (Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01) {
            if (!grid.checkCollision(this.x + moveX, this.y, this.radius)) this.x += moveX;
            if (!grid.checkCollision(this.x, this.y + moveY, this.radius)) this.y += moveY;
        }
    }

    tryShoot(target) {
        if (this.shootTimer <= 0) {
            const angle = Math.atan2(target.y - this.y, target.x - this.x);
            this.shootQueue = angle; 
            this.shootTimer = ENTITY_CONFIG.ENEMY_FIRE_RATE;
        }
    }

    updateCooldown(bullets) {
        if (this.shootQueue !== undefined) {
            bullets.push(new Bullet(this.x, this.y, this.shootQueue, 'enemy', this.color));
            this.shootQueue = undefined;
        }
        if (this.shootTimer > 0) this.shootTimer--;
    }

    takeDamage(amount) {
        super.takeDamage(amount);
        
        // ¡Me han dado! Activar instinto de conservación
        this.wasHitRecently = 60; // 1 segundo de "pánico/alerta" por impacto

        if (this.currentState instanceof IdleState) {
            this.changeState(new AlertState({ x: this.x, y: this.y }));
        }
    }

    draw(ctx) {
        // Copiar el draw anterior, asegurando que llama a this.drawUI(ctx)
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        if (this.type === 'circle') {
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        } else if (this.type === 'square') {
            ctx.rect(this.x - this.radius, this.y - this.radius, this.radius*2, this.radius*2);
        } else if (this.type === 'diamond') {
            const r = this.radius * 1.2;
            ctx.moveTo(this.x, this.y - r);
            ctx.lineTo(this.x + r, this.y);
            ctx.lineTo(this.x, this.y + r);
            ctx.lineTo(this.x - r, this.y);
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        this.drawUI(ctx);
        // Debug LKP
        if (this.memory.lkp) {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const sz = 6;
            ctx.moveTo(this.memory.lkp.x - sz, this.memory.lkp.y - sz);
            ctx.lineTo(this.memory.lkp.x + sz, this.memory.lkp.y + sz);
            ctx.moveTo(this.memory.lkp.x + sz, this.memory.lkp.y - sz);
            ctx.lineTo(this.memory.lkp.x - sz, this.memory.lkp.y + sz);
            ctx.stroke();
        }
    }

    drawUI(ctx) {
        super.drawUI(ctx); 
        if (this.stateIcon) {
            const y = this.y - this.radius - ENTITY_CONFIG.UI_Y_OFFSET - 5;
            ctx.textAlign = 'center';
            ctx.font = `bold ${this.radius * 1.8}px monospace`;
            ctx.fillStyle = this.iconColor;
            ctx.shadowBlur = 5;
            ctx.shadowColor = this.iconColor;
            ctx.fillText(this.stateIcon, this.x, y);
            ctx.shadowBlur = 0;
        }
    }
}