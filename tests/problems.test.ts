import { describe, expect, it } from 'vitest';
import { add, div, evaluate, format, group, mul, num, opCount, sub } from '../src/learning/expr';
import {
  MAX_ANSWER,
  MAX_DIFFICULTY,
  SKILLS,
  TIERS,
  generateProblem,
  generateRoundProblems,
  generateWave,
  maxAnswer,
  skillsForTier,
  tierOfSkill,
  type Problem,
} from '../src/learning/problems';
import { createRng } from '../src/learning/rng';
import { evaluateText } from './parse';

const SAMPLES = 2000;

function sample(tier: (typeof TIERS)[number], seed = 1): Problem[] {
  const rng = createRng(seed);
  return Array.from({ length: SAMPLES }, () => generateProblem(tier, rng));
}

describe('expr', () => {
  it('formats with the parentheses precedence needs', () => {
    expect(format(add(num(3), mul(num(4), num(2))))).toBe('3+4×2');
    expect(format(mul(add(num(3), num(4)), num(2)))).toBe('(3+4)×2');
    expect(format(sub(num(9), sub(num(5), num(2))))).toBe('9−(5−2)');
    expect(format(div(num(24), div(num(6), num(2))))).toBe('24÷(6÷2)');
  });

  it('keeps explicit groups even when precedence does not need them', () => {
    expect(format(add(num(2), mul(group(div(num(24), num(2))), num(5))))).toBe('2+(24÷2)×5');
  });

  it('rejects negative steps and inexact division', () => {
    expect(evaluate(sub(num(3), num(5)))).toBeNull();
    expect(evaluate(div(num(7), num(2)))).toBeNull();
    expect(evaluate(div(num(7), num(0)))).toBeNull();
    expect(evaluate(add(num(2), mul(group(div(num(24), num(2))), num(5))))).toBe(62);
  });
});

describe.each(TIERS)('tier %i problems', (tier) => {
  const problems = sample(tier);

  it('have whole, non-negative, bounded answers', () => {
    for (const p of problems) {
      expect(Number.isInteger(p.answer)).toBe(true);
      expect(p.answer).toBeGreaterThanOrEqual(0);
      expect(p.answer).toBeLessThanOrEqual(MAX_ANSWER);
    }
  });

  it('never have a step that comes out to 0', () => {
    for (const p of problems) expect(p.answer).toBeGreaterThan(0);
    for (const p of problems) expect(p.text).not.toMatch(/(^|[^\d])0/);
  });

  it('display text evaluates to the stored answer', () => {
    for (const p of problems) expect(evaluateText(p.text)).toBe(p.answer);
  });

  it('never pass through a negative or fractional step', () => {
    for (const p of problems) expect(evaluate(p.expr)).toBe(p.answer);
  });

  it('cover every skill in the tier', () => {
    const seen = new Set(problems.map((p) => p.skill));
    expect([...seen].sort()).toEqual(skillsForTier(tier).sort());
  });

  it('stay short enough to fit inside an enemy', () => {
    for (const p of problems) expect(p.text.length).toBeLessThanOrEqual(12);
  });
});

describe('tier shapes', () => {
  it('tier 1 shows only single digits, one operation', () => {
    for (const p of sample(1)) {
      expect(opCount(p.expr)).toBe(1);
      expect(p.text).toMatch(/^[1-9][+−×÷][1-9]$/);
    }
  });

  it('tier 2 is one operation', () => {
    for (const p of sample(2)) expect(opCount(p.expr)).toBe(1);
  });

  it('tier 3 mixes one +/− with one ×/÷ and no parentheses', () => {
    for (const p of sample(3)) {
      expect(opCount(p.expr)).toBe(2);
      expect(p.text).not.toMatch(/[()]/);
      expect(p.text).toMatch(/[+−]/);
      expect(p.text).toMatch(/[×÷]/);
    }
  });

  it('tier 4 always has parentheses and 2–3 operations', () => {
    for (const p of sample(4)) {
      expect(p.text).toMatch(/\(.+\)/);
      expect(opCount(p.expr)).toBeGreaterThanOrEqual(2);
      expect(opCount(p.expr)).toBeLessThanOrEqual(3);
    }
  });
});

describe.each([1, 2, 3])('difficulty %i', (d) => {
  const problems = SKILLS.flatMap((skill) => {
    const rng = createRng(d * 100 + 1);
    return Array.from({ length: 400 }, () => generateProblem(tierOfSkill(skill), rng, skill, d));
  });

  it('keeps answers whole, positive and within that difficulty\'s cap', () => {
    for (const p of problems) {
      expect(Number.isInteger(p.answer)).toBe(true);
      expect(p.answer).toBeGreaterThan(0);
      expect(p.answer).toBeLessThanOrEqual(maxAnswer(d));
      expect(p.difficulty).toBe(d);
    }
  });

  it('display text evaluates to the stored answer, with no zero steps', () => {
    for (const p of problems) {
      expect(evaluateText(p.text)).toBe(p.answer);
      expect(p.text).not.toMatch(/(^|[^\d])0/);
    }
  });

  it('stays short enough to fit inside an enemy', () => {
    for (const p of problems) expect(p.text.length).toBeLessThanOrEqual(12);
  });
});

