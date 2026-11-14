/**
 * Problem generator. Four tiers, from single-digit facts up to
 * multi-step expressions with parentheses.
 *
 *   Tier 1  single digits only            7+5, 9−4, 7×8, 8÷2
 *   Tier 2  one operation, larger numbers 47+28, 14×3, 96÷8
 *   Tier 3  two operations, order of ops  3+4×2, 30−18÷3
 *   Tier 4  parentheses, 2–3 operations   (18−6)÷3, 2+(24÷2)×5
 *
 * Each problem carries a `skill` key (its problem type). The stages in
 * config.ts walk through the skills from simplest to hardest.
 *
 * Every skill also has a difficulty (number size) from 0 to MAX_DIFFICULTY: the
 * same kind of problem with bigger numbers. Every skill starts at 0 (the
 * examples above); at every shop, learning/adapt.ts moves it per skill,
 * depending on how the player did. Fractional sizes use the whole part.
 *
 *   Skill       difficulty 0   1          2          3
 *   add-facts   7+5            11+8       14+13      19+16
 *   mul-facts   7×8            12×7       9×14       11×18
 *   add-2digit  47+28          68+57      245+38     316+275
 *   order-ops   3+4×2          45−12×3    87+11×12   99−15×6
 *   paren-3op   (9+4)×3−8      …and so on, with every number growing
 */
import { add, div, evaluate, format, group, mul, num, sub, type Expr } from './expr';
import type { Rng } from './rng';

export type Tier = 1 | 2 | 3 | 4;
export const TIERS: readonly Tier[] = [1, 2, 3, 4];

export interface Problem {
  text: string;
  answer: number;
  skill: Skill;
  tier: Tier;
  /** 0 = the smallest numbers; see the table above. */
  difficulty: number;
  expr: Expr;
}

export const MAX_DIFFICULTY = 3;

/** Largest answer allowed at each difficulty, so problems stay mental-math sized. */
const MAX_ANSWERS = [200, 400, 700, 1000];
export const MAX_ANSWER = MAX_ANSWERS[0];
export const maxAnswer = (difficulty: number): number => at(difficulty, MAX_ANSWERS);

/** Difficulty d picks values[d] (the last value for anything higher). */
function at<T>(d: number, values: readonly T[]): T {
  return values[Math.min(Math.max(0, d), values.length - 1)];
}

/** True if any operation in the expression results in 0, like (4−4)×8. Those make trivial problems. */
function hasZeroStep(e: Expr): boolean {
  if (e.kind === 'num') return false;
  return evaluate(e) === 0 || hasZeroStep(e.left) || hasZeroStep(e.right);
}

type Builder = (rng: Rng, d: number) => Expr;

const plusOrMinus = (rng: Rng, a: Expr, b: Expr): Expr => (rng.next() < 0.5 ? add(a, b) : sub(a, b));
const eitherOrder = (rng: Rng, a: Expr, b: Expr, op: (l: Expr, r: Expr) => Expr): Expr =>
  rng.next() < 0.5 ? op(a, b) : op(b, a);

/** A multiplication or division fact up to max×max, used inside bigger expressions. */
const factTerm = (rng: Rng, max: number): Expr => {
  const x = rng.int(2, max);
  const y = rng.int(2, max);
  return rng.next() < 0.5 ? mul(num(x), num(y)) : div(num(x * y), num(x));
};

/** [a range, b range] for a + b at each difficulty. */
const ADD_RANGES: [number, number, number, number][] = [
  [11, 89, 11, 89], // 47+28
  [25, 99, 25, 99], // 68+57
  [101, 399, 11, 99], // 245+38
  [101, 499, 101, 499], // 316+275
];

/** [a range, b range] for a − b at each difficulty; b also stays at least 5 below a. */
const SUB_RANGES: [number, number, number, number][] = [
  [30, 99, 11, 99], // 83−36
  [100, 199, 11, 99], // 143−67
  [200, 499, 101, 499], // 382−147
  [300, 999, 101, 999], // 812−375
];

