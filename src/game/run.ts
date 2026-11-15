/**
 * One run: levels 1, 2, 3, … until the hearts run out. The math follows STAGES
 * (config.ts), a few levels each, starting where the difficulty (PRESETS) says;
 * after the last stage it keeps going with mixed review. The shop opens every
 * GAME.levelsPerShop levels, and each time the number sizes adapt to how those
 * levels went (learning/adapt.ts).
 *
 * Plain state plus functions, no Phaser, so the shop and level rules can be
 * unit-tested. The scenes pass the same RunState object along.
 */
import { ADAPT, GAME, GEAR, HEARTS, MIXED_STAGE, PRESETS, SKIPPED_SIZE, STAGES, type PresetKey, type Stage } from '../config';
import { adaptAtCheckpoint, type CheckpointReport } from '../learning/adapt';
import { generateWave, type Problem, type Skill, type SkillSizes } from '../learning/problems';
import { createRng, type Rng } from '../learning/rng';
import type { Attempt } from './round';

/** A hit, with the level it happened in. */
export interface RunAttempt extends Attempt {
  level: number;
}

/** The one problem tried at the end of a lesson (typed, like the test round). */
export interface LessonTry {
  /** Index into STAGES. */
  stage: number;
  text: string;
  skill: Skill;
  answer: number;
  /** What the player typed; null if they skipped it. */
  given: number | null;
  correct: boolean;
  ms: number;
}

export interface RunState {
  /** Tells this run apart in the event log (set when a real game starts; tests leave it out). */
  id?: string;
  rng: Rng;
  preset: PresetKey;
  /** Levels cleared so far; the level being played (or next) is cleared + 1. */
  cleared: number;
  hp: number;
  gold: number;
  /** All gold earned this run, including what was spent. */
  goldEarned: number;
  /** Upgrade levels: indexes into GEAR.speed and GEAR.shield. */
  speed: number;
  shield: number;
  /** Number size per skill (0 to MAX_DIFFICULTY, fractional). */
  difficulty: SkillSizes;
  /** Weak skills, mixed into every level until they're rated ok again. */
  review: Skill[];
  /** Every hit this run, in order. */
  attempts: RunAttempt[];
  /** Hits not yet used to rate their skill. */
  pending: Attempt[];
  /** Time spent in levels (not the shop). */
  playMs: number;
  /** Stages (indexes into STAGES) whose lesson has been shown this run. */
  lessonsShown: number[];
  /** Answers to the lessons' practice problems. */
  lessonTries: LessonTry[];
}

export const presetOf = (key: PresetKey) => PRESETS.find((p) => p.key === key) ?? PRESETS[0];

export function newRun(seed: number, preset: PresetKey = PRESETS[0].key): RunState {
  const difficulty: SkillSizes = {};
  for (const stage of STAGES.slice(0, presetOf(preset).startStage)) {
    for (const skill of stage.skills) difficulty[skill] = SKIPPED_SIZE;
  }
  return {
    rng: createRng(seed),
    preset,
    cleared: 0,
    hp: HEARTS.start,
    gold: 0,
    goldEarned: 0,
    speed: 0,
    shield: 0,
    difficulty,
    review: [],
    attempts: [],
    pending: [],
    playMs: 0,
    lessonsShown: [],
    lessonTries: [],
  };
}

// ---------------------------------------------------------------- levels

export const currentLevel = (run: RunState): number => run.cleared + 1;

export interface LevelSpec extends Stage {
  /** Problem types from earlier stages, for the mixed-in enemy. */
  mix: Skill[];
}

/** Stages from the run's start: 0 for its first GAME.levelsPerStage levels, and so on. */
const stagesIn = (level: number) => Math.floor((level - 1) / GAME.levelsPerStage);

/** Index into STAGES for a level of this run; STAGES.length means mixed review. */
export function stageIndex(run: RunState, level = currentLevel(run)): number {
  return Math.min(STAGES.length, presetOf(run.preset).startStage + stagesIn(level));
}

export function levelSpec(run: RunState, level = currentLevel(run)): LevelSpec {
  const raw = presetOf(run.preset).startStage + stagesIn(level);
  const i = Math.min(raw, STAGES.length);
  const stage = i < STAGES.length ? STAGES[i] : MIXED_STAGE;
  const withinStage = (level - 1) % GAME.levelsPerStage;
  const pastTheEnd = Math.max(0, raw - STAGES.length);
  const faster = withinStage * GAME.stageSpeedStep + Math.min(GAME.endlessSpeedMax, pastTheEnd * GAME.endlessSpeedStep);
  const earlier = new Set(STAGES.slice(0, i).flatMap((s) => s.skills));
  return {
    ...stage,
    speed: [stage.speed[0] + faster, stage.speed[1] + faster],
    mix: [...earlier].filter((s) => !stage.skills.includes(s)),
  };
}

