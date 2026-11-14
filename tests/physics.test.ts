import { describe, expect, it } from 'vitest';
import { pushOut, withinArc } from '../src/game/physics';

const deg = (d: number) => (d * Math.PI) / 180;

describe('withinArc', () => {
  // Player at the origin facing right, so the shield faces left (-1, 0).
  const back = (px: number, py: number, arc = 140) => withinArc(0, 0, -1, 0, deg(arc), px, py);

  it('covers the point straight behind', () => {
    expect(back(-30, 0)).toBe(true);
  });

  it('does not cover the front', () => {
    expect(back(30, 0)).toBe(false);
    expect(back(30, 10)).toBe(false);
  });

  it('covers up to half the arc on each side of straight behind', () => {
    const at = (a: number) => [Math.cos(deg(180 + a)) * 30, Math.sin(deg(180 + a)) * 30] as const;
    expect(back(...at(69))).toBe(true);
    expect(back(...at(-69))).toBe(true);
    expect(back(...at(71))).toBe(false);
    expect(back(...at(-71))).toBe(false);
  });

  it('treats a 180° arc as the whole back half', () => {
    expect(back(-1, 30, 180)).toBe(true);
    expect(back(1, 30, 180)).toBe(false);
  });
});

describe('pushOut', () => {
  it('moves an overlapping body out to the given distance, along the same line', () => {
    const b = { x: 3, y: 4, vx: 0, vy: 0, r: 10 };
    pushOut(b, 0, 0, 10);
    expect(b.x).toBeCloseTo(6);
    expect(b.y).toBeCloseTo(8);
  });

  it('leaves a body that is already far enough alone', () => {
    const b = { x: 30, y: 0, vx: 0, vy: 0, r: 10 };
    pushOut(b, 0, 0, 10);
    expect(b).toMatchObject({ x: 30, y: 0 });
  });
});
