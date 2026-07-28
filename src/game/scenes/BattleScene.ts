import Phaser from "phaser";
import { WEAPON_BY_ID } from "../data/weapons";
import { powerScore, rankForScore } from "../data/progression";
import type { BattleLaunch, BattleResult, FighterId, WeaponId, WeaponLevel } from "../types";

interface ProjectileState {
  readonly damage: number;
  readonly weapon: WeaponId | "enemy";
  readonly piercing: boolean;
  readonly homing: boolean;
  readonly bornAt: number;
  readonly originY: number;
  readonly hitTargets: WeakSet<Phaser.GameObjects.GameObject>;
}

interface EnemyState {
  hp: number;
  readonly maxHp: number;
  readonly elite: boolean;
  readonly boss: boolean;
  readonly phaseSeed: number;
  readonly playerDamageAtSpawn: number;
  nextShotAt: number;
}

interface PickupState {
  readonly kind: "weapon" | "chip" | "heal" | "data";
  readonly weapon?: WeaponId;
}

export interface BattleHudSnapshot {
  readonly hp: number;
  readonly maxHp: number;
  readonly score: number;
  readonly combo: number;
  readonly weapon: WeaponId;
  readonly weaponLevel: WeaponLevel;
  readonly ultimate: number;
  readonly bossHp: number;
  readonly bossMaxHp: number;
  readonly tacticalData: number;
  readonly heat: number;
  readonly charge: number;
}

