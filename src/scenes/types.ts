import { PRESETS, type PresetKey } from '../config';
import { runRecord, type RunEnd, type RunRecord, type RunState } from '../game/run';
import type { CheckpointReport } from '../learning/adapt';
import type { BandResult } from '../learning/placement';
import type { TestRecord } from '../learning/testRound';

export type Mode = 'play' | 'tutorial';

export interface GameData {
  mode: Mode;
  /** The run to continue (next level, or back from the shop). A new run starts if missing. */
  run?: RunState;
  /** Difficulty for a new run (default: Starter). */
  preset?: PresetKey;
  /** Fixed seed for a reproducible new run (demo links). */
  seed?: number;
}

/** The lesson before a stage's first level; the game goes on with the same run after it. */
export interface LessonData {
  run: RunState;
}

export interface ShopData {
  run: RunState;
  /** How the number sizes moved for the levels since the last shop. */
  report: CheckpointReport;
}

/** The difficulty screen, optionally right after the quick check or a test round. */
export interface SetupData {
  check?: { results: BandResult[]; recommended: PresetKey; from: 'Quick check' | 'Test round' };
}

/** A test round: before the first game, or after one. */
export interface TestData {
  kind: 'before' | 'after';
}

export interface TestResultData {
  kind: TestData['kind'];
  record: TestRecord;
}

export type ResultData =
  | { mode: 'tutorial' }
  | {
      mode: 'play';
      run: RunState;
      /** True if the hearts ran out; false if the player ended the run from the shop. */
      outOfHearts: boolean;
    };

/** "1 level", "3 levels". */
export const levelsText = (n: number): string => `${n} ${n === 1 ? 'level' : 'levels'}`;

// ---------------------------------------------------------------- saved in this browser only (no accounts, no server)

export const STORAGE_KEYS = {
  /** Most levels cleared in one run, per difficulty. */
  best: (preset: PresetKey) => `mathspear.best.${preset}`,
  /** The difficulty picked last time. */
  preset: 'mathspear.difficulty',
  /** The latest recommendation (quick check or test round). */
  recommended: 'mathspear.recommended',
  /** Every finished test round, oldest first (TestRecord[] as JSON). */
  tests: 'mathspear.tests',
  /** Total time spent playing runs, in ms (for "minutes of play" between tests). */
  playMs: 'mathspear.playMs',
  /** Minutes of play when the player last turned down a test round. */
  testDeclinedAt: 'mathspear.testDeclinedAt',
  /** The event log: every run, with every hit and lesson answer (RunRecord[] as JSON). */
  runs: 'mathspear.runs',
  /** Names of the stages whose lesson the player has seen (string[] as JSON). */
  lessonsSeen: 'mathspear.lessonsSeen',
};
const PREFIX = 'mathspear.';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked (e.g. some private modes)
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore: the game works without storage
  }
}

const asPreset = (value: string | null): PresetKey | null => PRESETS.find((p) => p.key === value)?.key ?? null;

export const loadBest = (preset: PresetKey): number => Number(read(STORAGE_KEYS.best(preset))) || 0;
export const saveBest = (preset: PresetKey, levels: number): void => write(STORAGE_KEYS.best(preset), String(levels));
export const loadPreset = (): PresetKey | null => asPreset(read(STORAGE_KEYS.preset));
export const savePreset = (preset: PresetKey): void => write(STORAGE_KEYS.preset, preset);
export const loadRecommended = (): PresetKey | null => asPreset(read(STORAGE_KEYS.recommended));
export const saveRecommended = (preset: PresetKey): void => write(STORAGE_KEYS.recommended, preset);

function readList<T>(key: string): T[] {
  try {
    const parsed: unknown = JSON.parse(read(key) ?? '[]');
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export const loadTests = (): TestRecord[] => readList<TestRecord>(STORAGE_KEYS.tests);
export const saveTest = (record: TestRecord): void => write(STORAGE_KEYS.tests, JSON.stringify([...loadTests(), record]));

export const loadPlayMinutes = (): number => (Number(read(STORAGE_KEYS.playMs)) || 0) / 60_000;
export function addPlayMs(ms: number): void {
  if (ms > 0) write(STORAGE_KEYS.playMs, String(Math.round(loadPlayMinutes() * 60_000 + ms)));
}

export function loadTestDeclinedAt(): number | null {
  const v = read(STORAGE_KEYS.testDeclinedAt);
  return v === null || !Number.isFinite(Number(v)) ? null : Number(v);
}
export const declineTest = (): void => write(STORAGE_KEYS.testDeclinedAt, String(loadPlayMinutes()));

export const loadRuns = (): RunRecord[] => readList<RunRecord>(STORAGE_KEYS.runs);
/** Add a finished (or quit) run to the event log. Runs with no hits at all are left out. */
export function saveRun(run: RunState, ended: RunEnd): void {
  if (!run.attempts.length && !run.lessonTries.length) return;
  write(STORAGE_KEYS.runs, JSON.stringify([...loadRuns(), runRecord(run, ended, new Date().toISOString())]));
}

export const loadLessonsSeen = (): string[] => readList<string>(STORAGE_KEYS.lessonsSeen);
export function markLessonSeen(stageName: string): void {
  const seen = loadLessonsSeen();
  if (!seen.includes(stageName)) write(STORAGE_KEYS.lessonsSeen, JSON.stringify([...seen, stageName]));
}

/** Everything saved in this browser, as one object (the "Download my data" file). */
export function exportData() {
  return {
    app: 'Math Spear',
    format: 1,
    exportedAt: new Date().toISOString(),
    playMinutes: Math.round(loadPlayMinutes() * 10) / 10,
    tests: loadTests(),
    runs: loadRuns(),
    testDeclinedAt: loadTestDeclinedAt(),
    recommended: loadRecommended(),
    lastDifficulty: loadPreset(),
    best: Object.fromEntries(PRESETS.map((p) => [p.key, loadBest(p.key)])),
    lessonsSeen: loadLessonsSeen(),
  };
}

/** Delete everything Math Spear saved in this browser. */
export function resetData(): void {
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i));
    for (const key of keys) if (key?.startsWith(PREFIX)) window.localStorage.removeItem(key);
  } catch {
    // storage blocked: nothing to delete
  }
}
