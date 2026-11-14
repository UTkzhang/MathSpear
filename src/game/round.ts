/**
 * Rules for one round, separate from rendering so they can be unit-tested.
 *
 * - The target is one living enemy's answer ("Find and hit 42").
 * - Correct hit: that enemy dies and a new target is picked.
 * - Wrong hit: the enemy reveals its answer and the spear locks briefly,
 *   so guessing doesn't pay off.
 * - The round is cleared when every enemy is gone.
 */
import type { Problem } from '../learning/problems';
import type { Rng } from '../learning/rng';

export interface RoundOptions {
  spearLockMs: number;
  enemyCooldownMs: number;
}

export interface RoundEnemy {
  id: number;
  problem: Problem;
  alive: boolean;
  cooldownUntil: number;
}

export interface Attempt {
  problem: Problem;
  target: number;
  correct: boolean;
  /** Time from the target being announced to this hit. */
  responseMs: number;
}

export type HitResult =
  | { kind: 'ignored'; reason: 'locked' | 'cooldown' | 'dead' | 'over' }
  | { kind: 'correct'; enemy: RoundEnemy; attempt: Attempt; cleared: boolean; nextTarget: number | null }
  | { kind: 'wrong'; enemy: RoundEnemy; target: number };

export class Round {
  readonly enemies: RoundEnemy[];
  readonly attempts: Attempt[] = [];
  spearLockedUntil = 0;
  private targetId: number | null = null;
  private targetSince = 0;

  constructor(
    problems: Problem[],
    private readonly rng: Rng,
    private readonly opts: RoundOptions,
    readonly startedAt: number,
  ) {
    const answers = new Set(problems.map((p) => p.answer));
    if (answers.size !== problems.length) throw new Error('Round problems must have unique answers');
    this.enemies = problems.map((problem, id) => ({ id, problem, alive: true, cooldownUntil: 0 }));
    this.pickTarget(startedAt);
  }

  /** The answer the player is looking for, or null once the round is cleared. */
  get target(): number | null {
    return this.targetId === null ? null : this.enemies[this.targetId].problem.answer;
  }

  get targetEnemyId(): number | null {
    return this.targetId;
  }

  get cleared(): boolean {
    return this.enemies.every((e) => !e.alive);
  }

  get living(): RoundEnemy[] {
    return this.enemies.filter((e) => e.alive);
  }

  isSpearLocked(now: number): boolean {
    return now < this.spearLockedUntil;
  }

  /** Point the target at a specific living enemy (used by the tutorial script). */
  setTarget(enemyId: number, now: number): void {
    const enemy = this.enemies[enemyId];
    if (!enemy?.alive) throw new Error(`Enemy ${enemyId} is not alive`);
    this.targetId = enemyId;
    this.targetSince = now;
  }

  hit(enemyId: number, now: number): HitResult {
    const enemy = this.enemies[enemyId];
    if (this.targetId === null) return { kind: 'ignored', reason: 'over' };
    if (!enemy || !enemy.alive) return { kind: 'ignored', reason: 'dead' };
    if (this.isSpearLocked(now)) return { kind: 'ignored', reason: 'locked' };
    if (now < enemy.cooldownUntil) return { kind: 'ignored', reason: 'cooldown' };

    const target = this.enemies[this.targetId].problem.answer;
    const responseMs = now - this.targetSince;

    if (enemyId === this.targetId) {
      enemy.alive = false;
      const attempt: Attempt = { problem: enemy.problem, target, correct: true, responseMs };
      this.attempts.push(attempt);
      this.pickTarget(now);
      return {
        kind: 'correct',
        enemy,
        attempt,
        cleared: this.cleared,
        nextTarget: this.target,
      };
    }

    enemy.cooldownUntil = now + this.opts.enemyCooldownMs;
    this.spearLockedUntil = now + this.opts.spearLockMs;
    this.attempts.push({ problem: enemy.problem, target, correct: false, responseMs });
    return { kind: 'wrong', enemy, target };
  }

  get accuracy(): number | null {
    if (this.attempts.length === 0) return null;
    return this.attempts.filter((a) => a.correct).length / this.attempts.length;
  }

  private pickTarget(now: number): void {
    const living = this.living;
    if (living.length === 0) {
      this.targetId = null;
      return;
    }
    this.targetId = this.rng.pick(living).id;
    this.targetSince = now;
  }
}