const BUILDERS = {
  // At difficulty 0 every number shown is a single digit (answers to + and × can be bigger).
  1: {
    'add-facts': (rng, d) => {
      const max = at(d, [9, 12, 15, 20]);
      return add(num(rng.int(1, max)), num(rng.int(1, max)));
    },
    'sub-facts': (rng, d) => {
      if (d === 0) {
        const a = rng.int(2, 9);
        return sub(num(a), num(rng.int(1, a - 1)));
      }
      // The reverse of an addition fact: 17−8 from 9+8.
      const max = at(d, [9, 12, 15, 20]);
      const x = rng.int(1, max);
      const y = rng.int(1, max);
      return sub(num(x + y), num(y));
    },
    'mul-facts': (rng, d) =>
      eitherOrder(rng, num(rng.int(2, at(d, [9, 12, 12, 12]))), num(rng.int(2, at(d, [9, 12, 15, 20]))), mul),
    'div-facts': (rng, d) => {
      if (d === 0) {
        // Only 4÷2, 6÷2, 6÷3, 8÷2, 8÷4 and 9÷3 keep both numbers single-digit.
        const [dividend, divisor] = rng.pick([[4, 2], [6, 2], [6, 3], [8, 2], [8, 4], [9, 3]] as const);
        return div(num(dividend), num(divisor));
      }
      // The reverse of a times-table fact: 56÷7 from 7×8.
      const divisor = rng.int(2, at(d, [9, 9, 12, 12]));
      return div(num(divisor * rng.int(2, at(d, [9, 9, 12, 15]))), num(divisor));
    },
  },
  2: {
    'add-2digit': (rng, d) => {
      const [aLo, aHi, bLo, bHi] = at(d, ADD_RANGES);
      return eitherOrder(rng, num(rng.int(aLo, aHi)), num(rng.int(bLo, bHi)), add);
    },
    'sub-2digit': (rng, d) => {
      const [aLo, aHi, bLo, bHi] = at(d, SUB_RANGES);
      const a = rng.int(aLo, aHi);
      return sub(num(a), num(rng.int(bLo, Math.min(bHi, a - 5))));
    },
    'mul-2digit': (rng, d) => eitherOrder(rng, num(rng.int(11, at(d, [19, 29, 49, 99]))), num(rng.int(2, 9)), mul),
    'div-2digit': (rng, d) => {
      const b = rng.int(2, 9);
      return div(num(b * rng.int(11, at(d, [19, 29, 49, 99]))), num(b));
    },
  },
  3: {
    // One + or − mixed with one × or ÷. Putting the number first (3+4×2) is the
    // form where working left to right gives the wrong answer, so it is favoured.
    'order-ops': (rng, d) => {
      const term = factTerm(rng, at(d, [9, 12, 12, 15]));
      const n = num(rng.int(1, at(d, [30, 50, 99, 99])));
      return rng.next() < 0.65 ? plusOrMinus(rng, n, term) : plusOrMinus(rng, term, n);
    },
  },
  4: {
    'paren-2op': (rng, d) => {
      const inner = group(plusOrMinus(rng, num(rng.int(2, at(d, [15, 25, 40, 60]))), num(rng.int(1, at(d, [12, 20, 30, 40])))));
      const c = num(rng.int(2, at(d, [9, 9, 12, 12])));
      switch (rng.int(0, 2)) {
        case 0:
          return mul(inner, c);
        case 1:
          return mul(c, inner);
        default: {
          // (a+b)÷c, built so the sum divides evenly
          const divisor = rng.int(2, at(d, [9, 9, 12, 12]));
          const total = divisor * rng.int(2, at(d, [12, 15, 20, 25]));
          const a = rng.int(1, total - 1);
          return div(group(add(num(a), num(total - a))), num(divisor));
        }
      }
    },
    'paren-3op': (rng, d) => {
      const last = rng.int(1, at(d, [20, 40, 60, 99]));
      switch (rng.int(0, 2)) {
        case 0: {
          // a+(b÷c)×d, like 2+(24÷2)×5
          const c = rng.int(2, 9);
          const b = c * rng.int(2, at(d, [12, 12, 15, 15]));
          return add(num(last), mul(group(div(num(b), num(c))), num(rng.int(2, 9))));
        }
        case 1:
          // (a+b)×c−d
          return sub(
            mul(group(add(num(rng.int(2, at(d, [12, 20, 30, 40]))), num(rng.int(1, at(d, [9, 12, 20, 25]))))), num(rng.int(2, at(d, [6, 6, 9, 9])))),
            num(last),
          );
        default:
          // a×(b−c)+d
          return add(
            mul(num(rng.int(2, 9)), group(sub(num(rng.int(6, at(d, [20, 30, 50, 99]))), num(rng.int(1, at(d, [5, 9, 20, 25])))))),
            num(last),
          );
      }
    },
  },
} satisfies Record<Tier, Record<string, Builder>>;

/** A problem type, like 'mul-facts' or 'paren-2op'. Levels in config.ts pick from these. */
export type Skill = { [T in Tier]: keyof (typeof BUILDERS)[T] }[Tier] & string;

