/**
 * Worked steps: one way to work a problem out in your head, as a short strategy
 * and a few small steps, for example
 *
 *   8+5         Make a ten: 5 is 2 and 3      8+2 = 10 → 10+3 = 13
 *   7×8         8 is 5 and 3                  5×7 = 35 → 3×7 = 21 → 35+21 = 56
 *   2+(24÷2)×5  Parentheses first, …          24÷2 = 12 → 12×5 = 60 → 2+60 = 62
 *
 * Used by the lessons before each new stage, the hint after a wrong hit, and the
 * summaries. Every step is "a op b = c" with whole numbers, and the last step
 * gives the answer (tests/explain.test.ts checks this for every problem type).
 * Pure TypeScript, no Phaser.
 */
import { DISPLAY_OP, evaluate, format, num, opCount, type Expr, type Op } from './expr';

export interface Explanation {
  /** The strategy in a few words, e.g. "Make a ten: 5 is 2 and 3". */
  how: string;
  /** Small steps, each "a op b = c". The last one gives the answer. */
  steps: string[];
  /** Multi-step problems only: what is left after each step ("2+12×5", "2+60", "62"). */
  after?: string[];
}

const step = (a: number, op: Op, b: number, c: number) => `${a}${DISPLAY_OP[op]}${b} = ${c}`;

/** "20 and 8", "200, 70 and 5". */
const and = (parts: number[]) =>
  parts.length < 2 ? String(parts[0]) : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** Place-value parts, biggest first, without zeros: 275 → [200, 70, 5]. */
function placeParts(n: number): number[] {
  const parts: number[] = [];
  for (let unit = 10 ** Math.floor(Math.log10(Math.max(1, n))); unit >= 1; unit /= 10) {
    const part = Math.floor((n % (unit * 10)) / unit) * unit;
    if (part > 0) parts.push(part);
  }
  return parts;
}

export function explain(expr: Expr): Explanation {
  if (expr.kind === 'num') return { how: 'Just the number', steps: [] };
  if (opCount(expr) > 1 || expr.left.kind !== 'num' || expr.right.kind !== 'num') return oneAtATime(expr);
  const [a, b] = [expr.left.value, expr.right.value];
  switch (expr.op) {
    case '+':
      return adding(a, b);
    case '-':
      return subtracting(a, b);
    case '*':
      return multiplying(a, b);
    case '/':
      return dividing(a, b);
  }
}

/** True if the strategy takes more than one step (so a problem shows it off: 8+5, not 1+9). */
export const usesStrategy = (expr: Expr): boolean => explain(expr).steps.length > 1;

/**
 * "Make a ten: 5 is 2 and 3:  8+2 = 10  →  10+3 = 13" on one line (hints and
 * summaries). Longer than `maxLength`: just the steps.
 */
export function explainLine(expr: Expr, maxLength = Infinity): string {
  const { how, steps } = explain(expr);
  const full = `${how}:  ${steps.join('  →  ')}`;
  return full.length <= maxLength ? full : steps.join('  →  ');
}

function adding(a: number, b: number): Explanation {
  const [big, small] = a >= b ? [a, b] : [b, a];
  const sum = a + b;
  if (big < 10) {
    if (sum < 10) {
      const counts = Array.from({ length: small }, (_, i) => big + i + 1).join(', ');
      return { how: `Start at ${big} and count on ${small}: ${counts}`, steps: [step(big, '+', small, sum)] };
    }
    if (sum === 10) return { how: `${big} and ${small} make 10`, steps: [step(big, '+', small, sum)] };
    const need = 10 - big;
    return {
      how: `Make a ten: ${small} is ${need} and ${small - need}`,
      steps: [step(big, '+', need, 10), step(10, '+', small - need, sum)],
    };
  }
  if (small < 10) {
    const ones = big % 10;
    const tens = big - ones;
    if (ones === 0 || ones + small === 10) return { how: 'Add the ones', steps: [step(big, '+', small, sum)] };
    if (ones + small < 10) {
      return {
        how: `Add the ones: ${big} is ${tens} and ${ones}`,
        steps: [step(ones, '+', small, ones + small), step(tens, '+', ones + small, sum)],
      };
    }
    const need = 10 - ones;
    return {
      how: `Make the next ten: ${small} is ${need} and ${small - need}`,
      steps: [step(big, '+', need, tens + 10), step(tens + 10, '+', small - need, sum)],
    };
  }
  const parts = placeParts(small);
  let total = big;
  const steps = parts.map((part) => step(total, '+', part, (total += part)));
  return { how: parts.length > 1 ? `Split ${small} into ${and(parts)}` : `Add the ${small >= 100 ? 'hundreds' : 'tens'}`, steps };
}

