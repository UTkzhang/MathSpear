import { describe, expect, it } from 'vitest';
import { ENEMY, GEAR, PLAYER, SHIELD, SPEAR } from '../src/config';
import { shieldAngle, spearPoints } from '../src/game/hands';
import { circlesOverlap, withinArc } from '../src/game/physics';

type Outcome = 'spear' | 'shield' | 'heart lost' | 'missed';

const START_SHIELD = GEAR.shield[0].arcDeg;
/** Enemy sizes in the game: the smallest, and a long multi-step problem. */
const ENEMY_SIZES = [ENEMY.minRadius, 36, 48];

/**
 * Run in a straight line (facing right) past a still enemy that is `left` px to
 * the left of the line (negative: to the right), checking the spear and then the
 * shield and body each step, in the game's order. What happens first?
 */
function runAt(left: number, enemyR: number, shieldDeg = START_SHIELD): Outcome {
  const facing = { x: 1, y: 0 };
  const [ex, ey] = [300, -left]; // y points down, so the player's left is up
  for (let px = 0; px < 600; px += 0.5) {
    const { tip } = spearPoints(px, 0, PLAYER.radius, facing);
    if (circlesOverlap(tip.x, tip.y, SPEAR.tipRadius, ex, ey, enemyR)) return 'spear';
    if (!circlesOverlap(px, 0, PLAYER.radius + SHIELD.gap, ex, ey, enemyR)) continue;
    const a = shieldAngle(facing);
    if (withinArc(px, 0, Math.cos(a), Math.sin(a), (shieldDeg * Math.PI) / 180, ex, ey)) return 'shield';
    if (circlesOverlap(px, 0, PLAYER.radius, ex, ey, enemyR)) return 'heart lost';
  }
  return 'missed';
}

describe('spear and shield', () => {
  it('holds the spear on the right, pointing the way the player faces', () => {
    const reach = PLAYER.radius + SPEAR.length;
    expect(spearPoints(100, 100, PLAYER.radius, { x: 1, y: 0 }).tip).toEqual({ x: 100 + reach, y: 100 + SPEAR.sideOffset });
    const up = spearPoints(100, 100, PLAYER.radius, { x: 0, y: -1 }).tip;
    expect(up.x).toBeCloseTo(100 + SPEAR.sideOffset);
    expect(up.y).toBeCloseTo(100 - reach);
  });

  it('holds the shield front-left, on the other side from the spear', () => {
    // Facing right (y points down): the shield's middle is up and to the right.
    const a = shieldAngle({ x: 1, y: 0 });
    expect(Math.cos(a)).toBeGreaterThan(0);
    expect(Math.sin(a)).toBeLessThan(0);
  });

  it('hits an enemy that is dead ahead or a little off line', () => {
    for (const r of ENEMY_SIZES) for (const left of [-20, -10, 0, 10, 20]) expect(runAt(left, r), `${left} px left, r=${r}`).toBe('spear');
  });

  it("never costs a heart when the spear just misses on the shield's side, even with the starting shield", () => {
    for (const r of ENEMY_SIZES) {
      const outcomes = new Set<Outcome>();
      for (let left = 0; left <= r + PLAYER.radius + 10; left += 0.5) {
        const o = runAt(left, r);
        expect(o, `${left} px left, r=${r}`).not.toBe('heart lost');
        outcomes.add(o);
      }
      // Dead ahead is a hit, a bit further out is the shield, and past that there is no contact at all.
      expect([...outcomes].sort()).toEqual(['missed', 'shield', 'spear']);
    }
  });

  it('leaves only a thin strip on the spear side where a near miss costs a heart', () => {
    for (const r of ENEMY_SIZES) {
      const lost = [];
      for (let right = 0; right <= r + PLAYER.radius + 10; right += 0.5) if (runAt(-right, r) === 'heart lost') lost.push(right);
      expect(lost.length * 0.5, `r=${r}`).toBeLessThanOrEqual(4);
      // …and it is right at the edge: the enemy is almost a full body-width off line.
      expect(Math.min(...lost), `r=${r}`).toBeGreaterThan(r + PLAYER.radius - 5);
    }
  });
});
