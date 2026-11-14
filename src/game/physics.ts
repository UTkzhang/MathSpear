/** Minimal circle physics: everything in the arena is a circle. */

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/** Move a body and bounce it off the arena walls. */
export function stepBouncing(b: Body, dtSec: number, bounds: Bounds): void {
  b.x += b.vx * dtSec;
  b.y += b.vy * dtSec;
  if (b.x - b.r < bounds.left) {
    b.x = bounds.left + b.r;
    b.vx = Math.abs(b.vx);
  } else if (b.x + b.r > bounds.right) {
    b.x = bounds.right - b.r;
    b.vx = -Math.abs(b.vx);
  }
  if (b.y - b.r < bounds.top) {
    b.y = bounds.top + b.r;
    b.vy = Math.abs(b.vy);
  } else if (b.y + b.r > bounds.bottom) {
    b.y = bounds.bottom - b.r;
    b.vy = -Math.abs(b.vy);
  }
}

/** Keep a point-sized-or-larger body inside the bounds without bouncing. */
export function clampInside(b: { x: number; y: number; r: number }, bounds: Bounds): void {
  b.x = Math.min(Math.max(b.x, bounds.left + b.r), bounds.right - b.r);
  b.y = Math.min(Math.max(b.y, bounds.top + b.r), bounds.bottom - b.r);
}

/** Equal-mass elastic collision between two overlapping circles. */
export function resolveCollision(a: Body, b: Body): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const overlap = a.r + b.r - dist;
  if (overlap <= 0) return;
  const nx = dx / dist;
  const ny = dy / dist;
  // Push apart so they no longer overlap.
  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;
  // Swap the velocity components along the normal, if they are approaching.
  const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (approach <= 0) return;
  a.vx -= approach * nx;
  a.vy -= approach * ny;
  b.vx += approach * nx;
  b.vy += approach * ny;
}

/** Turn a body's heading toward a point by at most maxTurn radians, keeping its speed. */
export function steerToward(b: Body, tx: number, ty: number, maxTurn: number): void {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed === 0 || maxTurn <= 0) return;
  const heading = Math.atan2(b.vy, b.vx);
  const wanted = Math.atan2(ty - b.y, tx - b.x);
  const diff = Math.atan2(Math.sin(wanted - heading), Math.cos(wanted - heading));
  const turned = heading + Math.max(-maxTurn, Math.min(maxTurn, diff));
  b.vx = Math.cos(turned) * speed;
  b.vy = Math.sin(turned) * speed;
}

/** Send a body away from a point at its current speed (or at least minSpeed). */
export function knockAway(b: Body, fromX: number, fromY: number, minSpeed: number): void {
  const dx = b.x - fromX;
  const dy = b.y - fromY;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = Math.max(Math.hypot(b.vx, b.vy), minSpeed);
  b.vx = (dx / dist) * speed;
  b.vy = (dy / dist) * speed;
}

/**
 * True if the point (px, py), seen from (cx, cy), lies within an arc `arcRad`
 * wide (in total) centred on the direction (dirX, dirY). The player's back
 * shield uses this to decide which bumps it blocks.
 */
export function withinArc(cx: number, cy: number, dirX: number, dirY: number, arcRad: number, px: number, py: number): boolean {
  const toPoint = Math.atan2(py - cy, px - cx);
  const centre = Math.atan2(dirY, dirX);
  const diff = Math.abs(Math.atan2(Math.sin(toPoint - centre), Math.cos(toPoint - centre)));
  return diff <= arcRad / 2;
}

/** Move a body straight away from a point until its centre is `dist` away. */
export function pushOut(b: Body, fromX: number, fromY: number, dist: number): void {
  const dx = b.x - fromX;
  const dy = b.y - fromY;
  const len = Math.hypot(dx, dy);
  if (len >= dist) return;
  const [nx, ny] = len === 0 ? [1, 0] : [dx / len, dy / len];
  b.x = fromX + nx * dist;
  b.y = fromY + ny * dist;
}
