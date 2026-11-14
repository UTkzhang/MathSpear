import { describe, expect, it } from 'vitest';
import { GOLD } from '../src/config';
import type { Attempt } from '../src/game/round';
import { hitGold, summarize } from '../src/game/gold';
import { add, group, mul, num } from '../src/learning/expr';
import { problemFromExpr } from '../src/learning/problems';

const oneStep = problemFromExpr(add(num(2), num(3)), 'add-facts', 1); // 5
const threeStep = problemFromExpr(add(num(2), mul(group(add(num(4), num(4))), num(5))), 'paren-3op', 4);
const hit = (sec: number): Attempt => ({ problem: oneStep, target: 5, correct: true, responseMs: sec * 1000 });
const miss: Attempt = { problem: oneStep, target: 7, correct: false, responseMs: 1000 };

describe('hitGold', () => {
  it('gives the full speed bonus for fast hits', () => {
    expect(hitGold(oneStep, 0)).toBe(GOLD.perOp + GOLD.speedBonusMax);
    expect(hitGold(oneStep, GOLD.fullBonusSec * 1000)).toBe(GOLD.perOp + GOLD.speedBonusMax);
  });

  it('shrinks the bonus linearly, never below the base gold', () => {
    const mid = (GOLD.fullBonusSec + GOLD.zeroBonusSec) / 2;
    expect(hitGold(oneStep, mid * 1000)).toBe(GOLD.perOp + GOLD.speedBonusMax / 2);
    expect(hitGold(oneStep, GOLD.zeroBonusSec * 1000)).toBe(GOLD.perOp);
    expect(hitGold(oneStep, 600_000)).toBe(GOLD.perOp);
  });

  it('pays more for problems with more steps', () => {
    expect(hitGold(threeStep, 600_000)).toBe(3 * GOLD.perOp);
  });
});

describe('summarize', () => {
  it('counts hits and accuracy', () => {
    const s = summarize([hit(1), hit(1), hit(1), miss]);
    expect(s).toMatchObject({ correct: 3, wrong: 1, accuracy: 0.75 });
  });

  it('averages response time over correct hits only', () => {
    expect(summarize([hit(2), hit(4), miss]).avgResponseMs).toBe(3000);
    expect(summarize([miss]).avgResponseMs).toBeNull();
  });

  it('handles an empty run', () => {
    expect(summarize([])).toMatchObject({ correct: 0, wrong: 0, accuracy: null, avgResponseMs: null });
  });
});