/**
 * The wave for the current level: mostly the stage's own skills, plus review of
 * weak skills (up to ADAPT.reviewShare of the wave) or, if there's nothing to
 * review, one enemy from an earlier stage.
 */
export function levelProblems(run: RunState): Problem[] {
  const spec = levelSpec(run);
  const review = run.review.filter((s) => !spec.skills.includes(s));
  const reviewCount = review.length ? Math.min(review.length, Math.floor(spec.enemies * ADAPT.reviewShare)) : 0;
  const mixCount = reviewCount === 0 && spec.mix.length ? GAME.mixPerWave : 0;
  const pools: Skill[][] = [];
  for (let i = 0; i < spec.enemies; i++) {
    pools.push(i < reviewCount ? review : i < reviewCount + mixCount ? spec.mix : spec.skills);
  }
  return generateWave(pools, run.rng, run.difficulty);
}

/** Add the current level's hits (cleared or not) to the run. */
export function recordAttempts(run: RunState, attempts: readonly Attempt[], ms: number): void {
  const level = currentLevel(run);
  run.attempts.push(...attempts.map((a) => ({ ...a, level })));
  run.pending.push(...attempts);
  run.playMs += ms;
}

/** Hits from the levels since the last shop (the shop's "how those levels went"). */
export function sinceLastShop(run: RunState): RunAttempt[] {
  const first = Math.floor((run.cleared - 1) / GAME.levelsPerShop) * GAME.levelsPerShop + 1;
  return run.attempts.filter((a) => a.level >= first && a.level <= run.cleared);
}

// ---------------------------------------------------------------- lessons

/** True if the current level starts a stage whose lesson hasn't been shown this run. */
export function lessonDue(run: RunState): boolean {
  const i = stageIndex(run);
  return i < STAGES.length && STAGES[i].lesson !== undefined && !run.lessonsShown.includes(i);
}

/** The current stage's lesson is being shown: don't show it again this run. */
export function markLessonShown(run: RunState): void {
  const i = stageIndex(run);
  if (!run.lessonsShown.includes(i)) run.lessonsShown.push(i);
}

/** True right after a level that ends with the shop. */
export const shopDue = (run: RunState): boolean => run.cleared > 0 && run.cleared % GAME.levelsPerShop === 0;

/** The last level before the next shop (the current level counts). */
export const nextShopLevel = (run: RunState): number => Math.ceil(currentLevel(run) / GAME.levelsPerShop) * GAME.levelsPerShop;

/**
 * Mark the current level cleared. If that makes the shop due, the number sizes
 * adapt to the levels since the last shop and the report comes back; otherwise null.
 */
export function completeLevel(run: RunState): CheckpointReport | null {
  run.cleared += 1;
  if (!shopDue(run)) return null;
  const next = adaptAtCheckpoint(run.difficulty, run.review, run.pending);
  run.difficulty = next.difficulty;
  run.review = next.review;
  run.pending = next.pending;
  return next.report;
}

// ---------------------------------------------------------------- gold and the shop

export type Item = 'speed' | 'shield' | 'heart';
export const ITEMS: readonly Item[] = ['speed', 'shield', 'heart'];

export function earn(run: RunState, gold: number): void {
  run.gold += gold;
  run.goldEarned += gold;
}

/** Price of the next one, or null if it's maxed out. */
export function price(run: RunState, item: Item): number | null {
  switch (item) {
    case 'speed':
      return GEAR.speed[run.speed + 1]?.cost ?? null;
    case 'shield':
      return GEAR.shield[run.shield + 1]?.cost ?? null;
    case 'heart':
      return run.hp < HEARTS.max ? HEARTS.cost : null;
  }
}

export function canBuy(run: RunState, item: Item): boolean {
  const cost = price(run, item);
  return cost !== null && run.gold >= cost;
}

