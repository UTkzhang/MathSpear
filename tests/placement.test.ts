import { describe, expect, it } from 'vitest';
import { CHECK, PRESETS } from '../src/config';
import { QuickCheck } from '../src/learning/placement';
import { createRng } from '../src/learning/rng';

/** Answer every problem with `answer(n)` (n = problem index), taking `sec` seconds. */
function take(answer: (correct: number, n: number) => number, sec = 2): QuickCheck {
  const check = new QuickCheck(createRng(7));
  for (let n = 0; !check.done; n++) {
    if (n > 100) throw new Error('check never ended');
    check.answer(answer(check.current!.answer, n), sec * 1000);
  }
  return check;
}

describe('QuickCheck', () => {
  it('asks each band\'s problem types, at the smallest size', () => {
    const check = take((a) => a);
    const bandOf = new Map(CHECK.bands.flatMap((b, i) => b.skills.map((s) => [s, i] as const)));
    for (const a of check.answers) {
      expect(bandOf.has(a.problem.skill)).toBe(true);
      expect(a.problem.difficulty).toBe(0);
    }
  });

  it('recommends the hardest setting when everything is right and quick', () => {
    const check = take((a) => a);
    expect(check.answers).toHaveLength(CHECK.perBand * CHECK.bands.length);
    expect(check.recommended).toBe(PRESETS.length - 1);
    expect(check.results.every((r) => r.passed)).toBe(true);
  });

  it('stops early and recommends the easiest setting when the first problems are wrong', () => {
    const check = take((a) => a + 1);
    expect(check.answers).toHaveLength(CHECK.perBand - CHECK.passCorrect + 1);
    expect(check.recommended).toBe(0);
  });

  it('allows one slip per band', () => {
    const check = take((a, n) => (n % CHECK.perBand === 0 ? a + 1 : a));
    expect(check.recommended).toBe(PRESETS.length - 1);
  });

  it('does not pass a band answered too slowly', () => {
    const slow = CHECK.bands[0].maxAvgSec + 1;
    const check = take((a) => a, slow);
    expect(check.results).toHaveLength(1);
    expect(check.recommended).toBe(0);
  });

  it('stops at the first band that does not pass', () => {
    // Right in band 1, then wrong from band 2 on.
    const check = take((a, n) => (n < CHECK.perBand ? a : a + 1));
    expect(check.results.map((r) => r.passed)).toEqual([true, false]);
    expect(check.recommended).toBe(1);
  });
});
