/**
 * The test round: the before/after measure (TEST in config.ts). The same
 * typed-answer problems in the same order every time, alternating between two
 * matching forms. Nothing adapts and it never stops early, so one test's score
 * can be compared with the next. Pure TypeScript, no Phaser.
 */
import { CHECK, TEST, type PresetKey, PRESETS } from '../config';
import { parseExpr } from './expr';
import { avgCorrectMs, bandPassed, type BandResult } from './placement';
import { problemFromExpr, tierOfSkill, type Problem, type Skill } from './problems';

export type Form = 'A' | 'B';

export interface TestItem {
  /** Index into TEST.sections. */
  section: number;
  problem: Problem;
}

/** One answered (or skipped) problem, as saved. */
export interface TestAnswer {
  text: string;
  skill: Skill;
  section: number;
  answer: number;
  /** What the player typed; null if they skipped it. */
  given: number | null;
  correct: boolean;
  /** From the problem appearing to the answer (typing included). */
  ms: number;
}

/** One finished test, as saved in the browser. */
export interface TestRecord {
  form: Form;
  /** When it was finished (ISO 8601). */
  at: string;
  /** Minutes of play (all runs, this browser) before this test. 0 = a true "before" test. */
  playMinutes: number;
  answers: TestAnswer[];
}

/** The problems of one form, in order. */
export function testItems(form: Form): TestItem[] {
  return TEST.sections.flatMap((s, section) =>
    s.slots.map((slot) => ({
      section,
      problem: problemFromExpr(parseExpr(form === 'A' ? slot.a : slot.b), slot.skill, tierOfSkill(slot.skill)),
    })),
  );
}

export const TEST_LENGTH = TEST.sections.reduce((n, s) => n + s.slots.length, 0);

/** A first, then the other form from last time. */
export function nextForm(records: readonly TestRecord[]): Form {
  return records.length && records[records.length - 1].form === 'A' ? 'B' : 'A';
}

export class TestRound {
  readonly items: TestItem[];
  readonly answers: TestAnswer[] = [];

  constructor(readonly form: Form) {
    this.items = testItems(form);
  }

  get done(): boolean {
    return this.answers.length >= this.items.length;
  }

  /** The problem to answer now; null when the test is over. */
  get current(): Problem | null {
    return this.items[this.answers.length]?.problem ?? null;
  }

  /** Answer the current problem, or skip it with null. */
  answer(given: number | null, ms: number): void {
    const item = this.items[this.answers.length];
    if (!item) return;
    const { problem } = item;
    this.answers.push({
      text: problem.text,
      skill: problem.skill,
      section: item.section,
      answer: problem.answer,
      given,
      correct: given === problem.answer,
      ms: Math.round(ms),
    });
  }

  record(playMinutes: number, at = new Date()): TestRecord {
    return { form: this.form, at: at.toISOString(), playMinutes: Math.round(playMinutes * 10) / 10, answers: [...this.answers] };
  }
}

export interface Score {
  asked: number;
  correct: number;
  /** Average time per correct answer; null if none were correct. */
  avgMs: number | null;
}

const scoreOf = (answers: readonly TestAnswer[]): Score => ({
  asked: answers.length,
  correct: answers.filter((a) => a.correct).length,
  avgMs: avgCorrectMs(answers),
});

export interface TestScore extends Score {
  /** One per TEST.sections entry. */
  sections: (Score & { name: string })[];
}

export function scoreTest(record: TestRecord): TestScore {
  return {
    ...scoreOf(record.answers),
    sections: TEST.sections.map((s, i) => ({ name: s.name, ...scoreOf(record.answers.filter((a) => a.section === i)) })),
  };
}

/**
 * The difficulty the test points to, by the quick check's rule: sections that
 * match CHECK.bands pass or fail the same way, and the recommendation is how
 * many pass in a row from the first.
 */
export function testRecommendation(score: TestScore): { results: BandResult[]; recommended: PresetKey } {
  const results = CHECK.bands.map((band, i) => {
    const s = score.sections[i];
    return { name: band.name, asked: s.asked, correct: s.correct, avgMs: s.avgMs, passed: bandPassed(band, s.asked, s.correct, s.avgMs) };
  });
  const inARow = results.findIndex((r) => !r.passed);
  return { results, recommended: PRESETS[inARow === -1 ? results.length : inARow].key };
}

/** Before the first game: nothing played, no test yet, and not turned down. */
export function beforeTestDue(records: readonly TestRecord[], playMinutes: number, declinedAt: number | null): boolean {
  return records.length === 0 && playMinutes === 0 && declinedAt === null;
}

/**
 * At the end of a game: TEST.minutesBetween minutes of play since the last
 * test, or since the player last said "not now". Straight away if neither.
 */
export function afterTestDue(records: readonly TestRecord[], playMinutes: number, declinedAt: number | null): boolean {
  if (playMinutes <= 0) return false;
  const since = [records[records.length - 1]?.playMinutes, declinedAt].filter((x): x is number => x != null);
  if (!since.length) return true;
  return playMinutes - Math.max(...since) >= TEST.minutesBetween;
}