function subtracting(a: number, b: number): Explanation {
  const diff = a - b;
  const ones = a % 10;
  const thinkAddition = (): Explanation => ({
    how: `Think addition: ${b} plus what makes ${a}?`,
    steps: [step(b, '+', diff, a), step(a, '-', b, diff)],
  });
  if (a <= 10) return thinkAddition();
  if (b < 10) {
    if (ones === 0) return thinkAddition();
    if (b === ones) return { how: 'Take away the ones', steps: [step(a, '-', b, diff)] };
    if (b < ones) {
      return {
        how: `Take it from the ones: ${a} is ${a - ones} and ${ones}`,
        steps: [step(ones, '-', b, ones - b), step(a - ones, '+', ones - b, diff)],
      };
    }
    return {
      how: `Go down to ${a - ones} first: ${b} is ${ones} and ${b - ones}`,
      steps: [step(a, '-', ones, a - ones), step(a - ones, '-', b - ones, diff)],
    };
  }
  const parts = placeParts(b);
  let left = a;
  const steps = parts.map((part) => step(left, '-', part, (left -= part)));
  return { how: parts.length > 1 ? `Split ${b} into ${and(parts)}` : `Take away the ${b >= 100 ? 'hundreds' : 'tens'}`, steps };
}

function multiplying(a: number, b: number): Explanation {
  const [big, small] = a >= b ? [a, b] : [b, a];
  const product = a * b;
  if (big >= 10) {
    const ones = big % 10;
    const tens = big - ones;
    if (ones === 0) {
      if (tens === 10) return { how: 'Times 10: put a 0 on the end', steps: [step(10, '*', small, product)] };
      const t = tens / 10;
      return { how: `${tens} is ${t} tens`, steps: [step(t, '*', small, t * small), step(t * small, '*', 10, product)] };
    }
    return {
      how: `Split ${big} into ${tens} and ${ones}`,
      steps: [step(tens, '*', small, tens * small), step(ones, '*', small, ones * small), step(tens * small, '+', ones * small, product)],
    };
  }
  if (small === 1) return { how: 'Times 1 keeps the number', steps: [step(big, '*', 1, product)] };
  if (small === 2) return { how: 'Times 2 is a double', steps: [step(big, '+', big, product)] };
  if (a === 5 || b === 5) {
    const n = a === 5 ? b : a;
    return { how: 'Times 5 is half of times 10', steps: [step(10, '*', n, 10 * n), step(10 * n, '/', 2, product)] };
  }
  if (a === 9 || b === 9) {
    const n = a === 9 ? b : a;
    return { how: `Times 9 is times 10, take away one ${n}`, steps: [step(10, '*', n, 10 * n), step(10 * n, '-', n, product)] };
  }
  if (a === 4 || b === 4) {
    const n = a === 4 ? b : a;
    return { how: 'Times 4: double, then double again', steps: [step(n, '+', n, 2 * n), step(2 * n, '+', 2 * n, product)] };
  }
  // What's left uses 3, 6, 7 and 8: split the bigger one into 5 (or 2) and the rest.
  const k = big >= 6 ? 5 : 2;
  const rest = big - k;
  if (rest === 1) {
    return { how: `${big} is ${k} and 1 more`, steps: [step(k, '*', small, k * small), step(k * small, '+', small, product)] };
  }
  return {
    how: `${big} is ${k} and ${rest}`,
    steps: [step(k, '*', small, k * small), step(rest, '*', small, rest * small), step(k * small, '+', rest * small, product)],
  };
}

function dividing(a: number, b: number): Explanation {
  const q = a / b;
  const tens = q - (q % 10);
  if (q > 10 && q % 10 !== 0) {
    const first = b * tens;
    return {
      how: `Split ${a} into ${first} and ${a - first}`,
      steps: [step(first, '/', b, tens), step(a - first, '/', b, q - tens), step(tens, '+', q - tens, q)],
    };
  }
  return { how: `Think multiplication: ${b} times what makes ${a}?`, steps: [step(b, '*', q, a), step(a, '/', b, q)] };
}

/** Multi-step problems: do one operation at a time, in the right order, and show what's left. */
function oneAtATime(expr: Expr): Explanation {
  const steps: string[] = [];
  const after: string[] = [];
  let e = expr;
  while (e.kind === 'bin') {
    const [next, done] = reduceFirst(e);
    steps.push(done);
    after.push(format(next));
    e = next;
  }
  const how = !hasGroup(expr)
    ? '× and ÷ come before + and −'
    : opCount(expr) > 2
      ? 'Parentheses first, then × and ÷, then + and −'
      : 'Parentheses first';
  return { how, steps, after };
}

/**
 * Work out the first operation that's ready (both sides are numbers), searching
 * left side first. The tree already encodes the order of operations, so this
 * does parentheses, then × and ÷, then + and −, left to right.
 */
function reduceFirst(e: Expr & { kind: 'bin' }): [Expr, string] {
  if (e.left.kind === 'bin') {
    const [left, done] = reduceFirst(e.left);
    return [{ ...e, left }, done];
  }
  if (e.right.kind === 'bin') {
    const [right, done] = reduceFirst(e.right);
    return [{ ...e, right }, done];
  }
  const value = evaluate(e);
  if (value === null) throw new Error(`Can't work out ${format(e)}`);
  return [num(value), step(e.left.value, e.op, e.right.value, value)];
}

function hasGroup(e: Expr): boolean {
  return e.kind === 'bin' && (e.group === true || hasGroup(e.left) || hasGroup(e.right));
}
