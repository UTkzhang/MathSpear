import Phaser from 'phaser';
import { COLORS, ENEMY, GAME, HEARTS, HEIGHT, HUD_HEIGHT, PLAYER, SHIELD, SPEAR, WIDTH } from '../config';
import {
  circlesOverlap,
  clampInside,
  knockAway,
  pushOut,
  resolveCollision,
  steerToward,
  stepBouncing,
  withinArc,
  type Body,
  type Bounds,
} from '../game/physics';
import { hitGold } from '../game/gold';
import { Round, type HitResult } from '../game/round';
import {
  completeLevel,
  currentLevel,
  earn,
  lessonDue,
  levelProblems,
  levelSpec,
  newRun,
  nextShopLevel,
  recordAttempts,
  shieldOf,
  speedOf,
  type RunState,
} from '../game/run';
import { explainLine } from '../learning/explain';
import type { Problem } from '../learning/problems';
import { randomSeed, type Rng } from '../learning/rng';
import { fitCamera, makeText, onKey } from '../ui/widgets';
import { Tutorial } from './tutorial';
import {
  addPlayMs,
  levelsText,
  saveRun,
  type GameData,
  type LessonData,
  type Mode,
  type ResultData,
  type ShopData,
} from './types';

interface EnemyView {
  id: number;
  body: Body;
  text: Phaser.GameObjects.Text;
  reveal?: Phaser.GameObjects.Text;
  revealUntil: number;
}

export interface SpawnOptions {
  /** Speed range in px/s; [0, 0] keeps enemies still. */
  speed: [number, number];
  /** Fixed spawn points (tutorial); otherwise random spots away from the player. */
  positions?: { x: number; y: number }[];
  /** Turn rate toward the player in rad/s (default 0: enemies just bounce). */
  chase?: number;
}

const ARENA: Bounds = { left: 16, top: HUD_HEIGHT + 8, right: WIDTH - 16, bottom: HEIGHT - 16 };

/** One text size for a whole wave: full size for short problems, shrinking for long ones. */
function waveFontSize(problems: Problem[]): number {
  const SHORT = 5; // "47+28" and shorter: full size
  const LONG = 11; // "(10+4)×4−6" and longer: smallest size
  const longest = Math.max(...problems.map((p) => p.text.length));
  const t = Math.min(1, Math.max(0, (longest - SHORT) / (LONG - SHORT)));
  return Math.round(ENEMY.fontSize - t * (ENEMY.fontSize - ENEMY.minFontSize));
}

/**
 * The arena. In play mode it plays one level of a run (game/run.ts): the "Level N"
 * banner, one wave of enemies, then the next level, or the shop every few levels
 * (or the summary when the hearts run out). In tutorial mode a script
 * (tutorial.ts) drives it instead.
 */
export class GameScene extends Phaser.Scene {
  mode: Mode = 'play';
  round: Round | null = null;
  /** HP never drops below this (the tutorial sets it to 1). */
  hpFloor = 0;

  private run!: RunState;
  private rng!: Rng;
  private levelStartedAt = 0;
  private player!: Body;
  private facing = { x: 1, y: 0 };
  private invulnerableUntil = 0;
  /** The player shows the hurt colour until this time (after losing a heart). */
  private hurtUntil = 0;
  private shieldFlashUntil = 0;
  private enemies: EnemyView[] = [];
  private ended = false;
  private chase = 0;
  private tutorial: Tutorial | null = null;
  /** The hint after a wrong hit shows until this time (when the spear unlocks). */
  private hintUntil = 0;

  private g!: Phaser.GameObjects.Graphics;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private hudTarget!: Phaser.GameObjects.Text;
  private hudHearts!: Phaser.GameObjects.Text;
  private hudGold!: Phaser.GameObjects.Text;
  private hudLevel!: Phaser.GameObjects.Text;
  private hudLock!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private promptBg!: Phaser.GameObjects.Graphics;
  private promptText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  init(data: GameData): void {
    this.mode = data.mode;
    if (data.mode === 'tutorial') {
      // A throwaway run with starting gear, but every heart, so the tutorial can show losing one.
      this.run = newRun(randomSeed());
      this.run.hp = HEARTS.max;
    } else {
      this.run = data.run ?? newRun(data.seed ?? randomSeed(), data.preset);
    }
    this.rng = this.run.rng;
    this.hpFloor = 0;
    this.invulnerableUntil = 0;
    this.hurtUntil = 0;
    this.shieldFlashUntil = 0;
    this.enemies = [];
    this.round = null;
    this.ended = false;
    this.chase = 0;
    this.hintUntil = 0;
    this.facing = { x: 1, y: 0 };
  }

