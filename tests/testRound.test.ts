import { describe, expect, it } from 'vitest';
import { PRESETS, RECOMMEND, TEST } from '../src/config';
import { evaluate, format, parseExpr } from '../src/learning/expr';
import {
  afterTestDue,
  bandPassed,
  minutesToNextTest,
  nextForm,
  scoreTest,
  TEST_LENGTH,
  testItems,
  testOffer,
  testRecommendation,
  TestRound,
  type Form,
  type TestRecord,
} from '../src/learning/testRound';
import { evaluateText } from './parse';

/** "15−7" → "2−1": each number replaced by its digit count, so matching slots must have the same shape. */
const shape = (text: string) => text.replace(/\d+/g, (n) => String(n.length));

/** Take a test, answering problem i with `answer(correct, i)` in `sec(i)` seconds. */
function take(form: Form, answer: (correct: number, i: number) => number | null, sec: (i: number) => number = () => 2): TestRecord {
  const round = new TestRound(form);
  for (let i = 0; !round.done; i++) round.answer(answer(round.current!.answer, i), sec(i) * 1000);
  return round.record(0);
}

const sectionOf = (i: number) => {
  let n = i;
  for (let s = 0; s < TEST.sections.length; s++) {
    if (n < TEST.sections[s].slots.length) return s;
    n -= TEST.sections[s].slots.length;
  }
  throw new Error('past the end');
};

describe('parseExpr', () => {
  it('reads display text back into the same expression', () => {
    for (const text of ['7+5', '15−7', '3+4×2', '30−18÷3', '(18−6)÷3', '2+(24÷2)×5', '(9+4)×3−8', '20−(3+4)', '7×(8−2)+1']) {
      const e = parseExpr(text);
      expect(format(e)).toBe(text);
      expect(evaluate(e)).toBe(evaluateText(text));
    }
  });

  it('accepts ASCII operators and spaces', () => {
    expect(format(parseExpr('2 + (24 / 2) * 5'))).toBe('2+(24÷2)×5');
    expect(format(parseExpr('9-4'))).toBe('9−4');
  });

  it('rejects text that is not a whole expression', () => {
    for (const bad of ['', '2+', '(3+4', '3+4)', '2x3', '2++3']) expect(() => parseExpr(bad), bad).toThrow();
  });
});

describe('TEST forms', () => {
  const slots = TEST.sections.flatMap((s) => s.slots);

  it('show exactly the text written in config, with the right answer', () => {
    for (const form of ['A', 'B'] as const) {
      const items = testItems(form);
      expect(items).toHaveLength(TEST_LENGTH);
      items.forEach(({ problem }, i) => {
        expect(problem.text).toBe(form === 'A' ? slots[i].a : slots[i].b);
        expect(problem.answer).toBe(evaluateText(problem.text));
        expect(problem.skill).toBe(slots[i].skill);
      });
    }
  });

  it('match slot by slot: same shape, answers of the same size, different numbers', () => {
    for (const slot of slots) {
      expect(shape(slot.b), slot.a).toBe(shape(slot.a));
      expect(slot.b).not.toBe(slot.a);
      const [a, b] = [evaluateText(slot.a), evaluateText(slot.b)];
      expect(String(b).length, `${slot.a} vs ${slot.b}`).toBe(String(a).length);
    }
    const formA = new Set(slots.map((s) => s.a));
    for (const s of slots) expect(formA.has(s.b), s.b).toBe(false);
  });

  it('go from facts up to multi-step problems, in the same order every time', () => {
    expect(testItems('A')).toEqual(testItems('A'));
    const tiers = testItems('A').map((it) => it.problem.tier);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1]);
    expect(tiers[0]).toBe(1);
    expect(tiers[tiers.length - 1]).toBe(4);
  });

  it('start with one section for each recommendation band, with the same problem types', () => {
    RECOMMEND.bands.forEach((band, i) => {
      expect(TEST.sections[i].name).toBe(band.name);
      expect(new Set(TEST.sections[i].slots.map((s) => s.skill))).toEqual(new Set(band.skills));
    });
  });
});

describe('TestRound', () => {
  it('records every answer, including skipped ones', () => {
    const record = take('A', (a, i) => (i === 0 ? null : i === 1 ? a + 1 : a));
    expect(record.answers).toHaveLength(TEST_LENGTH);
    expect(record.answers[0]).toMatchObject({ given: null, correct: false, ms: 2000 });
    expect(record.answers[1].correct).toBe(false);
    expect(record.answers.slice(2).every((a) => a.correct)).toBe(true);
    expect(record.form).toBe('A');
  });

  it('ignores answers after the last problem', () => {
    const round = new TestRound('B');
    while (!round.done) round.answer(round.current!.answer, 1000);
    round.answer(1, 1000);
    expect(round.answers).toHaveLength(TEST_LENGTH);
    expect(round.current).toBeNull();
  });

  it('alternates forms, starting with A', () => {
    const a = take('A', (x) => x);
    const b = take('B', (x) => x);
    expect(nextForm([])).toBe('A');
    expect(nextForm([a])).toBe('B');
    expect(nextForm([a, b])).toBe('A');
  });
});

