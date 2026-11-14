/**
 * Gold from correct hits (see GOLD in config.ts), and the end-of-run numbers.
 * Gold is spent in the shop; wrong hits cost nothing but time. Pure logic, no Phaser.
 */
import { GOLD } from '../config';
import { opCount } from '../learning/expr';
import type { Problem } from '../learning/problems';
import type { Attempt } from './round';

/** Gold for one correct hit, given the problem and how long the target had been showing. */
export function hitGold(problem: Problem, responseMs: number): number {
  const sec = responseMs / 1000;
  const span = GOLD.zeroBonusSec - GOLD.fullBonusSec;
  const fraction = Math.min(1, Math.max(0, (GOLD.zeroBonusSec - sec) / span));
  return GOLD.perOp * opCount(problem.expr) + Math.round(GOLD.speedBonusMax * fraction);
}

export interface RunSummary {
  correct: number;
  wrong: number;
  /** 0–1; null when there were no hits at all. */
  accuracy: number | null;
  /** Average time from a target appearing to hitting it, correct hits only. Null if none. */
  avgResponseMs: number | null;
}

export function summarize(attempts: readonly Attempt[]): RunSummary {
  const hits = attempts.filter((a) => a.correct);
  const correct = hits.length;
  return {
    correct,
    wrong: attempts.length - correct,
    accuracy: attempts.length ? correct / attempts.length : null,
    avgResponseMs: correct ? hits.reduce((sum, a) => sum + a.responseMs, 0) / correct : null,
  };
}
