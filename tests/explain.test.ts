import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/config';
import { explain, explainLine, usesStrategy } from '../src/learning/explain';
import { evaluate, parseExpr } from '../src/learning/expr';
import { generateProblem, MAX_DIFFICULTY, SKILLS, tierOfSkill } from '../src/learning/problems';
import { createRng } from '../src/learning/rng';
import { testItems } from '../src/learning/testRound';

/** Every step is "a op b = c" with whole numbers that work out, and the last one gives the answer. */
function expectSound(text: string): void {
  const expr = parseExpr(text);
  const answer = evaluate(expr);
  const { how, steps, after, before } = explain(expr);
  expect(how.length, text).toBeGreaterThan(0);
  expect(steps.length, text).toBeGreaterThanOrEqual(1);
  expect(steps.length, text).toBeLessThanOrEqual(4);
  for (const s of steps) {
    const m = /^(\d+[+−×÷]\d+) = (\d+)$/.exec(s);
    expect(m, `${text}: "${s}"`).not.toBeNull();
    expect(evaluate(parseExpr(m![1])), `${text}: "${s}"`).toBe(Number(m![2]));
  }
  expect(Number(steps[steps.length - 1].split(' = ')[1]), text).toBe(answer);
  if (before) {
    // The marked part of each "before" is exactly what that step works out.
    expect(before).toHaveLength(steps.length);
    before.forEach((b, i) => {
      const marked = /\u0001\(?(.+?)\)?\u0002/.exec(b);
      expect(marked, b).not.toBeNull();
      expect(marked![1], b).toBe(steps[i].split(' = ')[0]);
      expect(evaluate(parseExpr(b.replace(/[\u0001\u0002]/g, ''))), b).toBe(answer);
    });
  }
  if (after) {
    expect(after).toHaveLength(steps.length);
    for (const rest of after) expect(evaluate(parseExpr(rest)), `${text} → ${rest}`).toBe(answer);
    expect(after[after.length - 1]).toBe(String(answer));
  }
}

describe('explain', () => {
  it('gives sound steps for every problem type at every number size', () => {
    const rng = createRng(11);
    for (const skill of SKILLS) {
      for (let d = 0; d <= MAX_DIFFICULTY; d++) {
        for (let i = 0; i < 120; i++) expectSound(generateProblem(tierOfSkill(skill), rng, skill, d).text);
      }
    }
  });

  it('covers every test round problem and every lesson example', () => {
    for (const form of ['A', 'B'] as const) for (const { problem } of testItems(form)) expectSound(problem.text);
    for (const stage of STAGES) for (const example of stage.lesson?.examples ?? []) expectSound(example);
  });

  it('makes a ten for single-digit adding', () => {
    expect(explain(parseExpr('8+5'))).toEqual({ how: 'Make a ten: 5 is 2 and 3', steps: ['8+2 = 10', '10+3 = 13'] });
    expect(explain(parseExpr('5+8')).steps).toEqual(['8+2 = 10', '10+3 = 13']);
    expect(explain(parseExpr('6+3'))).toEqual({ how: 'Start at 6 and count on 3: 7, 8, 9', steps: ['6+3 = 9'] });
  });

  it('thinks addition, or goes back to ten, for subtracting', () => {
    expect(explain(parseExpr('9−4')).steps).toEqual(['4+5 = 9', '9−4 = 5']);
    expect(explain(parseExpr('15−7'))).toEqual({ how: 'Go down to 10 first: 7 is 5 and 2', steps: ['15−5 = 10', '10−2 = 8'] });
  });

  it('splits bigger numbers into tens and ones', () => {
    expect(explain(parseExpr('47+28'))).toEqual({ how: 'Split 28 into 20 and 8', steps: ['47+20 = 67', '67+8 = 75'] });
    expect(explain(parseExpr('83−36')).steps).toEqual(['83−30 = 53', '53−6 = 47']);
    expect(explain(parseExpr('17×3')).steps).toEqual(['10×3 = 30', '7×3 = 21', '30+21 = 51']);
    expect(explain(parseExpr('96÷8')).steps).toEqual(['80÷8 = 10', '16÷8 = 2', '10+2 = 12']);
  });

  it('turns a hard times-table fact into easy ones', () => {
    expect(explain(parseExpr('7×8'))).toEqual({ how: '8 is 5 and 3', steps: ['5×7 = 35', '3×7 = 21', '35+21 = 56'] });
    expect(explain(parseExpr('9×6')).steps).toEqual(['10×6 = 60', '60−6 = 54']);
    expect(explain(parseExpr('4×6')).steps).toEqual(['6+6 = 12', '12+12 = 24']);
    expect(explain(parseExpr('42÷6')).steps).toEqual(['6×7 = 42', '42÷6 = 7']);
  });

  it('works multi-step problems one operation at a time, in the right order', () => {
    expect(explain(parseExpr('3+4×2'))).toEqual({
      how: '× and ÷ come before + and −',
      steps: ['4×2 = 8', '3+8 = 11'],
      after: ['3+8', '11'],
      before: ['3+\u00014×2\u0002', '\u00013+8\u0002'],
    });
    expect(explain(parseExpr('2+(24÷2)×5'))).toEqual({
      how: 'Parentheses first, then × and ÷, then + and −',
      steps: ['24÷2 = 12', '12×5 = 60', '2+60 = 62'],
      after: ['2+12×5', '2+60', '62'],
      before: ['2+\u0001(24÷2)\u0002×5', '2+\u000112×5\u0002', '\u00012+60\u0002'],
    });
    expect(explain(parseExpr('(18−6)÷3')).how).toBe('Parentheses first');
  });

  it('knows which problems show the trick off (for the lesson practice problem)', () => {
    expect(usesStrategy(parseExpr('8+5'))).toBe(true);
    expect(usesStrategy(parseExpr('1+9'))).toBe(false);
    expect(usesStrategy(parseExpr('9−4'))).toBe(true);
  });

  it('fits on one line, dropping the strategy if it is too long', () => {
    expect(explainLine(parseExpr('8+5'))).toBe('Make a ten: 5 is 2 and 3:  8+2 = 10  →  10+3 = 13');
    expect(explainLine(parseExpr('8+5'), 20)).toBe('8+2 = 10  →  10+3 = 13');
  });
});