describe('scoring', () => {
  it('scores the whole test and each section', () => {
    // Wrong on the last problem of every section; 2 s each otherwise.
    const lastInSection = new Set(TEST.sections.map((_, s) => TEST.sections.slice(0, s + 1).reduce((n, x) => n + x.slots.length, 0) - 1));
    const score = scoreTest(take('A', (a, i) => (lastInSection.has(i) ? a + 1 : a)));
    expect(score.correct).toBe(TEST_LENGTH - TEST.sections.length);
    expect(score.avgMs).toBe(2000);
    for (const s of score.sections) expect(s.correct).toBe(s.asked - 1);
  });

  it('recommends the hardest setting when everything is right and quick', () => {
    expect(testRecommendation(scoreTest(take('A', (a) => a))).recommended).toBe(PRESETS[PRESETS.length - 1].key);
  });

  it('recommends by how many sections pass in a row, stopping at the first that does not', () => {
    // Everything right, but slow in "Bigger numbers".
    const slow = take('A', (a) => a, (i) => (sectionOf(i) === 2 ? RECOMMEND.bands[2].maxAvgSec + 1 : 2));
    const rec = testRecommendation(scoreTest(slow));
    expect(rec.results.map((r) => r.passed)).toEqual([true, true, false]);
    expect(rec.recommended).toBe(PRESETS[2].key);
    // Wrong on half the facts: start at the beginning, even with everything else right.
    const shaky = take('A', (a, i) => (i < 2 ? a + 1 : a));
    expect(testRecommendation(scoreTest(shaky)).recommended).toBe(PRESETS[0].key);
  });

  it('passes a section with 3 of 4 right and fast enough, not 2 of 4', () => {
    const band = RECOMMEND.bands[0];
    expect(bandPassed(band, 4, 4, 1000)).toBe(true);
    expect(bandPassed(band, 4, 3, 1000)).toBe(true);
    expect(bandPassed(band, 4, 2, 1000)).toBe(false);
    expect(bandPassed(band, 4, 4, band.maxAvgSec * 1000 + 1)).toBe(false);
    expect(bandPassed(band, 0, 0, null)).toBe(false);
  });
});

describe('when the test round is offered', () => {
  const record = (playMinutes: number): TestRecord => ({ ...take('A', (a) => a), playMinutes });

  it('is offered as the "before" on the difficulty screen until a first test is taken', () => {
    expect(testOffer([], 0, null)).toBe('before');
    expect(testOffer([], 25, 3)).toBe('before'); // played and said "not now": still the way to get a recommendation
    expect(testOffer([record(0)], 0, null)).toBeNull();
  });

  it('is offered as the "after" on the difficulty screen only when one is due, never twice in a row', () => {
    expect(testOffer([record(0)], TEST.minutesBetween - 1, null)).toBeNull();
    expect(testOffer([record(0)], TEST.minutesBetween, null)).toBe('after');
    expect(testOffer([record(0), record(12)], 15, null)).toBeNull();
  });

  it('says how many minutes of play are left before the next one', () => {
    expect(minutesToNextTest([record(0)], 4, null)).toBe(TEST.minutesBetween - 4);
    expect(minutesToNextTest([record(0)], 40, null)).toBe(0);
    expect(minutesToNextTest([record(0)], 12, 11)).toBe(TEST.minutesBetween - 1);
    expect(minutesToNextTest([], 3, null)).toBe(0);
  });

  it(`comes after a game once there have been ${TEST.minutesBetween} minutes of play since the last one`, () => {
    const tests = [record(0)];
    expect(afterTestDue(tests, TEST.minutesBetween - 1, null)).toBe(false);
    expect(afterTestDue(tests, TEST.minutesBetween, null)).toBe(true);
    expect(afterTestDue([...tests, record(12)], 15, null)).toBe(false);
  });

  it('waits again after "not now"', () => {
    expect(afterTestDue([record(0)], 12, 11)).toBe(false);
    expect(afterTestDue([record(0)], 11 + TEST.minutesBetween, 11)).toBe(true);
  });

  it('comes straight after the first game if the player has never taken or turned it down', () => {
    expect(afterTestDue([], 2, null)).toBe(true);
    expect(afterTestDue([], 0, null)).toBe(false);
  });
});