/** Buy one upgrade. Returns false (and changes nothing) if it's maxed or too expensive. */
export function buy(run: RunState, item: Item): boolean {
  const cost = price(run, item);
  if (cost === null || run.gold < cost) return false;
  run.gold -= cost;
  if (item === 'speed') run.speed += 1;
  else if (item === 'shield') run.shield += 1;
  else run.hp += 1;
  return true;
}

export const speedOf = (run: RunState) => GEAR.speed[run.speed];
export const shieldOf = (run: RunState) => GEAR.shield[run.shield];

// ---------------------------------------------------------------- the event log

/** How a run ended. 'quit' also covers a run left unfinished (it can be resumed from the menu). */
export type RunEnd = 'out of hearts' | 'ended at the shop' | 'quit';

/** One hit as saved: the problem's text, not its tree. */
export interface SavedHit {
  level: number;
  skill: Skill;
  text: string;
  answer: number;
  /** The answer the player was looking for; the hit was correct if it equals `answer`. */
  target: number;
  correct: boolean;
  /** Time from the target being announced to the hit. */
  ms: number;
}

/** One run, as saved in the browser (the event log) and in the data download. */
export interface RunRecord {
  /** The run's id. A run that was quit and later resumed keeps it, so it is saved once, not twice. */
  id?: string;
  /** When it ended (ISO 8601). */
  at: string;
  preset: PresetKey;
  ended: RunEnd;
  cleared: number;
  playMs: number;
  goldEarned: number;
  /** Number size per problem type at the end. */
  sizes: SkillSizes;
  hits: SavedHit[];
  lessonTries: LessonTry[];
}

export function runRecord(run: RunState, ended: RunEnd, at: string): RunRecord {
  return {
    ...(run.id ? { id: run.id } : {}),
    at,
    preset: run.preset,
    ended,
    cleared: run.cleared,
    playMs: Math.round(run.playMs),
    goldEarned: run.goldEarned,
    sizes: { ...run.difficulty },
    hits: run.attempts.map((a) => ({
      level: a.level,
      skill: a.problem.skill,
      text: a.problem.text,
      answer: a.problem.answer,
      target: a.target,
      correct: a.correct,
      ms: Math.round(a.responseMs),
    })),
    lessonTries: run.lessonTries.map((t) => ({ ...t })),
  };
}

/** The event log with `record` added. It replaces an earlier record of the same run (quit, then resumed). */
export function withRunRecord(records: readonly RunRecord[], record: RunRecord): RunRecord[] {
  return [...records.filter((r) => record.id === undefined || r.id !== record.id), record];
}

// ---------------------------------------------------------------- resuming a run later

/**
 * A run in progress, as saved in the browser so the menu can offer "Resume".
 * It is saved when a level starts, in the shop, and when the player leaves a
 * level. An unfinished level starts over on resume: the gold from it is not
 * kept, but hearts lost in it are.
 */
export interface SavedRun {
  version: 1;
  /** Everything in RunState except the random number generator. */
  run: Omit<RunState, 'rng'>;
  /** Seeds a new random number generator on resume. */
  seed: number;
  /** The shop's report, if the player was in the shop. */
  shop?: CheckpointReport;
}

export function suspendRun(run: RunState, seed: number, shop?: CheckpointReport): SavedRun {
  const { rng: _rng, ...rest } = run;
  return { version: 1, run: rest, seed, ...(shop ? { shop } : {}) };
}

/** The run and (if it was in the shop) the shop's report from saved data, or null if the data isn't a usable run. */
export function resumeRun(saved: unknown): { run: RunState; shop?: CheckpointReport } | null {
  const s = saved as Partial<SavedRun> | null;
  const r = s?.run;
  if (!s || s.version !== 1 || !r || typeof s.seed !== 'number') return null;
  const whole = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
  const usable =
    PRESETS.some((p) => p.key === r.preset) &&
    whole(r.cleared, 0, Infinity) &&
    whole(r.hp, 1, HEARTS.max) &&
    whole(r.gold, 0, Infinity) &&
    whole(r.goldEarned, 0, Infinity) &&
    whole(r.speed, 0, GEAR.speed.length - 1) &&
    whole(r.shield, 0, GEAR.shield.length - 1) &&
    typeof r.playMs === 'number' &&
    typeof r.difficulty === 'object' &&
    r.difficulty !== null &&
    [r.review, r.attempts, r.pending, r.lessonsShown, r.lessonTries].every(Array.isArray);
  if (!usable) return null;
  return { run: { ...r, rng: createRng(s.seed) }, ...(s.shop ? { shop: s.shop } : {}) };
}
