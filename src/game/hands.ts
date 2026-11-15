/**
 * Where the player holds the spear and the shield, worked out from the way the
 * player faces. Plain functions, no Phaser, so the aiming rules can be unit-tested.
 */
import { SHIELD, SPEAR } from '../config';

export interface Vec {
  x: number;
  y: number;
}

/** The player's right, a quarter turn clockwise from facing (y points down). */
export const rightOf = (facing: Vec): Vec => ({ x: -facing.y, y: facing.x });

/**
 * Where the spear's shaft starts and its tip, for a player at (x, y) with radius
 * r. The spear points the way the player faces, `sideOffset` px to the right of
 * the player's centre.
 */
export function spearPoints(x: number, y: number, r: number, facing: Vec, sideOffset: number = SPEAR.sideOffset): { base: Vec; tip: Vec } {
  const side = rightOf(facing);
  const hx = x + side.x * sideOffset;
  const hy = y + side.y * sideOffset;
  const reach = r + SPEAR.length;
  const back = r * 0.5;
  return { base: { x: hx - facing.x * back, y: hy - facing.y * back }, tip: { x: hx + facing.x * reach, y: hy + facing.y * reach } };
}

/** Direction (radians) from the player to the middle of the shield: `sideDeg` degrees to the left of facing. */
export function shieldAngle(facing: Vec, sideDeg: number = SHIELD.side): number {
  return Math.atan2(facing.y, facing.x) - (sideDeg * Math.PI) / 180;
}