  create(): void {
    // A new stage starts with its lesson (LessonScene), which then comes back here.
    if (this.mode === 'play' && lessonDue(this.run)) {
      this.scene.start('Lesson', { run: this.run } satisfies LessonData);
      return;
    }
    fitCamera(this);
    const arena = this.add.graphics();
    arena.fillStyle(COLORS.arena, 1);
    arena.fillRoundedRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top, 12);
    arena.lineStyle(2, COLORS.arenaEdge, 1);
    arena.strokeRoundedRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top, 12);

    this.g = this.add.graphics();
    this.player = { x: WIDTH / 2, y: (ARENA.top + ARENA.bottom) / 2, vx: 0, vy: 0, r: PLAYER.radius };

    this.createHud();
    this.createPrompt();

    const kb = this.input.keyboard!;
    const cursors = kb.createCursorKeys();
    const wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.keys = { up: cursors.up, down: cursors.down, left: cursors.left, right: cursors.right, ...wasd };
    onKey(this, 'ESC', () => {
      if (this.mode === 'play') {
        if (!this.ended) this.recordLevel();
        saveRun(this.run, 'quit');
      }
      this.scene.start('Menu');
    });

    this.levelStartedAt = this.now();
    if (this.mode === 'tutorial') {
      this.tutorial = new Tutorial(this);
      this.tutorial.start();
    } else {
      this.tutorial = null;
      this.startLevel();
    }
  }

  /**
   * Current time in ms. Uses the game loop clock: the scene clock (`this.time.now`)
   * still holds the previous run's value during create() when a scene restarts.
   */
  now(): number {
    return this.game.loop.time;
  }

  // ---------------------------------------------------------------- levels and rounds

  /** Show the "Level N" banner, then send in that level's wave. */
  private startLevel(): void {
    const spec = levelSpec(this.run);
    this.updateHud();
    this.showBanner(`Level ${currentLevel(this.run)}`, spec.name);
    this.time.delayedCall(GAME.levelBannerMs, () => {
      if (this.ended) return;
      this.levelStartedAt = this.now();
      this.startRound(levelProblems(this.run), { speed: spec.speed, chase: spec.chase });
    });
  }

  /** Replace all enemies with a new set and start a new Round. */
  startRound(problems: Problem[], spawn: SpawnOptions): void {
    for (const e of this.enemies) this.destroyEnemy(e);
    this.enemies = [];
    this.round = new Round(problems, this.rng, { spearLockMs: SPEAR.lockMs, enemyCooldownMs: ENEMY.hitCooldownMs }, this.now());

    const fontSize = waveFontSize(problems);
    problems.forEach((problem, id) => {
      const text = makeText(this, 0, 0, problem.text, { fontSize: `${fontSize}px`, color: '#1b1b1b', fontStyle: 'bold' });
      const r = Math.max(ENEMY.minRadius, text.width / 2 + ENEMY.textPadding);
      const pos = spawn.positions?.[id] ?? this.randomSpawn(r);
      const body: Body = { x: pos.x, y: pos.y, vx: 0, vy: 0, r };
      this.enemies.push({ id, body, text, revealUntil: 0 });
    });
    this.setEnemySpeed(spawn.speed);
    this.chase = spawn.chase ?? 0;
    this.updateHud();
  }

  /** Move the player (the tutorial does this so fixed spawns never land on the spear). */
  placePlayer(x: number, y: number, facing = { x: 0, y: -1 }): void {
    this.player.x = x;
    this.player.y = y;
    this.facing = facing;
  }

  setEnemySpeed([min, max]: [number, number]): void {
    for (const e of this.enemies) {
      const angle = this.rng.next() * Math.PI * 2;
      const speed = min + this.rng.next() * (max - min);
      e.body.vx = Math.cos(angle) * speed;
      e.body.vy = Math.sin(angle) * speed;
    }
  }

  /** Make a specific answer the current target (the tutorial uses this). */
  setTargetAnswer(answer: number): void {
    const e = this.round?.living.find((x) => x.problem.answer === answer);
    if (!e || !this.round) throw new Error(`No living enemy with answer ${answer}`);
    this.round.setTarget(e.id, this.now());
    this.updateHud();
  }

  setPrompt(message: string | null): void {
    this.promptText.setText(message ?? '');
    this.promptBg.clear();
    if (!message) return;
    const w = Math.min(this.promptText.width + 40, WIDTH - 80);
    const h = this.promptText.height + 24;
    const y = ARENA.bottom - 20 - h / 2;
    this.promptText.setPosition(WIDTH / 2, y);
    this.promptBg.fillStyle(0x000000, 0.65);
    this.promptBg.fillRoundedRect(WIDTH / 2 - w / 2, y - h / 2, w, h, 10);
  }

  /** The wave is cleared: record it, then the shop if it's due, otherwise the next level. */
  private levelCleared(): void {
    this.ended = true;
    const tally = this.tally();
    this.recordLevel();
    const report = completeLevel(this.run);
    const cleared = `Level ${this.run.cleared} cleared!`;
    if (report) {
      this.showBanner(cleared, `${tally}  ·  Shop time: ${this.run.gold.toLocaleString()} gold to spend`);
      const data: ShopData = { run: this.run, report };
      this.time.delayedCall(GAME.clearedBannerMs, () => this.scene.start('Shop', data));
      return;
    }
    const left = nextShopLevel(this.run) - this.run.cleared;
    this.showBanner(cleared, `${tally}  ·  Shop in ${levelsText(left)}`);
    const data: GameData = { mode: 'play', run: this.run };
    this.time.delayedCall(GAME.clearedBannerMs, () => this.scene.restart(data));
  }

  /** "All 5 right!" or "4 right, 2 wrong", for the level just played. */
  private tally(): string {
    const attempts = this.round?.attempts ?? [];
    const right = attempts.filter((a) => a.correct).length;
    const wrong = attempts.length - right;
    return wrong ? `${right} right, ${wrong} wrong` : `All ${right} right!`;
  }

  /** Add this level's hits and play time to the run, and the play time to this browser's total (for the test round). */
  private recordLevel(): void {
    const ms = this.now() - this.levelStartedAt;
    recordAttempts(this.run, this.round?.attempts ?? [], ms);
    addPlayMs(ms);
  }

  /** Out of hearts: the run is over. */
  private gameOver(): void {
    this.ended = true;
    this.recordLevel();
    this.showBanner('Out of hearts!', 'Game over');
    const data: ResultData = { mode: 'play', run: this.run, outOfHearts: true };
    this.time.delayedCall(1100, () => this.scene.start('Result', data));
  }

  /** End the tutorial and show its summary (tutorial.ts calls this). */
  finishTutorial(): void {
    if (this.ended) return;
    this.ended = true;
    this.time.delayedCall(900, () => this.scene.start('Result', { mode: 'tutorial' } satisfies ResultData));
  }

  // ---------------------------------------------------------------- frame loop

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    if (this.hintUntil && this.now() >= this.hintUntil) {
      this.hintUntil = 0;
      this.setPrompt(null);
    }
    if (!this.ended) {
      this.movePlayer(dt);
      this.moveEnemies(dt);
      this.checkSpear(time);
      this.checkBodyContact(time);
    }
    this.draw(time);
  }

  private movePlayer(dt: number): void {
    const k = this.keys;
    let dx = (k.right.isDown || k.D.isDown ? 1 : 0) - (k.left.isDown || k.A.isDown ? 1 : 0);
    let dy = (k.down.isDown || k.S.isDown ? 1 : 0) - (k.up.isDown || k.W.isDown ? 1 : 0);

    // Mouse / touch: hold to move toward the pointer.
    const p = this.input.activePointer;
    if (dx === 0 && dy === 0 && p.isDown) {
      const tx = p.worldX - this.player.x;
      const ty = p.worldY - this.player.y;
      if (Math.hypot(tx, ty) > 8) {
        dx = tx;
        dy = ty;
      }
    }

    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    dx /= len;
    dy /= len;
    this.facing = { x: dx, y: dy };
    const before = { x: this.player.x, y: this.player.y };
    const speed = speedOf(this.run).speed;
    this.player.x += dx * speed * dt;
    this.player.y += dy * speed * dt;
    clampInside(this.player, ARENA);
    this.tutorial?.onMove(Math.hypot(this.player.x - before.x, this.player.y - before.y));
  }

  private moveEnemies(dt: number): void {
    const living = this.livingEnemies();
    for (const e of living) {
      steerToward(e.body, this.player.x, this.player.y, this.chase * dt);
      stepBouncing(e.body, dt, ARENA);
    }
    for (let i = 0; i < living.length; i++) {
      for (let j = i + 1; j < living.length; j++) resolveCollision(living[i].body, living[j].body);
    }
  }

  /** The player's right, a quarter turn clockwise from facing (y points down). */
  private rightHand(): { x: number; y: number } {
    return { x: -this.facing.y, y: this.facing.x };
  }

  /** Where the spear's shaft starts (held in the right hand) and its tip. */
  private spear(): { base: { x: number; y: number }; tip: { x: number; y: number } } {
    const f = this.facing;
    const side = this.rightHand();
    const x = this.player.x + side.x * SPEAR.sideOffset;
    const y = this.player.y + side.y * SPEAR.sideOffset;
    const reach = this.player.r + SPEAR.length;
    const back = this.player.r * 0.5;
    return { base: { x: x - f.x * back, y: y - f.y * back }, tip: { x: x + f.x * reach, y: y + f.y * reach } };
  }

  /** Direction from the player to the middle of the shield (SHIELD.side degrees to the left of facing). */
  private shieldAngle(): number {
    return Math.atan2(this.facing.y, this.facing.x) - (SHIELD.side * Math.PI) / 180;
  }

  private checkSpear(now: number): void {
    const round = this.round;
    if (!round || round.isSpearLocked(now)) return;
    const { tip } = this.spear();
    for (const e of this.livingEnemies()) {
      if (!circlesOverlap(tip.x, tip.y, SPEAR.tipRadius, e.body.x, e.body.y, e.body.r)) continue;
      const result = round.hit(e.id, now);
      this.onHit(result, e, now);
      if (result.kind !== 'ignored') break;
    }
  }

  private onHit(result: HitResult, e: EnemyView, now: number): void {
    if (result.kind === 'ignored') return;
    if (result.kind === 'correct') {
      const gold = hitGold(result.attempt.problem, result.attempt.responseMs);
      earn(this.run, gold);
      this.killEnemy(e, gold);
      this.updateHud(true);
      if (this.tutorial) this.tutorial.onCorrect(result.cleared);
      else if (result.cleared) this.levelCleared();
      return;
    }
    // Wrong hit: reveal the real answer on that enemy and knock it away.
    const p = result.enemy.problem;
    e.reveal?.destroy();
    e.reveal = makeText(this, e.body.x, e.body.y - e.body.r - 16, `${p.text} = ${p.answer}`, {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#c62828',
      padding: { x: 6, y: 2 },
    });
    e.revealUntil = now + ENEMY.wrongAnswerShowMs;
    // Penalty: no attacking until the spear unlocks, but no getting hurt either.
    this.invulnerableUntil = Math.max(this.invulnerableUntil, this.round?.spearLockedUntil ?? now);
    knockAway(e.body, this.player.x, this.player.y, 120);
    this.cameras.main.shake(120, 0.004);
    this.updateHud();
    if (this.tutorial) this.tutorial.onWrong();
    else this.showHint(p, result.target);
  }

  /**
   * After a wrong hit: what the problem really equals, and one way to work it out
   * (learning/explain.ts). It stays while the spear is locked, and the player
   * can't be hurt then, so there's time to read it.
   */
  private showHint(p: Problem, target: number): void {
    this.setPrompt(`${p.text} = ${p.answer}, not ${target}\n${explainLine(p.expr)}`);
    this.hintUntil = this.round?.spearLockedUntil ?? this.now();
  }

  /** True if a point is on the player's shield side, inside the shield's arc. */
  private shieldCovers(x: number, y: number): boolean {
    const arc = (shieldOf(this.run).arcDeg * Math.PI) / 180;
    const a = this.shieldAngle();
    return withinArc(this.player.x, this.player.y, Math.cos(a), Math.sin(a), arc, x, y);
  }

  private checkBodyContact(now: number): void {
    const p = this.player;
    const shieldR = p.r + SHIELD.gap;
    for (const e of this.livingEnemies()) {
      // The shield sits just outside the body, so it meets enemies first.
      if (!circlesOverlap(p.x, p.y, shieldR, e.body.x, e.body.y, e.body.r)) continue;
      if (this.shieldCovers(e.body.x, e.body.y)) {
        pushOut(e.body, p.x, p.y, shieldR + e.body.r);
        knockAway(e.body, p.x, p.y, 100);
        this.shieldFlashUntil = now + SHIELD.flashMs;
        continue;
      }
      if (!circlesOverlap(p.x, p.y, p.r, e.body.x, e.body.y, e.body.r)) continue;
      knockAway(e.body, p.x, p.y, 100);
      if (now < this.invulnerableUntil) continue;
      this.invulnerableUntil = now + PLAYER.invulnerableMs;
      this.hurtUntil = this.invulnerableUntil;
      this.run.hp = Math.max(this.hpFloor, this.run.hp - 1);
      this.cameras.main.flash(150, 120, 0, 0);
      this.updateHud();
      if (this.run.hp <= 0) {
        if (this.tutorial) this.finishTutorial();
        else this.gameOver();
        return;
      }
    }
  }

  // ---------------------------------------------------------------- enemies

  private livingEnemies(): EnemyView[] {
    const round = this.round;
    if (!round) return [];
    return this.enemies.filter((e) => round.enemies[e.id].alive);
  }

  private randomSpawn(r: number): { x: number; y: number } {
    for (let i = 0; i < 100; i++) {
      const x = ARENA.left + r + this.rng.next() * (ARENA.right - ARENA.left - 2 * r);
      const y = ARENA.top + r + this.rng.next() * (ARENA.bottom - ARENA.top - 2 * r);
      const farFromPlayer = Math.hypot(x - this.player.x, y - this.player.y) > r + 140;
      const clear = this.enemies.every((e) => Math.hypot(x - e.body.x, y - e.body.y) > r + e.body.r + 10);
      if (farFromPlayer && clear) return { x, y };
    }
    return { x: ARENA.left + r, y: ARENA.top + r };
  }

  private killEnemy(e: EnemyView, gold: number): void {
    e.reveal?.destroy();
    e.reveal = undefined;
    const pop = makeText(this, e.body.x, e.body.y, `+${gold} gold`, { fontSize: '22px', color: COLORS.gold, fontStyle: 'bold' });
    this.tweens.add({ targets: pop, y: e.body.y - 40, alpha: 0, duration: 700, onComplete: () => pop.destroy() });
    this.tweens.add({ targets: e.text, alpha: 0, scale: 1.6, duration: 250, onComplete: () => e.text.setVisible(false) });
  }

  private destroyEnemy(e: EnemyView): void {
    e.text.destroy();
    e.reveal?.destroy();
  }

  // ---------------------------------------------------------------- HUD and drawing

  private createHud(): void {
    this.hudHearts = makeText(this, 24, HUD_HEIGHT / 2 + 4, '', { fontSize: '24px', color: COLORS.bad }).setOrigin(0, 0.5);
    this.hudTarget = makeText(this, WIDTH / 2, HUD_HEIGHT / 2 + 4, '', { fontSize: '28px', fontStyle: 'bold' });
    this.hudGold = makeText(this, WIDTH - 24, HUD_HEIGHT / 2 - 6, '', { fontSize: '20px', color: COLORS.gold }).setOrigin(1, 0.5);
    this.hudLevel = makeText(this, WIDTH - 24, HUD_HEIGHT / 2 + 16, '', { fontSize: '13px', color: COLORS.textDim }).setOrigin(1, 0.5);
    this.hudLock = makeText(this, WIDTH / 2, HUD_HEIGHT + 26, 'Spear locked', { fontSize: '15px', color: COLORS.bad }).setVisible(false);
    this.banner = makeText(this, WIDTH / 2, (ARENA.top + ARENA.bottom) / 2 - 20, '', {
      fontSize: '52px',
      fontStyle: 'bold',
      color: COLORS.accent,
      align: 'center',
    }).setAlpha(0);
    this.updateHud();
  }

  private showBanner(title: string, subtitle: string): void {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(title).setAlpha(1).setScale(0.8);
    const sub = makeText(this, WIDTH / 2, this.banner.y + 46, subtitle, { fontSize: '20px', color: COLORS.textDim });
    this.tweens.add({ targets: this.banner, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [this.banner, sub], alpha: 0, delay: GAME.levelBannerMs - 300, duration: 300, onComplete: () => sub.destroy() });
  }

  private createPrompt(): void {
    this.promptBg = this.add.graphics();
    this.promptText = makeText(this, WIDTH / 2, ARENA.bottom - 40, '', {
      fontSize: '19px',
      align: 'center',
      wordWrap: { width: WIDTH - 140 },
      lineSpacing: 4,
    });
  }

  private updateHud(pulse = false): void {
    const hp = this.run.hp;
    this.hudHearts.setText('♥'.repeat(hp) + '♡'.repeat(Math.max(0, HEARTS.max - hp)));
    this.hudGold.setText(`${this.run.gold.toLocaleString()} gold`);
    const level = currentLevel(this.run);
    const shop = nextShopLevel(this.run);
    this.hudLevel.setText(this.mode === 'tutorial' ? 'Tutorial' : `Level ${level}  ·  ${shop === level ? 'shop next' : `shop after ${shop}`}`);
    const target = this.round?.target;
    this.hudTarget.setText(target === null || target === undefined ? '' : `Find and hit ${target}`);
    if (pulse && target !== null && target !== undefined) {
      this.hudTarget.setScale(1.25);
      this.tweens.add({ targets: this.hudTarget, scale: 1, duration: 250, ease: 'Back.easeOut' });
    }
  }

  private draw(now: number): void {
    const g = this.g;
    g.clear();

    for (const e of this.livingEnemies()) {
      const revealing = now < e.revealUntil;
      g.fillStyle(revealing ? COLORS.enemyWrong : COLORS.enemy, 1);
      g.fillCircle(e.body.x, e.body.y, e.body.r);
      g.lineStyle(3, 0x000000, 0.25);
      g.strokeCircle(e.body.x, e.body.y, e.body.r);
      e.text.setPosition(e.body.x, e.body.y);
      if (e.reveal) {
        if (revealing) e.reveal.setPosition(e.body.x, e.body.y - e.body.r - 16);
        else {
          e.reveal.destroy();
          e.reveal = undefined;
        }
      }
    }

    const locked = this.round?.isSpearLocked(now) ?? false;
    this.hudLock.setVisible(locked);
    if (locked && this.round) this.hudLock.setText(`Spear locked  ${Math.ceil((this.round.spearLockedUntil - now) / 1000)}s`);

    // Shield in the left hand.
    const mid = this.shieldAngle();
    const half = (shieldOf(this.run).arcDeg * Math.PI) / 360;
    const blocking = now < this.shieldFlashUntil;
    g.lineStyle(blocking ? SHIELD.thickness + 2 : SHIELD.thickness, blocking ? COLORS.shieldBlock : COLORS.shield, 1);
    g.beginPath();
    g.arc(this.player.x, this.player.y, this.player.r + SHIELD.gap, mid - half, mid + half);
    g.strokePath();

    const blinkOff = now < this.invulnerableUntil && Math.floor(now / 100) % 2 === 0;
    g.fillStyle(now < this.hurtUntil ? COLORS.playerHurt : COLORS.player, blinkOff ? 0.35 : 1);
    g.fillCircle(this.player.x, this.player.y, this.player.r);

    // Spear in the right hand, drawn over the body.
    const { base, tip } = this.spear();
    const spearColor = locked ? COLORS.spearLocked : COLORS.spear;
    g.lineStyle(4, spearColor, 1);
    g.lineBetween(base.x, base.y, tip.x, tip.y);
    g.fillStyle(spearColor, 1);
    g.fillCircle(tip.x, tip.y, SPEAR.tipRadius);
  }
}