const SKILL_TIER = new Map<string, Tier>(TIERS.flatMap((t) => Object.keys(BUILDERS[t]).map((k) => [k, t] as const)));

/** Every skill, simplest tier first. */
export const SKILLS = [...SKILL_TIER.keys()] as Skill[];

/** Names shown to the player, e.g. in the shop's "back for practice" list. */
export const SKILL_NAMES: Record<Skill, string> = {
  'add-facts': 'Adding',
  'sub-facts': 'Subtracting',
  'mul-facts': 'Multiplying',
  'div-facts': 'Dividing',
  'add-2digit': 'Adding big numbers',
  'sub-2digit': 'Subtracting big numbers',
  'mul-2digit': 'Multiplying big numbers',
  'div-2digit': 'Dividing big numbers',
  'order-ops': 'Order of operations',
  'paren-2op': 'Parentheses',
  'paren-3op': 'Multi-step parentheses',
};

export function skillsForTier(tier: Tier): Skill[] {
  return Object.keys(BUILDERS[tier]) as Skill[];
}

export function tierOfSkill(skill: string): Tier {
  const tier = SKILL_TIER.get(skill);
  if (tier === undefined) throw new Error(`Unknown skill "${skill}"`);
  return tier;
}

export function problemFromExpr(expr: Expr, skill: Skill, tier: Tier, difficulty = 0): Problem {
  const answer = evaluate(expr);
  if (answer === null) throw new Error(`Invalid expression: ${format(expr)}`);
  return { text: format(expr), answer, skill, tier, difficulty, expr };
}

/** One problem from the tier, at the given difficulty. Retries until the constraints hold. */
export function generateProblem(tier: Tier, rng: Rng, skill?: string, difficulty = 0): Problem {
  const builders: Record<string, Builder> = BUILDERS[tier];
  const key = skill ?? rng.pick(Object.keys(builders));
  const build = builders[key];
  if (!build) throw new Error(`Unknown skill "${key}" for tier ${tier}`);
  const d = Math.min(Math.max(0, Math.floor(difficulty)), MAX_DIFFICULTY);
  for (let attempt = 0; attempt < 200; attempt++) {
    const expr = build(rng, d);
    const answer = evaluate(expr);
    if (answer !== null && answer <= maxAnswer(d) && !hasZeroStep(expr)) {
      return { text: format(expr), answer, skill: key as Skill, tier, difficulty: d, expr };
    }
  }
  throw new Error(`Could not generate a valid ${key} problem`);
}

/** Difficulty per skill (0 if missing). */
export type SkillSizes = Partial<Record<Skill, number>>;

/**
 * One wave: problem i comes from a skill picked at random from `pools[i]`, at
 * that skill's difficulty. No two share an answer, so every target ("Find and
 * hit 42") has exactly one matching enemy. If a pool can't come up with a new
 * answer (division facts at size 0 only have 2, 3 and 4), that problem comes
 * from any skill in the wave instead.
 */
export function generateWave(pools: readonly (readonly Skill[])[], rng: Rng, difficulty: SkillSizes = {}): Problem[] {
  const all = [...new Set(pools.flat())];
  const out: Problem[] = [];
  const answers = new Set<number>();
  for (const pool of pools) {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 1000) throw new Error(`Could not find ${pools.length} unique answers from ${all.join(', ')}`);
      const skill = rng.pick(attempt < 50 ? pool : all);
      const p = generateProblem(tierOfSkill(skill), rng, skill, difficulty[skill] ?? 0);
      if (answers.has(p.answer)) continue;
      answers.add(p.answer);
      out.push(p);
      break;
    }
  }
  return out;
}

export interface RoundProblemOptions {
  difficulty?: SkillSizes;
  /** Skills to review: the first `reviewCount` problems come from these instead. */
  review?: readonly Skill[];
  reviewCount?: number;
}

/**
 * `count` problems, each from a skill picked at random from `skills` (or from
 * `review`, for the first `reviewCount`), with unique answers. See generateWave.
 */
export function generateRoundProblems(
  count: number,
  rng: Rng,
  skills: readonly Skill[] = SKILLS,
  opts: RoundProblemOptions = {},
): Problem[] {
  const review = opts.review ?? [];
  const reviewCount = review.length ? Math.min(opts.reviewCount ?? 0, count) : 0;
  const pools = Array.from({ length: count }, (_, i) => (i < reviewCount ? review : skills));
  return generateWave(pools, rng, opts.difficulty);
}
