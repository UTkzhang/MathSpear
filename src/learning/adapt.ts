/**
 * Adaptivity, at every shop (every GAME.levelsPerShop levels). Each problem type
 * (skill) with at least ADAPT.minAttempts hits since it was last rated is rated
 * from those hits, using the thresholds in ADAPT (config.ts):
 *
 *   strong  accurate and fast  → its numbers get bigger (ADAPT.step.strong)
 *   ok                         → a little bigger (ADAPT.step.ok: every other shop)
 *   weak    missed or slow     → a little smaller (ADAPT.step.weak), and it comes
 *                                back for review until it's rated ok or strong
 *
 * Skills with fewer hits wait until they have enough, so one unlucky miss
 * doesn't decide anything. Small steps, often, so there's never a big jump.
 *
 * A wrong hit counts against the problem on the enemy that was hit: the player
 * thought that problem equalled the target, so that's the one they got wrong.
 * Pure TypeScript, no Phaser.
 */
import { ADAPT } from '../config';
import type { Attempt } from '../game/round';
import { opCount } from './expr';
import { MAX_DIFFICULTY, SKILLS, type Skill, type SkillSizes } from './problems';

export type Rating = 'strong' | 'ok' | 'weak';

export interface SkillResult {
  skill: Skill;
  attempts: number;
  correct: number;
  accuracy: number;
  /** Average time to find a correct target; null if none were correct. */
  avgMs: number | null;
  rating: Rating;
  /** Number size before and after (fractional; problems use the whole part). */
  from: number;
  to: number;
}

export interface CheckpointReport {
  /** The skills rated this time, simplest first. */
  results: SkillResult[];
  /** Weak skills, mixed into the next levels. */
  review: Skill[];
}

export interface Checkpoint {
  difficulty: SkillSizes;
  review: Skill[];
  /** Hits for skills that didn't have enough yet; they carry over to the next shop. */
  pending: Attempt[];
  report: CheckpointReport;
}

/** Rate one skill from its accuracy and average time (for a problem with `ops` operations). */
export function rate(accuracy: number, avgMs: number | null, ops: number): Rating {
  const extra = ADAPT.extraSecPerOp * Math.max(0, ops - 1);
  if (accuracy < ADAPT.weakAccuracy || avgMs === null || avgMs > (ADAPT.slowSec + extra) * 1000) return 'weak';
  if (accuracy >= ADAPT.strongAccuracy && avgMs <= (ADAPT.fastSec + extra) * 1000) return 'strong';
  return 'ok';
}

/** Rate every skill that has enough pending hits, and move its number size. */
export function adaptAtCheckpoint(difficulty: SkillSizes, review: readonly Skill[], pending: readonly Attempt[]): Checkpoint {
  const next: SkillSizes = { ...difficulty };
  const results: SkillResult[] = [];

  for (const skill of SKILLS) {
    const mine = pending.filter((a) => a.problem.skill === skill);
    if (mine.length < ADAPT.minAttempts) continue;
    const from = difficulty[skill] ?? 0;
    const hits = mine.filter((a) => a.correct);
    const accuracy = hits.length / mine.length;
    const avgMs = hits.length ? hits.reduce((sum, a) => sum + a.responseMs, 0) / hits.length : null;
    const ops = mine.reduce((sum, a) => sum + opCount(a.problem.expr), 0) / mine.length;
    const rating = rate(accuracy, avgMs, ops);
    const to = Math.min(MAX_DIFFICULTY, Math.max(0, from + ADAPT.step[rating]));
    next[skill] = to;
    results.push({ skill, attempts: mine.length, correct: hits.length, accuracy, avgMs, rating, from, to });
  }

  const rated = new Set(results.map((r) => r.skill));
  const weak = new Set(results.filter((r) => r.rating === 'weak').map((r) => r.skill));
  // Still weak, or not rated again yet: stays in review.
  const nextReview = SKILLS.filter((s) => weak.has(s) || (review.includes(s) && !rated.has(s)));
  return {
    difficulty: next,
    review: nextReview,
    pending: pending.filter((a) => !rated.has(a.problem.skill)),
    report: { results, review: nextReview },
  };
}

/** Skills whose problems will look different after this checkpoint (the whole-number size changed). */
export function sizeChanges(report: CheckpointReport): { bigger: Skill[]; smaller: Skill[] } {
  const changed = (r: SkillResult) => Math.floor(r.to) - Math.floor(r.from);
  return {
    bigger: report.results.filter((r) => changed(r) > 0).map((r) => r.skill),
    smaller: report.results.filter((r) => changed(r) < 0).map((r) => r.skill),
  };
}

export interface SkillRow {
  skill: Skill;
  attempts: number;
  correct: number;
  /** Average time to find a correct target; null if none were correct. */
  avgMs: number | null;
  /** Same rule as the shop; null with fewer than ADAPT.minAttempts hits (too few to tell). */
  rating: Rating | null;
}

/** Accuracy and speed per problem type, for the end-of-run report. Problem types with no hits are left out. */
export function skillReport(attempts: readonly Attempt[]): SkillRow[] {
  return SKILLS.flatMap((skill) => {
    const mine = attempts.filter((a) => a.problem.skill === skill);
    if (!mine.length) return [];
    const hits = mine.filter((a) => a.correct);
    const avgMs = hits.length ? hits.reduce((sum, a) => sum + a.responseMs, 0) / hits.length : null;
    const ops = mine.reduce((sum, a) => sum + opCount(a.problem.expr), 0) / mine.length;
    const rating = mine.length >= ADAPT.minAttempts ? rate(hits.length / mine.length, avgMs, ops) : null;
    return [{ skill, attempts: mine.length, correct: hits.length, avgMs, rating }];
  });
}
