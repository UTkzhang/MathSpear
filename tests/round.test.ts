import { describe, expect, it } from 'vitest';
import { Round, type RoundOptions } from '../src/game/round';
import { add, mul, num } from '../src/learning/expr';
import { problemFromExpr } from '../src/learning/problems';
import { createRng } from '../src/learning/rng';

const OPTS: RoundOptions = {
  spearLockMs: 1000,
  enemyCooldownMs: 500,
};

const problems = () => [
  problemFromExpr(add(num(2), num(3)), 'add-facts', 1), // 5
  problemFromExpr(mul(num(6), num(7)), 'mul-facts', 1), // 42
  problemFromExpr(add(num(4), num(4)), 'add-facts', 1), // 8
];

const newRound = (start = 0) => new Round(problems(), createRng(1), OPTS, start);
const wrongId = (r: Round) => r.living.find((e) => e.id !== r.targetEnemyId)!.id;

describe('Round', () => {
  it('targets the answer of exactly one living enemy', () => {
    const r = newRound();
    expect(r.target).not.toBeNull();
    expect(r.living.filter((e) => e.problem.answer === r.target)).toHaveLength(1);
  });

  it('rejects duplicate answers', () => {
    const dup = [problems()[0], problemFromExpr(add(num(1), num(4)), 'add-facts', 1)];
    expect(() => new Round(dup, createRng(1), OPTS, 0)).toThrow();
  });

  it('a correct hit kills the target, records the attempt and picks a new target', () => {
    const r = newRound();
    const first = r.targetEnemyId!;
    const res = r.hit(first, 100);
    expect(res.kind).toBe('correct');
    expect(r.enemies[first].alive).toBe(false);
    expect(res.kind === 'correct' && res.attempt).toMatchObject({ correct: true, responseMs: 100 });
    expect(r.target).not.toBeNull();
    expect(r.targetEnemyId).not.toBe(first);
  });

  it('a wrong hit locks the spear and leaves the enemy alive', () => {
    const r = newRound();
    const id = wrongId(r);
    const res = r.hit(id, 100);
    expect(res.kind).toBe('wrong');
    expect(r.enemies[id].alive).toBe(true);
    expect(r.isSpearLocked(500)).toBe(true);
    expect(r.isSpearLocked(1100)).toBe(false);
    // While locked, even the correct enemy can't be hit.
    expect(r.hit(r.targetEnemyId!, 600)).toEqual({ kind: 'ignored', reason: 'locked' });
    expect(r.hit(r.targetEnemyId!, 1200).kind).toBe('correct');
  });

  it('the same enemy cannot count twice during its cooldown', () => {
    const r = new Round(problems(), createRng(1), { ...OPTS, spearLockMs: 0 }, 0);
    const id = wrongId(r);
    expect(r.hit(id, 100).kind).toBe('wrong');
    expect(r.hit(id, 300)).toEqual({ kind: 'ignored', reason: 'cooldown' });
    expect(r.hit(id, 700).kind).toBe('wrong');
  });

  it('clears when every enemy is gone and records each attempt', () => {
    const r = newRound();
    r.hit(wrongId(r), 100);
    let t = 2000;
    while (!r.cleared) {
      const res = r.hit(r.targetEnemyId!, t);
      expect(res.kind).toBe('correct');
      t += 1000;
    }
    expect(r.target).toBeNull();
    expect(r.hit(0, t)).toEqual({ kind: 'ignored', reason: 'over' });
    expect(r.attempts).toHaveLength(4);
    expect(r.accuracy).toBe(0.75);
  });

  it('setTarget lets the tutorial choose the target', () => {
    const r = newRound();
    r.setTarget(1, 0);
    expect(r.target).toBe(42);
  });
});