const WIDTH = 720;
const HEIGHT = 1080;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export class BattleScene extends Phaser.Scene {
  private launch?: BattleLaunch;
  private player?: Phaser.Physics.Arcade.Image;
  private playerBullets?: Phaser.Physics.Arcade.Group;
  private enemyBullets?: Phaser.Physics.Arcade.Group;
  private enemies?: Phaser.Physics.Arcade.Group;
  private pickups?: Phaser.Physics.Arcade.Group;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keyE?: Phaser.Input.Keyboard.Key;
  private keyX?: Phaser.Input.Keyboard.Key;
  private readonly projectiles = new WeakMap<Phaser.GameObjects.GameObject, ProjectileState>();
  private readonly grazedProjectiles = new WeakSet<Phaser.GameObjects.GameObject>();
  private readonly enemyStates = new WeakMap<Phaser.GameObjects.GameObject, EnemyState>();
  private readonly pickupStates = new WeakMap<Phaser.GameObjects.GameObject, PickupState>();
  private weapon: WeaponId = "pulse";
  private weaponLevel: WeaponLevel = 1;
  private pendingWeapon?: WeaponId;
  private pendingUntil = 0;
  private hp = 100;
  private maxHp = 100;
  private score = 0;
  private combo = 0;
  private ultimate = 0;
  private tacticalData = 0;
  private defeated = 0;
  private grazes = 0;
  private damageTaken = 0;
  private noDamageEliteWaves = 0;
  private bossStartedAt = 0;
  private lastMoveAt = 0;
  private startedAt = 0;
  private nextShotAt = 0;
  private nextWaveAt = 0;
  private nextHazardAt = 0;
  private nextHudAt = 0;
  private heat = 0;
  private charge = 0;
  private boss?: Phaser.Physics.Arcade.Image;
  private bossSpawned = false;
  private battleEnded = false;
  private ultimateUntil = 0;
  private invulnerableUntil = 0;
  private pointerActive = false;
  private readonly collectedWeapons = new Set<WeaponId>();
  private readonly weaponUsage: Partial<Record<WeaponId, number>> = {};
  private readonly handleGlobalKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !this.battleEnded) this.togglePause();
  };

  public constructor() {
    super("BattleScene");
  }

  public init(data: BattleLaunch): void {
    this.launch = data;
    this.resetRuntime();
  }

  public create(): void {
    const launch = this.launch;
    if (!launch) throw new Error("缺少战斗启动参数");
    this.physics.world.setBounds(24, 0, WIDTH - 48, HEIGHT);
    this.createTextures();
    this.createBackdrop();
    this.createGroups();
    const level = launch.fighter.levels[launch.fighterLevel - 1];
    if (!level) throw new Error("战机等级配置缺失");
    this.maxHp = 70 + level.stats.armor * 10;
    this.hp = this.maxHp;
    this.player = this.physics.add.image(WIDTH / 2, HEIGHT - 150, "player");
    this.player.setCollideWorldBounds(true).setDepth(20).setCircle(10, 18, 18);
    const body = this.player.body;
    if (body instanceof Phaser.Physics.Arcade.Body) body.setMaxVelocity(520, 520);
    this.setupInput();
    this.setupCollisions();
    window.addEventListener("keydown", this.handleGlobalKeydown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("keydown", this.handleGlobalKeydown));
    this.startedAt = this.time.now;
    this.lastMoveAt = this.time.now;
    this.nextWaveAt = this.time.now + 600;
    this.nextHazardAt = this.time.now + 4200;
    this.game.events.emit("battle:story", { speaker: "林烬", text: launch.stage.briefing, tone: "briefing" });
    this.time.delayedCall(2600, () => this.game.events.emit("battle:story", { speaker: "弥光", text: `${launch.stage.location} 已进入武器范围。环境机制：${launch.stage.mechanic}`, tone: "radio" }));
  }

  public override update(time: number, delta: number): void {
    if (!this.launch || !this.player || this.battleEnded || this.scene.isPaused()) return;
    this.updatePlayer(time, delta);
    this.updateWeapons(time, delta);
    this.updateEnemies(time);
    this.updateEnvironment(time);
    this.updateProjectiles(time, delta);
    this.updatePickups(delta);
    if (!this.bossSpawned && this.defeated >= 12 + Math.min(10, this.launch.stage.order)) this.spawnBoss();
    if (!this.bossSpawned && time >= this.nextWaveAt) this.spawnWave(time);
    if (this.pendingWeapon && time > this.pendingUntil) this.pendingWeapon = undefined;
    if (time >= this.nextHudAt) {
      this.emitHud();
      this.nextHudAt = time + 80;
    }
  }

  public confirmWeaponSwap(): void {
    if (!this.pendingWeapon) return;
    const launch = this.launch;
    const preserveRelicLevel = launch?.fighter.id === "relic" && launch.fighterLevel === 3 && this.collectedWeapons.size === 1;
    const preserveFalconLevel = launch?.fighter.id === "falcon" && launch.fighterLevel === 3;
    this.weapon = this.pendingWeapon;
    this.weaponLevel = preserveRelicLevel ? this.weaponLevel : preserveFalconLevel ? 2 : 1;
    this.collectedWeapons.add(this.weapon);
    this.pendingWeapon = undefined;
    this.heat = 0;
    this.charge = 0;
    this.game.events.emit("battle:notice", `已装配 ${WEAPON_BY_ID[this.weapon].name}`);
  }

  public activateUltimate(): void {
    const launch = this.launch;
    if (!launch || this.ultimate < 100 || this.battleEnded) return;
    this.ultimate = 0;
    const fighter = launch.fighter;
    const duration = fighter.ultimate.durationMs + (launch.fighterLevel - 1) * 450;
    this.ultimateUntil = this.time.now + duration;
    this.invulnerableUntil = this.time.now + (fighter.id === "phantom" ? duration : 900);
    this.cameras.main.flash(260, (fighter.ultimate.color >> 16) & 255, (fighter.ultimate.color >> 8) & 255, fighter.ultimate.color & 255, false);
    this.game.events.emit("battle:ultimate", { name: fighter.ultimate.name, description: fighter.ultimate.description });
    this.executeUltimateBurst(fighter.id);
  }

  public togglePause(): void {
    if (this.scene.isPaused()) this.scene.resume();
    else this.scene.pause();
    this.game.events.emit("battle:pause", this.scene.isPaused());
  }

  private resetRuntime(): void {
    this.weapon = "pulse";
    this.weaponLevel = 1;
    this.pendingWeapon = undefined;
    this.hp = 100;
    this.maxHp = 100;
    this.score = 0;
    this.combo = 0;
    this.ultimate = 0;
    this.tacticalData = 0;
    this.defeated = 0;
    this.grazes = 0;
    this.damageTaken = 0;
    this.noDamageEliteWaves = 0;
    this.bossStartedAt = 0;
    this.lastMoveAt = 0;
    this.collectedWeapons.clear();
    this.collectedWeapons.add("pulse");
    this.nextShotAt = 0;
    this.nextWaveAt = 0;
    this.nextHazardAt = 0;
    this.nextHudAt = 0;
    this.heat = 0;
    this.charge = 0;
    this.boss = undefined;
    this.bossSpawned = false;
    this.battleEnded = false;
    this.ultimateUntil = 0;
    this.invulnerableUntil = 0;
    this.pointerActive = false;
    for (const id of Object.keys(this.weaponUsage)) delete this.weaponUsage[id as WeaponId];
  }

  private createTextures(): void {
    const launch = this.launch;
    if (!launch) return;
    const playerGraphic = this.make.graphics({ x: 0, y: 0 });
    playerGraphic.fillStyle(launch.fighter.color, 1);
    playerGraphic.fillTriangle(32, 0, 4, 58, 32, 44);
    playerGraphic.fillTriangle(32, 0, 60, 58, 32, 44);
    playerGraphic.fillStyle(0xf3f8ff, 0.95).fillCircle(32, 29, 6);
    if (launch.fighterLevel >= 2) playerGraphic.lineStyle(4, 0xffb547, 0.9).strokeTriangle(32, 3, 6, 56, 58, 56);
    if (launch.fighterLevel === 3) playerGraphic.fillStyle(launch.fighter.ultimate.color, 0.8).fillCircle(8, 48, 5).fillCircle(56, 48, 5);
    playerGraphic.generateTexture("player", 64, 64).destroy();

    this.make.graphics({ x: 0, y: 0 }).fillStyle(0xff4d6d).fillTriangle(22, 44, 2, 2, 22, 12).fillTriangle(22, 44, 42, 2, 22, 12).generateTexture("enemy", 44, 46).destroy();
    const bossGraphic = this.make.graphics({ x: 0, y: 0 });
    const bossVariant = launch.stage.order;
    const bossRadius = 38 + bossVariant % 4 * 4;
    bossGraphic.fillStyle(launch.stage.bossColor).fillCircle(70, 62, bossRadius);
    bossGraphic.fillStyle(launch.stage.bossColor, 0.78).fillTriangle(70, 4, 3 + bossVariant % 17, 92, 70, 76).fillTriangle(70, 4, 137 - bossVariant % 17, 92, 70, 76);
    const nodeCount = 3 + bossVariant % 5;
    for (let index = 0; index < nodeCount; index += 1) {
      const angle = index * Math.PI * 2 / nodeCount + bossVariant * 0.17;
      bossGraphic.fillStyle(0xf3f8ff, 0.85).fillCircle(70 + Math.cos(angle) * 49, 62 + Math.sin(angle) * 42, 3 + bossVariant % 3);
    }
    bossGraphic.fillStyle(0x050914).fillCircle(70, 62, 16 + bossVariant % 5).lineStyle(4 + bossVariant % 3, 0xf3f8ff, 0.72).strokeCircle(70, 62, 51 + bossVariant % 5);
    bossGraphic.generateTexture("boss", 140, 125).destroy();
    this.make.graphics({ x: 0, y: 0 }).fillStyle(0xff4d6d).fillCircle(6, 6, 6).generateTexture("enemy-bullet", 12, 12).destroy();
    this.make.graphics({ x: 0, y: 0 }).fillStyle(0x3de19a).fillCircle(15, 15, 13).lineStyle(3, 0xf3f8ff).strokeCircle(15, 15, 13).generateTexture("pickup", 30, 30).destroy();
    for (const weapon of Object.values(WEAPON_BY_ID)) {
      const graphic = this.make.graphics({ x: 0, y: 0 });
      graphic.fillStyle(weapon.color).fillRoundedRect(0, 0, weapon.id === "rail" ? 14 : 8, weapon.id === "rail" ? 36 : 24, 4);
      graphic.generateTexture(`bullet-${weapon.id}`, weapon.id === "rail" ? 14 : 8, weapon.id === "rail" ? 36 : 24).destroy();
    }
  }

  private createBackdrop(): void {
    const launch = this.launch;
    if (!launch) return;
    this.cameras.main.setBackgroundColor(0x050914);
    const nebula = this.add.graphics().setDepth(-10);
    nebula.fillGradientStyle(0x050914, 0x0b1628, 0x132a42, 0x050914, 1);
    nebula.fillRect(0, 0, WIDTH, HEIGHT);
    const random = new Phaser.Math.RandomDataGenerator([launch.stage.id]);
    for (let index = 0; index < 130; index += 1) {
      const size = random.between(1, 3);
      nebula.fillStyle(index % 9 === 0 ? launch.stage.bossColor : 0x9db2c8, random.realInRange(0.2, 0.8));
      nebula.fillCircle(random.between(20, WIDTH - 20), random.between(0, HEIGHT), size);
    }
    const lane = this.add.graphics().setDepth(-5);
    lane.lineStyle(2, launch.stage.bossColor, 0.12);
    for (let x = 80; x < WIDTH; x += 140) lane.lineBetween(x, 0, x - 50, HEIGHT);
  }

  private createGroups(): void {
    this.playerBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 240 });
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 900 });
    this.enemies = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 80 });
    this.pickups = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 40 });
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyE = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      this.keyX = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    }
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > 120) this.pointerActive = true;
    });
    this.input.on("pointerup", () => { this.pointerActive = false; });
  }

  private setupCollisions(): void {
    if (!this.player || !this.playerBullets || !this.enemyBullets || !this.enemies || !this.pickups) return;
    this.physics.add.overlap(this.playerBullets, this.enemies, (first, second) => this.onProjectileHitsEnemy(first, second));
    this.physics.add.overlap(this.player, this.enemyBullets, (_player, bullet) => this.onPlayerHit(bullet));
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => this.onPlayerCollision(enemy));
    this.physics.add.overlap(this.player, this.pickups, (_player, pickup) => this.onPickup(pickup));
  }

  private updatePlayer(time: number, _delta: number): void {
    const player = this.player;
    const launch = this.launch;
    if (!player || !launch) return;
    const definition = launch.fighter.levels[launch.fighterLevel - 1];
    if (!definition) return;
    const speed = 220 + definition.stats.mobility * 14;
    let horizontal = 0;
    let vertical = 0;
    if (this.cursors?.left.isDown || this.keyA?.isDown) horizontal -= 1;
    if (this.cursors?.right.isDown || this.keyD?.isDown) horizontal += 1;
    if (this.cursors?.up.isDown || this.keyW?.isDown) vertical -= 1;
    if (this.cursors?.down.isDown || this.keyS?.isDown) vertical += 1;
    if (this.pointerActive) {
      const pointer = this.input.activePointer;
      const distance = Phaser.Math.Distance.Between(player.x, player.y, pointer.x, pointer.y);
      if (distance > 8) {
        const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.x, pointer.y);
        horizontal = Math.cos(angle);
        vertical = Math.sin(angle);
      }
    }
    const movementMagnitude = Math.hypot(horizontal, vertical);
    const magnitude = movementMagnitude || 1;
    player.setVelocity(horizontal / magnitude * speed, vertical / magnitude * speed);
    if (movementMagnitude > 0.05) this.lastMoveAt = time;
    const swapKey = this.keyE ?? this.cursors?.space;
    const ultimateKey = this.keyX ?? this.cursors?.shift;
    if (swapKey && Phaser.Input.Keyboard.JustDown(swapKey)) this.confirmWeaponSwap();
    if (ultimateKey && Phaser.Input.Keyboard.JustDown(ultimateKey)) this.activateUltimate();
    player.setAlpha(time < this.invulnerableUntil && Math.floor(time / 80) % 2 === 0 ? 0.38 : 1);
  }

  private updateWeapons(time: number, delta: number): void {
    const launch = this.launch;
    if (!launch || !this.player) return;
    const definition = launch.fighter.levels[launch.fighterLevel - 1];
    if (!definition) return;
    const current = WEAPON_BY_ID[this.weapon];
    const affinity = launch.fighter.weaponAffinity.includes(this.weapon) ? 1.05 : 1;
    const ultimateRate = time < this.ultimateUntil ? 0.35 : 1;
    const interval = current.fireIntervalMs / (0.78 + 0.045 * definition.stats.rate) * ultimateRate;
    if (this.weapon === "laser") this.heat = clamp(this.heat - delta * 0.018, 0, 100);
    if (this.weapon === "rail") this.charge = clamp(this.charge + delta * 0.06, 0, 100);
    if (time < this.nextShotAt || (this.weapon === "laser" && this.heat > 90) || (this.weapon === "rail" && this.charge < 100)) return;
    const damage = current.baseDamage * (0.72 + 0.055 * definition.stats.firepower) * (1 + (this.weaponLevel - 1) * 0.14) * affinity;
    this.fireWeapon(this.weapon, damage, time);
    this.weaponUsage[this.weapon] = (this.weaponUsage[this.weapon] ?? 0) + 1;
    this.nextShotAt = time + interval;
    if (this.weapon === "laser") this.heat = clamp(this.heat + 16, 0, 100);
    if (this.weapon === "rail") this.charge = 0;
  }

  private fireWeapon(weapon: WeaponId, damage: number, time: number): void {
    const player = this.player;
    if (!player) return;
    switch (weapon) {
      case "pulse":
        for (let index = 0; index < this.weaponLevel; index += 1) this.spawnPlayerBullet(player.x + (index - (this.weaponLevel - 1) / 2) * 13, player.y - 28, 0, -760, damage, weapon, this.weaponLevel === 3);
        break;
      case "laser":
        this.spawnPlayerBullet(player.x, player.y - 42, 0, -1050, damage, weapon, true, 2.6);
        break;
      case "drone": {
        const spread = this.weaponLevel === 1 ? [-24, 24] : this.weaponLevel === 2 ? [-38, 0, 38] : [-54, -18, 18, 54];
        for (const offset of spread) this.spawnPlayerBullet(player.x + offset, player.y - 18, offset * 1.8, -620, damage * 0.7, weapon, false, 1, true);
        break;
      }
      case "scatter": {
        const count = 3 + this.weaponLevel * 2;
        for (let index = 0; index < count; index += 1) {
          const angle = Phaser.Math.DegToRad(-110 + index * (40 / (count - 1)));
          this.spawnPlayerBullet(player.x, player.y - 22, Math.cos(angle) * 700, Math.sin(angle) * 700, damage, weapon, false);
        }
        break;
      }
      case "missile":
        for (let index = 0; index < this.weaponLevel + 1; index += 1) this.spawnPlayerBullet(player.x + (index % 2 === 0 ? -22 : 22), player.y, (index % 2 === 0 ? -1 : 1) * 120, -420, damage, weapon, false, 1.5, true);
        break;
      case "rail":
        this.spawnPlayerBullet(player.x, player.y - 38, 0, -900, damage * (1.8 + this.weaponLevel * 0.35), weapon, true, 2.3);
        this.cameras.main.shake(80, 0.003);
        break;
    }
    if (time < this.ultimateUntil && this.launch?.fighter.id === "titan") {
      this.spawnPlayerBullet(player.x - 44, player.y, -90, -650, damage * 0.7, "pulse", false);
      this.spawnPlayerBullet(player.x + 44, player.y, 90, -650, damage * 0.7, "pulse", false);
    }
  }

  private spawnPlayerBullet(x: number, y: number, velocityX: number, velocityY: number, damage: number, weapon: WeaponId, piercing: boolean, scale = 1, homing = false): void {
    const group = this.playerBullets;
    if (!group) return;
    const object = group.get(x, y, `bullet-${weapon}`);
    if (!(object instanceof Phaser.Physics.Arcade.Image)) return;
    object.enableBody(true, x, y, true, true).setTexture(`bullet-${weapon}`).setScale(scale).setDepth(15).setVelocity(velocityX, velocityY);
    this.projectiles.set(object, { damage, weapon, piercing, homing, bornAt: this.time.now, originY: y, hitTargets: new WeakSet() });
  }

  private updateEnemies(time: number): void {
    const group = this.enemies;
    const player = this.player;
    if (!group || !player) return;
    for (const item of group.getChildren()) {
      if (!(item instanceof Phaser.Physics.Arcade.Image) || !item.active) continue;
      const state = this.enemyStates.get(item);
      if (!state) continue;
      if (!state.boss && item.y > HEIGHT + 80) {
        item.disableBody(true, true);
        continue;
      }
      if (time >= state.nextShotAt) {
        const angle = Phaser.Math.Angle.Between(item.x, item.y, player.x, player.y);
        if (state.boss) this.fireBossPattern(item, state, time);
        else this.spawnEnemyBullet(item.x, item.y + 12, Math.cos(angle) * 170, Math.sin(angle) * 170);
        state.nextShotAt = time + (state.boss ? Math.max(360, 970 - (this.launch?.stage.order ?? 1) * 18) : 1450);
      }
      if (state.boss) {
        const movement = state.phaseSeed % 4;
        const frequency = 780 + state.phaseSeed * 23;
        const amplitude = 125 + state.phaseSeed % 6 * 22;
        item.x = WIDTH / 2 + Math.sin(time / frequency) * amplitude;
        item.y = movement === 0 ? 165 + Math.cos(time / 1300) * 48 : movement === 1 ? 150 + Math.abs(Math.sin(time / 980)) * 95 : movement === 2 ? 185 + Math.sin(time / 620) * 30 : 145 + Math.cos(time / 1700) * 70;
      }
    }
  }

  private updateEnvironment(time: number): void {
    const launch = this.launch;
    if (!launch || time < this.nextHazardAt || this.bossSpawned) return;
    const order = launch.stage.order;
    const difficulty = Math.min(9, 3 + Math.floor(order / 4));
    const primary = (order - 1) % 5;
    const secondary = Math.floor((order - 1) / 5) % 5;
    this.game.events.emit("battle:notice", `环境预警 // ${launch.stage.mechanic}`);
    this.time.delayedCall(720, () => {
      if (this.battleEnded || this.bossSpawned) return;
      this.emitEnvironmentPattern(primary, difficulty, order);
      if (order > 5 && secondary !== primary) this.time.delayedCall(260 + order * 7, () => this.emitEnvironmentPattern(secondary, Math.max(3, difficulty - 1), order + 3));
    });
    this.nextHazardAt = time + Math.max(4200, 7200 - order * 80);
  }

  private emitEnvironmentPattern(variant: number, difficulty: number, seed: number): void {
    if (this.battleEnded || this.bossSpawned) return;
    if (variant === 0) {
      const gap = seed % Math.max(2, difficulty - 1);
      for (let index = 0; index < difficulty; index += 1) {
        if (index === gap) continue;
        this.spawnEnemyBullet(65 + index * (WIDTH - 130) / Math.max(1, difficulty - 1), -15, 0, 220 + seed * 2);
      }
    } else if (variant === 1) {
      for (let index = 0; index < difficulty; index += 1) this.spawnEnemyBullet(-12, 160 + index * (780 / difficulty), 205 + seed * 2, 38 + index * 9);
    } else if (variant === 2) {
      for (let index = 0; index < difficulty + 2; index += 1) {
        const angle = index * Math.PI * 2 / (difficulty + 2) + seed * 0.21;
        this.spawnEnemyBullet(WIDTH / 2, HEIGHT / 3, Math.cos(angle) * (170 + seed * 2), Math.sin(angle) * (170 + seed * 2));
      }
    } else if (variant === 3) {
      for (let index = 0; index < difficulty; index += 1) this.spawnEnemyBullet(WIDTH + 12, 150 + index * (800 / difficulty), -210 - seed * 2, 48 - index * 5);
    } else {
      const targetX = this.player?.x ?? WIDTH / 2;
      for (let index = -2; index <= 2; index += 1) this.spawnEnemyBullet(targetX + index * (36 + seed % 9), -15, index * (14 + seed % 7), 245 + seed * 3);
    }
  }

  private updateProjectiles(time: number, _delta: number): void {
    const updateGroup = (group: Phaser.Physics.Arcade.Group | undefined): void => {
      if (!group) return;
      for (const item of group.getChildren()) {
        if (!(item instanceof Phaser.Physics.Arcade.Image) || !item.active) continue;
        const state = this.projectiles.get(item);
        if (state?.homing) {
          const target = this.findNearestEnemy(item.x, item.y);
          if (target) this.physics.moveToObject(item, target, 520);
        }
        if (state?.weapon === "enemy" && this.player && !this.grazedProjectiles.has(item)) {
          const distance = Phaser.Math.Distance.Between(item.x, item.y, this.player.x, this.player.y);
          if (distance >= 20 && distance <= 46) {
            this.grazedProjectiles.add(item);
            this.grazes += 1;
            const energyMultiplier = 1 + (this.launch?.fighter.levels[(this.launch.fighterLevel ?? 1) - 1]?.stats.energy ?? 5) * 0.025;
            this.ultimate = clamp(this.ultimate + 1.5 * energyMultiplier, 0, 100);
            if (this.launch?.fighter.id === "phantom") this.score += 45;
          }
        }
        if (item.y < -90 || item.y > HEIGHT + 90 || item.x < -90 || item.x > WIDTH + 90 || (state && time - state.bornAt > 5000)) item.disableBody(true, true);
      }
    };
    updateGroup(this.playerBullets);
    updateGroup(this.enemyBullets);
  }

  private updatePickups(delta: number): void {
    const player = this.player;
    const group = this.pickups;
    if (!player || !group) return;
    for (const item of group.getChildren()) {
      if (!(item instanceof Phaser.Physics.Arcade.Image) || !item.active) continue;
      const distance = Phaser.Math.Distance.Between(item.x, item.y, player.x, player.y);
      const range = this.launch?.fighter.id === "polaris" ? 230 : 125;
      if (distance < range) this.physics.moveToObject(item, player, 250 + delta * 0.1);
      const body = item.body;
      if (this.launch?.fighter.id === "polaris" && this.launch.fighterLevel >= 2 && distance < 170 && body instanceof Phaser.Physics.Arcade.Body) item.setVelocity(body.velocity.x * 0.82, body.velocity.y * 0.82);
      if (item.y > HEIGHT + 50) item.disableBody(true, true);
    }
  }

  private spawnWave(time: number): void {
    const launch = this.launch;
    if (!launch) return;
    const wave = Math.floor((time - this.startedAt) / 2900);
    const count = 3 + Math.min(4, Math.floor(launch.stage.order / 4));
    for (let index = 0; index < count; index += 1) {
      const x = 90 + index * ((WIDTH - 180) / Math.max(1, count - 1));
      this.spawnEnemy(x, -50 - index * 36, wave % 5 === 4 && index === Math.floor(count / 2));
    }
    this.nextWaveAt = time + Math.max(1500, 2900 - launch.stage.order * 36);
  }

  private spawnEnemy(x: number, y: number, elite: boolean): void {
    const group = this.enemies;
    const launch = this.launch;
    if (!group || !launch) return;
    const object = group.get(x, y, "enemy");
    if (!(object instanceof Phaser.Physics.Arcade.Image)) return;
    const hp = (elite ? 85 : 34) * (1 + launch.stage.order * 0.075);
    object.enableBody(true, x, y, true, true).setTexture("enemy").setScale(elite ? 1.25 : 0.9).setTint(elite ? 0xffb547 : 0xffffff).setDepth(10).setVelocity((x - WIDTH / 2) * -0.08, 95 + launch.stage.order * 3.5);
    this.enemyStates.set(object, { hp, maxHp: hp, elite, boss: false, phaseSeed: this.defeated, playerDamageAtSpawn: this.damageTaken, nextShotAt: this.time.now + 600 + Math.random() * 700 });
  }

  private spawnBoss(): void {
    const group = this.enemies;
    const launch = this.launch;
    if (!group || !launch || this.bossSpawned) return;
    this.bossSpawned = true;
    const object = group.get(WIDTH / 2, 145, "boss");
    if (!(object instanceof Phaser.Physics.Arcade.Image)) return;
    const hp = 1300 + launch.stage.threat * 11;
    object.enableBody(true, WIDTH / 2, 145, true, true).setTexture("boss").setDepth(12).setImmovable(true);
    this.enemyStates.set(object, { hp, maxHp: hp, elite: true, boss: true, phaseSeed: launch.stage.order, playerDamageAtSpawn: this.damageTaken, nextShotAt: this.time.now + 1200 });
    this.bossStartedAt = this.time.now;
    this.boss = object;
    this.game.events.emit("battle:boss", { name: launch.stage.bossName, title: launch.stage.bossTitle, quote: launch.stage.bossQuote });
    this.cameras.main.flash(350, 255, 77, 109, false);
  }

  private fireBossPattern(boss: Phaser.Physics.Arcade.Image, state: EnemyState, time: number): void {
    const order = state.phaseSeed;
    const hpRatio = state.hp / state.maxHp;
    const phase = hpRatio < 0.35 ? 2 : hpRatio < 0.68 ? 1 : 0;
    const count = 7 + phase * 3 + order % 4;
    const speed = 175 + order * 3 + phase * 24;
    const primary = (order - 1) % 6;
    const secondary = Math.floor((order - 1) / 6) % 6;
    this.emitBossPattern(primary, boss, count, speed, time, order * 0.11);
    if (phase > 0 && secondary !== primary) this.emitBossPattern(secondary, boss, Math.max(4, count - 3), speed * 0.78, time, order * 0.19 + phase);
  }

  private emitBossPattern(pattern: number, boss: Phaser.Physics.Arcade.Image, count: number, speed: number, time: number, offset: number): void {
    const player = this.player;
    switch (pattern) {
      case 0:
        for (let index = 0; index < count; index += 1) {
          const angle = time / 900 + offset + index * Math.PI * 2 / count;
          this.spawnEnemyBullet(boss.x, boss.y, Math.cos(angle) * speed, Math.sin(angle) * speed);
        }
        break;
      case 1:
        for (let index = 0; index < count; index += 1) this.spawnEnemyBullet(boss.x, boss.y + 20, (index - (count - 1) / 2) * 42, speed);
        break;
      case 2:
        if (!player) return;
        for (let index = -3; index <= 3; index += 1) {
          const angle = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y) + index * (0.1 + offset % 0.06);
          this.spawnEnemyBullet(boss.x, boss.y, Math.cos(angle) * speed * 1.18, Math.sin(angle) * speed * 1.18);
        }
        break;
      case 3:
        for (let index = 0; index < count; index += 1) {
          const angle = -Math.PI * 0.9 + index * Math.PI * 0.8 / Math.max(1, count - 1);
          this.spawnEnemyBullet(boss.x, boss.y, Math.cos(angle) * speed, Math.sin(angle) * speed);
        }
        break;
      case 4:
        for (let index = 0; index < count; index += 1) {
          const angle = offset + index * Math.PI * 2 / count;
          const alternatingSpeed = speed * (index % 2 === 0 ? 1.2 : 0.65);
          this.spawnEnemyBullet(boss.x, boss.y, Math.cos(angle) * alternatingSpeed, Math.sin(angle) * alternatingSpeed);
        }
        break;
      default:
        for (let index = 0; index < count; index += 1) {
          const side = index % 2 === 0 ? -1 : 1;
          this.spawnEnemyBullet(boss.x + side * 42, boss.y, side * (55 + index * 9), speed + index * 8);
        }
    }
  }

  private spawnEnemyBullet(x: number, y: number, velocityX: number, velocityY: number): void {
    const group = this.enemyBullets;
    if (!group) return;
    const object = group.get(x, y, "enemy-bullet");
    if (!(object instanceof Phaser.Physics.Arcade.Image)) return;
    object.enableBody(true, x, y, true, true).setTexture("enemy-bullet").setDepth(14).setVelocity(velocityX, velocityY);
    this.projectiles.set(object, { damage: 13 + (this.launch?.stage.order ?? 1) * 0.8, weapon: "enemy", piercing: false, homing: false, bornAt: this.time.now, originY: y, hitTargets: new WeakSet() });
  }

  private onProjectileHitsEnemy(first: unknown, second: unknown): void {
    if (!(first instanceof Phaser.Physics.Arcade.Image) || !(second instanceof Phaser.Physics.Arcade.Image)) return;
    const projectile = this.projectiles.get(first);
    const enemy = this.enemyStates.get(second);
    const launch = this.launch;
    if (!projectile || !enemy || projectile.weapon === "enemy" || !launch || projectile.hitTargets.has(second)) return;
    projectile.hitTargets.add(second);
    let damage = projectile.damage;
    if (projectile.weapon === "scatter") damage *= clamp(1 - Math.abs(projectile.originY - second.y) / 1500, 0.7, 1);
    if (launch.fighter.id === "prism" && projectile.weapon === "laser" && launch.fighterLevel >= 2) damage *= 1.08 + (launch.fighterLevel - 2) * 0.08;
    if (launch.fighter.id === "eclipse" && projectile.weapon === "rail" && projectile.damage >= WEAPON_BY_ID.rail.baseDamage * 1.5) {
      damage *= 1.1 + launch.fighterLevel * 0.04;
      if (launch.fighterLevel === 3) this.ultimate = clamp(this.ultimate + 2.5, 0, 100);
    }
    if (launch.fighter.id === "falcon") damage *= 1 + Math.min(25, this.combo) * (launch.fighterLevel === 1 ? 0.006 : 0.009);
    if (launch.fighter.id === "phantom") damage *= 1 + Math.min(10, this.grazes) * 0.025;
    if (launch.fighter.id === "titan" && this.time.now - this.lastMoveAt > 800) damage *= 1.18 + (launch.fighterLevel - 1) * 0.05;
    if (launch.fighter.id === "core" && this.player && Phaser.Math.Distance.Between(this.player.x, this.player.y, second.x, second.y) < 260) damage *= 1.24;
    if (this.time.now < this.ultimateUntil) damage *= 1.35;
    enemy.hp -= damage;
    if (launch.fighter.id === "needle" && (projectile.weapon === "pulse" || projectile.weapon === "laser")) this.applyChainDamage(second, damage * (0.18 + launch.fighterLevel * 0.04 + Math.min(20, this.combo) * 0.003));
    if (launch.fighter.id === "core" && launch.fighterLevel >= 2 && Phaser.Math.Distance.Between(this.player?.x ?? 0, this.player?.y ?? 0, second.x, second.y) < 280) {
      const burnDamage = damage * (launch.fighterLevel === 3 ? 0.22 : 0.13);
      this.time.delayedCall(280, () => {
        if (!second.active) return;
        enemy.hp -= burnDamage;
        if (enemy.hp <= 0) this.defeatEnemy(second, enemy);
      });
    }
    if (!projectile.piercing) first.disableBody(true, true);
    second.setTintFill(0xffffff);
    this.time.delayedCall(45, () => { if (second.active) second.clearTint(); });
    if (enemy.hp <= 0) this.defeatEnemy(second, enemy);
  }

  private applyChainDamage(source: Phaser.Physics.Arcade.Image, damage: number): void {
    let jumps = this.launch?.fighterLevel ?? 1;
    for (const item of this.enemies?.getChildren() ?? []) {
      if (jumps <= 0 || !(item instanceof Phaser.Physics.Arcade.Image) || !item.active || item === source) continue;
      if (Phaser.Math.Distance.Between(source.x, source.y, item.x, item.y) > 180) continue;
      const state = this.enemyStates.get(item);
      if (!state) continue;
      state.hp -= damage;
      item.setTint(0x38bdf8);
      this.time.delayedCall(70, () => { if (item.active) item.clearTint(); });
      if (state.hp <= 0) this.defeatEnemy(item, state);
      jumps -= 1;
    }
  }

  private defeatEnemy(enemyObject: Phaser.Physics.Arcade.Image, enemy: EnemyState): void {
    enemyObject.disableBody(true, true);
    this.defeated += 1;
    this.combo += 1;
    this.score += enemy.boss ? 12000 + (this.launch?.stage.order ?? 1) * 700 : enemy.elite ? 650 : 220;
    const level = this.launch?.fighter.levels[(this.launch.fighterLevel ?? 1) - 1];
    const energyMultiplier = 1 + (level?.stats.energy ?? 5) * 0.025;
    this.ultimate = clamp(this.ultimate + (enemy.boss ? 25 : enemy.elite ? 15 : 5) * energyMultiplier, 0, 100);
    if (enemy.elite && !enemy.boss && enemy.playerDamageAtSpawn === this.damageTaken) this.noDamageEliteWaves += 1;
    if (enemy.boss) {
      this.boss = undefined;
      this.time.delayedCall(900, () => this.finishBattle(true));
      return;
    }
    const luck = this.launch?.fighter.levels[(this.launch.fighterLevel ?? 1) - 1]?.stats.luck ?? 5;
    const dropChance = clamp(0.13 + luck * 0.006, 0.13, 0.19);
    const roll = Math.random();
    if (enemy.elite || this.defeated % 6 === 0 || roll < dropChance) this.spawnPickup(enemyObject.x, enemyObject.y, enemy.elite ? "weapon" : roll < 0.07 ? "heal" : roll < 0.3 ? "chip" : "data");
  }

  private spawnPickup(x: number, y: number, kind: PickupState["kind"]): void {
    const group = this.pickups;
    if (!group) return;
    const object = group.get(x, y, "pickup");
    if (!(object instanceof Phaser.Physics.Arcade.Image)) return;
    const weaponIds: readonly WeaponId[] = ["pulse", "laser", "drone", "scatter", "missile", "rail"];
    const undiscovered = weaponIds.filter((id) => !this.collectedWeapons.has(id));
    const source = undiscovered.length > 0 ? undiscovered : weaponIds;
    const weapon = kind === "weapon" ? source[(this.defeated + (this.launch?.stage.order ?? 1)) % source.length] : undefined;
    const tint = kind === "weapon" && weapon ? WEAPON_BY_ID[weapon].color : kind === "heal" ? 0x3de19a : kind === "chip" ? 0xffb547 : 0x20d9ff;
    object.enableBody(true, x, y, true, true).setTexture("pickup").setTint(tint).setDepth(13).setVelocity(0, 85);
    this.pickupStates.set(object, { kind, weapon });
  }

  private onPickup(gameObject: unknown): void {
    if (!(gameObject instanceof Phaser.Physics.Arcade.Image)) return;
    const state = this.pickupStates.get(gameObject);
    if (!state) return;
    gameObject.disableBody(true, true);
    if (state.kind === "heal") {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2);
      this.game.events.emit("battle:notice", "修复包 +20%");
    } else if (state.kind === "data") {
      this.tacticalData += 2;
      this.game.events.emit("battle:notice", "战术数据 +2");
    } else if (state.kind === "chip") {
      if (this.weaponLevel < 3) this.weaponLevel = (this.weaponLevel + 1) as WeaponLevel;
      else {
        this.score += 500;
        this.ultimate = clamp(this.ultimate + 8, 0, 100);
      }
      this.game.events.emit("battle:notice", `火力芯片 · ${WEAPON_BY_ID[this.weapon].name} W${this.weaponLevel}`);
    } else if (state.weapon) {
      this.collectedWeapons.add(state.weapon);
      if (state.weapon === this.weapon) {
        if (this.weaponLevel < 3) this.weaponLevel = (this.weaponLevel + 1) as WeaponLevel;
        this.game.events.emit("battle:notice", `${WEAPON_BY_ID[this.weapon].name} 强化至 W${this.weaponLevel}`);
      } else {
        this.pendingWeapon = state.weapon;
        this.pendingUntil = this.time.now + 5000;
        this.game.events.emit("battle:weapon-swap", { weapon: state.weapon, name: WEAPON_BY_ID[state.weapon].name });
      }
    }
  }

  private onPlayerHit(gameObject: unknown): void {
    if (!(gameObject instanceof Phaser.Physics.Arcade.Image) || this.time.now < this.invulnerableUntil) return;
    const projectile = this.projectiles.get(gameObject);
    gameObject.disableBody(true, true);
    this.applyPlayerDamage(projectile?.damage ?? 12);
  }

  private onPlayerCollision(gameObject: unknown): void {
    if (!(gameObject instanceof Phaser.Physics.Arcade.Image) || this.time.now < this.invulnerableUntil) return;
    this.applyPlayerDamage(24);
  }

  private applyPlayerDamage(amount: number): void {
    const launch = this.launch;
    const lowHealthReduction = launch?.fighter.id === "bulwark" && this.hp / this.maxHp < 0.35 ? 0.65 : 1;
    const barrierReduction = launch?.fighter.id === "bulwark" && launch.fighterLevel >= 2 ? 0.88 : 1;
    const appliedDamage = amount * lowHealthReduction * barrierReduction;
    if (launch?.fighter.id === "bulwark" && launch.fighterLevel === 3) this.score += Math.round(amount - appliedDamage) * 8;
    this.hp -= appliedDamage;
    this.damageTaken += appliedDamage;
    this.combo = 0;
    this.invulnerableUntil = this.time.now + 900;
    this.cameras.main.shake(150, 0.008);
    if (this.hp <= 0) this.finishBattle(false);
  }

  private executeUltimateBurst(fighterId: FighterId): void {
    const bossState = this.boss ? this.enemyStates.get(this.boss) : undefined;
    const launch = this.launch;
    if (!launch) return;
    const allEnemies = this.enemies?.getChildren() ?? [];
    for (const item of allEnemies) {
      if (!(item instanceof Phaser.Physics.Arcade.Image) || !item.active) continue;
      const state = this.enemyStates.get(item);
      if (!state) continue;
      const cap = state.boss ? state.maxHp * launch.fighter.ultimate.bossDamageCap : Number.POSITIVE_INFINITY;
      const base = fighterId === "eclipse" ? 420 : fighterId === "core" ? 360 : fighterId === "relic" ? 230 : 290;
      state.hp -= Math.min(base * (1 + (launch.fighterLevel - 1) * 0.16), cap);
      if (state.hp <= 0) this.defeatEnemy(item, state);
    }
    if (["bulwark", "polaris"].includes(fighterId)) {
      for (const item of this.enemyBullets?.getChildren() ?? []) {
        if (item instanceof Phaser.Physics.Arcade.Image && item.active) {
          item.disableBody(true, true);
          this.score += 12;
        }
      }
    }
    if (fighterId === "relic") {
      this.weaponLevel = 3;
      this.tacticalData += 4;
      if (launch.fighterLevel >= 2) this.score += this.collectedWeapons.size * 320;
    }
    if (bossState && fighterId === "eclipse") this.score += 1800;
  }

  private findNearestEnemy(x: number, y: number): Phaser.Physics.Arcade.Image | undefined {
    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const item of this.enemies?.getChildren() ?? []) {
      if (!(item instanceof Phaser.Physics.Arcade.Image) || !item.active) continue;
      const candidate = Phaser.Math.Distance.Between(x, y, item.x, item.y);
      if (candidate < distance) {
        nearest = item;
        distance = candidate;
      }
    }
    return nearest;
  }

  private emitHud(): void {
    const bossState = this.boss ? this.enemyStates.get(this.boss) : undefined;
    const snapshot: BattleHudSnapshot = {
      hp: Math.max(0, this.hp), maxHp: this.maxHp, score: this.score, combo: this.combo, weapon: this.weapon, weaponLevel: this.weaponLevel,
      ultimate: this.ultimate, bossHp: bossState?.hp ?? 0, bossMaxHp: bossState?.maxHp ?? 0, tacticalData: this.tacticalData, heat: this.heat, charge: this.charge,
    };
    this.game.events.emit("battle:hud", snapshot);
  }

  private finishBattle(victory: boolean): void {
    const launch = this.launch;
    if (!launch || this.battleEnded) return;
    this.battleEnded = true;
    this.physics.pause();
    const durationSeconds = Math.max(1, Math.round((this.time.now - this.startedAt) / 1000));
    const finalScore = this.score + (victory ? Math.max(0, Math.round(this.hp)) * 35 : 0);
    const rank = rankForScore(finalScore, durationSeconds, powerScore(launch.fighter, launch.fighterLevel), launch.stage);
    const baseReward = 20 + launch.stage.order * 2;
    const rankMultiplier: Readonly<Record<string, number>> = { C: 0.9, B: 1, A: 1.15, S: 1.35 };
    const firstClearBonus = victory && launch.firstClear ? 25 : 0;
    const reward = Math.floor((baseReward + this.tacticalData) * (victory ? rankMultiplier[rank] ?? 1 : 0.35)) + firstClearBonus;
    const bossDurationSeconds = this.bossStartedAt > 0 ? Math.max(1, Math.round((this.time.now - this.bossStartedAt) / 1000)) : 9999;
    const result: BattleResult = {
      victory, stageId: launch.stage.id, score: finalScore, rank, tacticalData: reward, defeated: this.defeated, grazes: this.grazes, durationSeconds,
      bossDurationSeconds, noDamageEliteWaves: this.noDamageEliteWaves, collectedWeaponTypes: this.collectedWeapons.size, weaponUsage: { ...this.weaponUsage },
    };
    this.time.delayedCall(700, () => this.game.events.emit("battle:complete", result));
  }
}
