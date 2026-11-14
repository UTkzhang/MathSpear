/**
 * Arithmetic expression trees: build, evaluate, and format for display.
 * Pure TypeScript, no Phaser, so it can be unit-tested.
 */
export type Op = '+' | '-' | '*' | '/';

export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'bin'; op: Op; left: Expr; right: Expr; group?: boolean };

export const num = (value: number): Expr => ({ kind: 'num', value });
export const add = (left: Expr, right: Expr): Expr => ({ kind: 'bin', op: '+', left, right });
export const sub = (left: Expr, right: Expr): Expr => ({ kind: 'bin', op: '-', left, right });
export const mul = (left: Expr, right: Expr): Expr => ({ kind: 'bin', op: '*', left, right });
export const div = (left: Expr, right: Expr): Expr => ({ kind: 'bin', op: '/', left, right });
/** Wrap a sub-expression in parentheses when displayed, even if precedence doesn't require it. */
export const group = (e: Expr): Expr => (e.kind === 'bin' ? { ...e, group: true } : e);

const PRECEDENCE: Record<Op, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
export const DISPLAY_OP: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

/**
 * Evaluate with the game's constraints: every intermediate result must be a
 * non-negative whole number, and division must be exact.
 * Returns null if any step breaks a constraint.
 */
export function evaluate(e: Expr): number | null {
  if (e.kind === 'num') return e.value;
  const l = evaluate(e.left);
  const r = evaluate(e.right);
  if (l === null || r === null) return null;
  let v: number;
  switch (e.op) {
    case '+':
      v = l + r;
      break;
    case '-':
      v = l - r;
      break;
    case '*':
      v = l * r;
      break;
    case '/':
      if (r === 0 || l % r !== 0) return null;
      v = l / r;
      break;
  }
  if (v < 0 || !Number.isInteger(v)) return null;
  return v;
}

/** Number of operators in the expression. */
export function opCount(e: Expr): number {
  return e.kind === 'num' ? 0 : 1 + opCount(e.left) + opCount(e.right);
}

/** Operators used, left to right. */
export function opsUsed(e: Expr): Op[] {
  return e.kind === 'num' ? [] : [...opsUsed(e.left), e.op, ...opsUsed(e.right)];
}

/** Put around the `mark`ed part of format()'s text, e.g. "2+\u0001(24÷2)\u0002×5". */
export const MARK_START = '\u0001';
export const MARK_END = '\u0002';

/**
 * Display text, e.g. "2+(24÷2)×5". Adds parentheses where precedence needs them
 * or `group` asks for them. If `mark` is a node of `e`, its text (with its
 * parentheses) is wrapped in MARK_START and MARK_END, so it can be highlighted.
 */
export function format(e: Expr, mark?: Expr): string {
  const wrap = (node: Expr, text: string) => (node === mark ? `${MARK_START}${text}${MARK_END}` : text);
  const plain = (e: Expr): string => {
    if (e.kind === 'num') return String(e.value);
    const p = PRECEDENCE[e.op];
    const side = (child: Expr, isRight: boolean): string => {
      const text = plain(child);
      if (child.kind === 'num') return wrap(child, text);
      const cp = PRECEDENCE[child.op];
      const needs = child.group || cp < p || (isRight && cp === p && (e.op === '-' || e.op === '/'));
      return wrap(child, needs ? `(${text})` : text);
    };
    return `${side(e.left, false)}${DISPLAY_OP[e.op]}${side(e.right, true)}`;
  };
  return wrap(e, plain(e));
}

const PARSE_OP: Record<string, Op> = { '+': '+', '−': '-', '-': '-', '×': '*', '*': '*', '÷': '/', '/': '/' };

/**
 * Read display text like "2+(24÷2)×5" back into an expression (ASCII + - * / work
 * too). Parenthesized parts are marked `group`, so format() gives the same text
 * back. Used for hand-written problems such as the test round's.
 */
export function parseExpr(text: string): Expr {
  const tokens = text.replace(/\s+/g, '').match(/\d+|[+\-−×*÷/()]/g) ?? [];
  if (tokens.join('') !== text.replace(/\s+/g, '')) throw new Error(`Unexpected characters in "${text}"`);
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`${why} in "${text}"`);
  };
  const factor = (): Expr => {
    const t = tokens[i++];
    if (t === '(') {
      const inner = sum();
      if (tokens[i++] !== ')') fail('Missing )');
      return group(inner);
    }
    if (t !== undefined && /^\d+$/.test(t)) return num(Number(t));
    return fail(`Unexpected "${t ?? 'end'}"`);
  };
  const chain = (next: () => Expr, ops: Op[]): Expr => {
    let e = next();
    while (i < tokens.length && ops.includes(PARSE_OP[tokens[i]])) {
      const op = PARSE_OP[tokens[i++]];
      e = { kind: 'bin', op, left: e, right: next() };
    }
    return e;
  };
  const product = () => chain(factor, ['*', '/']);
  const sum = () => chain(product, ['+', '-']);
  const e = sum();
  if (i !== tokens.length) fail(`Unexpected "${tokens[i]}"`);
  return e;
}
