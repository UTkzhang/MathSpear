/**
 * The quick check: a few typed-answer problems that recommend a difficulty
 * (CHECK and PRESETS in config.ts). It goes band by band, easiest first, and
 * stops at the first band that doesn't pass, so a beginner sees only a couple
 * of problems and nobody sees more than CHECK.perBand × the number of bands.
 * Pure TypeScript, no Phaser.
 */
import { CHECK, type CheckBand } from '../config';
import { generateProblem, tierOfSkill, type Problem } from './problems';
import type { Rng } from './rng';

export interface BandResult {
  name: string;
  asked: number;
  correct: number;
  /** Average time per correct answer; null if none were correct. */
  avgMs: number | null;
  passed: boolean;
}

/**
 * A band passes with at least CHECK.passCorrect of every CHECK.perBand right
 * (2 of 3, 3 of 4), and an average time per correct answer within its limit.
 * The quick check and the test round both use this.
 */
export function bandPassed(band: CheckBand, asked: number, correct: number, avgMs: number | null): boolean {
  return asked > 0 && correct * CHECK.perBand >= CHECK.passCorrect * asked && avgMs !== null && avgMs <= band.maxAvgSec * 1000;
}

/** Average of `ms` over the correct answers; null if none. */
export function avgCorrectMs(answers: readonly { correct: boolean; ms: number }[]): number | null {
  const right = answers.filter((a) => a.correct);
  return right.length ? right.reduce((sum, a) => sum + a.ms, 0) / right.length : null;
}

export interface CheckAnswer {
  problem: Problem;
  value: number;
  correct: boolean;
  ms: number;
}

export class QuickCheck {
  readonly results: BandResult[] = [];
  readonly answers: CheckAnswer[] = [];
  /** The problem to answer now; null when the check is over. */
  current: Problem | null;
  private band = 0;
  private inBand: CheckAnswer[] = [];
  /** Where in the band's skill list this band started. */
  private skillStart = 0;

  constructor(private readonly rng: Rng) {
    this.current = this.make();
  }

  get done(): boolean {
    return this.current === null;
  }

  /** Index into PRESETS: how many bands passed in a row. */
  get recommended(): number {
    return this.results.filter((r) => r.passed).length;
  }

  /** Answer the current problem. Returns whether it was right. */
  answer(value: number, ms: number): boolean {
    const problem = this.current;
    if (!problem) return false;
    const correct = value === problem.answer;
    const a: CheckAnswer = { problem, value, correct, ms };
    this.answers.push(a);
    this.inBand.push(a);

    const right = this.inBand.filter((x) => x.correct);
    const cannotPass = this.inBand.length - right.length > CHECK.perBand - CHECK.passCorrect;
    if (this.inBand.length >= CHECK.perBand || cannotPass) {
      const spec = CHECK.bands[this.band];
      const avgMs = avgCorrectMs(this.inBand);
      const passed = bandPassed(spec, this.inBand.length, right.length, avgMs);
      this.results.push({ name: spec.name, asked: this.inBand.length, correct: right.length, avgMs, passed });
      this.band += 1;
      this.inBand = [];
      if (!passed || this.band >= CHECK.bands.length) {
        this.current = null;
        return correct;
      }
    }
    this.current = this.make(problem);
    return correct;
  }

  /** A problem from the current band, cycling through its skills, never the same answer twice in a row. */
  private make(previous?: Problem): Problem {
    const skills = CHECK.bands[this.band].skills;
    if (this.inBand.length === 0) this.skillStart = this.rng.int(0, skills.length - 1);
    const skill = skills[(this.skillStart + this.inBand.length) % skills.length];
    for (let i = 0; ; i++) {
      const p = generateProblem(tierOfSkill(skill), this.rng, skill, 0);
      if (!previous || p.answer !== previous.answer || i > 20) return p;
    }
  }
}
