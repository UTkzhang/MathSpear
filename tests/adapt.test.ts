import { describe, expect, it } from 'vitest';
import { ADAPT } from '../src/config';
import type { Attempt } from '../src/game/round';
import { adaptAtCheckpoint, rate, sizeChanges, skillReport } from '../src/learning/adapt';
import { add, group, mul, num } from '../src/learning/expr';
import { MAX_DIFFICULTY, SKILLS, problemFromExpr, type Problem } from '../src/learning/problems';

const addFact = problemFromExpr(add(num(2), num(3)), 'add-facts', 1);
const mulFact = problemFromExpr(mul(num(6), num(7)), 'mul-facts', 1);
const paren = problemFromExpr(add(num(2), mul(group(add(num(4), num(4))), num(5))), 'paren-3op', 4); // 3 operations

const hit = (p: Problem, sec: number): Attempt => ({ problem: p, target: p.answer, correct: true, responseMs: sec * 1000 });
const miss = (p: Problem): Attempt => ({ problem: p, target: p.answer + 1, correct: false, responseMs: 2000 });
const times = <T>(n: number, f: () => T): T[] => Array.from({ length: n }, f);

describe('rate', () => {
  it('is strong when accurate and fast', () => {
    expect(rate(1, (ADAPT.fastSec - 1) * 1000, 1)).toBe('strong');
  });

  it('is ok when accurate but not fast', () => {
    expect(rate(1, (ADAPT.fastSec + 1) * 1000, 1)).toBe('ok');
  });

  it('is weak when inaccurate or slow', () => {
    expect(rate(ADAPT.weakAccuracy - 0.01, 1000, 1)).toBe('weak');
    expect(rate(1, (ADAPT.slowSec + 1) * 1000, 1)).toBe('weak');
    expect(rate(0, null, 1)).toBe('weak');
  });

  it('gives more time to problems with more steps', () => {
    const ms = (ADAPT.fastSec + 2) * 1000;
    expect(rate(1, ms, 1)).toBe('ok');
    expect(rate(1, ms, 3)).toBe('strong');
  });
});

describe('adaptAtCheckpoint', () => {
  it('moves each rated skill by how it went', () => {
    const pending = [
      ...times(5, () => hit(addFact, 2)), // strong
      ...times(4, () => hit(mulFact, ADAPT.fastSec + 2)), // ok
      ...times(3, () => miss(paren)),
      hit(paren, 5), // weak: 25%
    ];
    const next = adaptAtCheckpoint({ 'mul-facts': 1, 'paren-3op': 1 }, [], pending);
    expect(next.difficulty['add-facts']).toBe(ADAPT.step.strong);
    expect(next.difficulty['mul-facts']).toBe(1 + ADAPT.step.ok);
    expect(next.difficulty['paren-3op']).toBe(1 + ADAPT.step.weak);
    expect(next.review).toEqual(['paren-3op']);
    expect(next.report.results.map((r) => [r.skill, r.rating])).toEqual([
      ['add-facts', 'strong'],
      ['mul-facts', 'ok'],
      ['paren-3op', 'weak'],
    ]);
    expect(next.pending).toEqual([]);
  });

  it('waits for enough hits before rating a skill, and keeps them for next time', () => {
    const few = times(ADAPT.minAttempts - 1, () => miss(mulFact));
    const next = adaptAtCheckpoint({}, [], [...few, ...times(ADAPT.minAttempts, () => hit(addFact, 1))]);
    expect(next.difficulty['mul-facts']).toBeUndefined();
    expect(next.report.results.map((r) => r.skill)).toEqual(['add-facts']);
    expect(next.pending).toEqual(few);
  });

  it('leaves skills that did not come up alone', () => {
    const next = adaptAtCheckpoint({ 'div-2digit': 2 }, [], times(ADAPT.minAttempts, () => hit(addFact, 1)));
    expect(next.difficulty['div-2digit']).toBe(2);
    expect(next.difficulty['order-ops']).toBeUndefined();
  });

  it('keeps a skill in review until it is rated ok again', () => {
    const stillWaiting = adaptAtCheckpoint({}, ['paren-3op'], times(ADAPT.minAttempts, () => hit(addFact, 1)));
    expect(stillWaiting.review).toEqual(['paren-3op']);
    const better = adaptAtCheckpoint({}, ['paren-3op'], times(ADAPT.minAttempts, () => hit(paren, 5)));
    expect(better.review).toEqual([]);
  });

  it('stays between 0 and the top size', () => {
    const top = Object.fromEntries(SKILLS.map((s) => [s, MAX_DIFFICULTY]));
    expect(adaptAtCheckpoint(top, [], times(5, () => hit(addFact, 1))).difficulty['add-facts']).toBe(MAX_DIFFICULTY);
    expect(adaptAtCheckpoint({}, [], times(5, () => miss(addFact))).difficulty['add-facts']).toBe(0);
  });
});

describe('sizeChanges', () => {
  it('lists only skills whose problems will look different', () => {
    const report = adaptAtCheckpoint(
      { 'add-facts': 0, 'mul-facts': 0.5, 'paren-3op': 1 },
      [],
      [...times(5, () => hit(addFact, 1)), ...times(4, () => hit(mulFact, ADAPT.fastSec + 2)), ...times(4, () => miss(paren))],
    ).report;
    // add-facts 0 → 1 (bigger), mul-facts 0.5 → 1 (bigger), paren-3op 1 → 0.5 (smaller)
    expect(sizeChanges(report)).toEqual({ bigger: ['add-facts', 'mul-facts'], smaller: ['paren-3op'] });
  });
});

describe('skillReport', () => {
  it('rates each problem type the way the shop does, simplest first', () => {
    const rows = skillReport([...times(3, () => miss(mulFact)), ...times(4, () => hit(addFact, 2))]);
    expect(rows.map((r) => r.skill)).toEqual(['add-facts', 'mul-facts']);
    expect(rows[0]).toMatchObject({ attempts: 4, correct: 4, avgMs: 2000, rating: 'strong' });
    expect(rows[1]).toMatchObject({ attempts: 3, correct: 0, avgMs: null, rating: 'weak' });
  });

  it('says "too few to tell" (null) below the minimum number of hits', () => {
    const rows = skillReport(times(ADAPT.minAttempts - 1, () => hit(paren, 3)));
    expect(rows).toEqual([{ skill: 'paren-3op', attempts: ADAPT.minAttempts - 1, correct: ADAPT.minAttempts - 1, avgMs: 3000, rating: null }]);
  });

  it('leaves out problem types with no hits', () => {
    expect(skillReport([])).toEqual([]);
  });
});