describe('higher difficulty', () => {
  const biggestNumber = (p: Problem) => Math.max(...p.text.split(/[^\d]+/).filter(Boolean).map(Number));
  const avgBiggest = (skill: (typeof SKILLS)[number], d: number) => {
    const rng = createRng(9);
    const ps = Array.from({ length: 400 }, () => generateProblem(tierOfSkill(skill), rng, skill, d));
    return ps.reduce((sum, p) => sum + biggestNumber(p), 0) / ps.length;
  };

  it.each(SKILLS)('%s uses bigger numbers at each step', (skill) => {
    const avgs = [0, 1, 2, 3].map((d) => avgBiggest(skill, d));
    for (let d = 1; d <= 3; d++) expect(avgs[d], `difficulty ${d}`).toBeGreaterThanOrEqual(avgs[d - 1]);
    expect(avgs[3]).toBeGreaterThan(avgs[0]);
  });

  it('clamps out-of-range difficulty', () => {
    expect(generateProblem(1, createRng(1), 'add-facts', 99).difficulty).toBe(MAX_DIFFICULTY);
    expect(generateProblem(1, createRng(1), 'add-facts', -1).difficulty).toBe(0);
  });

  it('uses the whole part of a fractional size', () => {
    expect(generateProblem(1, createRng(1), 'add-facts', 1.5).difficulty).toBe(1);
    expect(generateProblem(1, createRng(1), 'add-facts', 0.5).difficulty).toBe(0);
  });
});

describe('generateWave', () => {
  it('takes problem i from pools[i]', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const [a, b, c] = generateWave([['order-ops'], ['add-facts'], ['mul-2digit', 'div-2digit']], rng);
      expect(a.skill).toBe('order-ops');
      expect(b.skill).toBe('add-facts');
      expect(['mul-2digit', 'div-2digit']).toContain(c.skill);
    }
  });

  it('borrows from the rest of the wave when a pool runs out of new answers', () => {
    // Division facts at size 0 only have the answers 2, 3 and 4.
    for (let seed = 0; seed < 50; seed++) {
      const ps = generateWave([['div-facts'], ['div-facts'], ['div-facts'], ['div-facts'], ['mul-facts']], createRng(seed));
      expect(new Set(ps.map((p) => p.answer)).size).toBe(5);
    }
  });
});

describe('generateRoundProblems', () => {
  it('gives unique answers', () => {
    for (let seed = 0; seed < 500; seed++) {
      const round = generateRoundProblems(6, createRng(seed));
      expect(round).toHaveLength(6);
      expect(new Set(round.map((p) => p.answer)).size).toBe(6);
    }
  });

  it('mixes problem types from every tier by default', () => {
    const rng = createRng(3);
    const tiers = new Set<number>();
    for (let i = 0; i < 50; i++) for (const p of generateRoundProblems(5, rng)) tiers.add(p.tier);
    expect([...tiers].sort()).toEqual([1, 2, 3, 4]);
  });

  it('can be limited to some skills (levels and the tutorial do this)', () => {
    const rng = createRng(4);
    for (let i = 0; i < 50; i++) for (const p of generateRoundProblems(3, rng, skillsForTier(1))) expect(p.tier).toBe(1);
    for (let i = 0; i < 50; i++) {
      for (const p of generateRoundProblems(4, rng, ['add-2digit', 'order-ops'])) {
        expect(['add-2digit', 'order-ops']).toContain(p.skill);
      }
    }
  });

  it('uses the difficulty given for each skill', () => {
    const rng = createRng(5);
    const ps = generateRoundProblems(4, rng, ['add-facts', 'mul-facts'], { difficulty: { 'mul-facts': 2 } });
    for (const p of ps) expect(p.difficulty).toBe(p.skill === 'mul-facts' ? 2 : 0);
  });

  it('puts review problems first, then the level\'s own skills', () => {
    const rng = createRng(6);
    for (let i = 0; i < 50; i++) {
      const ps = generateRoundProblems(5, rng, ['add-facts'], { review: ['div-2digit', 'order-ops'], reviewCount: 2 });
      expect(ps.slice(0, 2).every((p) => ['div-2digit', 'order-ops'].includes(p.skill))).toBe(true);
      expect(ps.slice(2).every((p) => p.skill === 'add-facts')).toBe(true);
    }
  });

  it('knows which tier each skill is in', () => {
    expect(SKILLS).toHaveLength(TIERS.reduce((n, t) => n + skillsForTier(t).length, 0));
    for (const t of TIERS) for (const s of skillsForTier(t)) expect(tierOfSkill(s)).toBe(t);
    expect(() => tierOfSkill('nope')).toThrow();
  });

  it('is reproducible from a seed', () => {
    const a = generateRoundProblems(5, createRng(42)).map((p) => p.text);
    const b = generateRoundProblems(5, createRng(42)).map((p) => p.text);
    expect(a).toEqual(b);
  });

  it('can generate a specific skill', () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) expect(generateProblem(1, rng, 'mul-facts').skill).toBe('mul-facts');
    expect(() => generateProblem(1, rng, 'nope')).toThrow();
  });
});
