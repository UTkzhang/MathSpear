/** Tunable game values. All are starting points for playtesting. */
import type { Skill } from './learning/problems';

export const WIDTH = 960;
export const HEIGHT = 640;
export const HUD_HEIGHT = 56; // top strip for the target and stats; the arena is below it

/**
 * The game logic always works in WIDTH×HEIGHT units, but the canvas is drawn at
 * the screen's real pixel size (camera zoom = RENDER_SCALE) so it stays sharp on
 * large and high-DPI screens instead of being stretched by the browser.
 */
export const RENDER_SCALE = (() => {
  if (typeof window === 'undefined') return 1;
  const fit = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
  const scale = fit * (window.devicePixelRatio || 1);
  return Math.min(3, Math.max(1, Math.ceil(scale * 4) / 4));
})();

export const PLAYER = {
  radius: 14,
  invulnerableMs: 1500, // after losing a heart
};

/** You start with `start` hearts and can buy more in the shop, up to `max`. */
export const HEARTS = {
  start: 1,
  max: 3,
  cost: 150, // gold per heart (also how you buy back a lost one)
};

/**
 * Gear bought in the shop. Entry 0 is what every run starts with; each later
 * entry is one upgrade, bought in order for `cost` gold. The steps are small on
 * purpose: gear should help a little, the math should stay the challenge.
 */
export const GEAR = {
  /** Movement speed in px/s (enemies move at 50–130). */
  speed: [
    { speed: 200, cost: 0 },
    { speed: 215, cost: 150 },
    { speed: 230, cost: 300 },
    { speed: 245, cost: 500 },
    { speed: 260, cost: 750 },
  ],
  /** `arcDeg`: how much of the player's left side the shield covers. */
  shield: [
    { arcDeg: 60, cost: 0 },
    { arcDeg: 75, cost: 150 },
    { arcDeg: 90, cost: 300 },
    { arcDeg: 105, cost: 500 },
    { arcDeg: 120, cost: 750 },
  ],
};

/**
 * The spear is held in the right hand and points the way you move. Its size is
 * fixed: a longer spear also runs into more wrong enemies, so the shop sells
 * speed instead.
 */
export const SPEAR = {
  length: 20, // px past the player's edge
  tipRadius: 4, // the part that hits
  sideOffset: 8, // px to the right of the player's centre
  /**
   * Penalty after a wrong hit: for this long the spear can't hit anything, and the
   * player blinks and can't be hurt (so a wrong hit never costs a heart by itself).
   */
  lockMs: 5000,
};

/**
 * Shield in the left hand, on the other side from the spear. Enemies that bump
 * into it bounce off without costing a heart. Its width comes from GEAR.shield.
 */
export const SHIELD = {
  side: 90, // degrees from straight ahead to the middle of the shield, toward the left
  gap: 5, // px between the player's edge and the shield
  thickness: 5, // px
  flashMs: 200, // the shield lights up after a block
};

export const ENEMY = {
  minRadius: 28,
  textPadding: 10, // px between the problem text and the circle edge
  /**
   * Problem text size. Short problems (7+5) use `fontSize`; a wave with longer
   * problems ((5+9)×3−8) shrinks toward `minFontSize`, so big enemies don't get too big.
   * Every enemy in a wave shares one size.
   */
  fontSize: 18,
  minFontSize: 15,
  hitCooldownMs: 500, // one collision can't count twice
  wrongAnswerShowMs: 1500,
};

export interface Stage {
  /** Shown under "Level N" before the wave comes in. */
  name: string;
  /** Main problem types (see learning/problems.ts). Each enemy gets one at random. */
  skills: Skill[];
  enemies: number;
  /** Enemy speed range in px/s for the stage's first level (the player moves at 200–260). */
  speed: [number, number];
  /** How fast enemies turn toward the player, rad/s; 0 = pure bouncing. */
  chase: number;
  /** The short lesson before the stage's first level (LessonScene). */
  lesson?: Lesson;
}

/**
 * A lesson: one strategy, shown on a worked example one step at a time, then one
 * problem to try. The steps come from learning/explain.ts, the same steps the
 * hint after a wrong hit uses.
 */
export interface Lesson {
  /** The strategy, in a sentence or two. */
  idea: string;
  /** Worked examples (one or two), as display text. */
  examples: string[];
  /** A common mistake to watch for. */
  note?: string;
}

/**
 * The math, simplest to hardest. Each stage lasts GAME.levelsPerStage levels,
 * and every wave also has one enemy with a problem type from an earlier stage,
 * so a new stage never throws away what came before. After the last stage the
 * run keeps going with MIXED_STAGE. Where a run starts depends on the
 * difficulty (PRESETS).
 *
 * Number sizes grow separately, per problem type, at every shop (see ADAPT).
 * Enemies speed up a little each level within a stage. On the multi-step
 * stages they slow back down, so the challenge there is the math, not dodging.
 */
export const STAGES: Stage[] = [
  {
    name: 'Adding',
    skills: ['add-facts'],
    enemies: 4,
    speed: [50, 75],
    chase: 0.1,
    lesson: { idea: 'Make a ten: move part of the smaller number over to fill the bigger one up to 10.', examples: ['8+5'] },
  },
  {
    name: 'Subtracting',
    skills: ['sub-facts'],
    enemies: 4,
    speed: [55, 80],
    chase: 0.12,
    lesson: { idea: 'Think addition: what do you add to the smaller number to get the bigger one?', examples: ['9−4'] },
  },
  {
    name: 'Adding and subtracting',
    skills: ['add-facts', 'sub-facts'],
    enemies: 5,
    speed: [60, 85],
    chase: 0.14,
    lesson: {
      idea: 'Check the sign first, then use its trick: make a ten to add, think addition to take away.',
      examples: ['7+6', '8−3'],
      note: '7+6 and 7−6 look almost the same. The sign changes everything.',
    },
  },
  {
    name: 'Multiplying',
    skills: ['mul-facts'],
    enemies: 5,
    speed: [60, 85],
    chase: 0.16,
    lesson: {
      idea: 'Turn a hard fact into easy ones: split a number into 5 and the rest, or use times 10.',
      examples: ['7×8', '9×6'],
    },
  },
  {
    name: 'Multiplying and dividing',
    skills: ['mul-facts', 'div-facts'],
    enemies: 5,
    speed: [65, 90],
    chase: 0.18,
    lesson: { idea: 'Division is multiplication backwards: ask what times the second number makes the first.', examples: ['42÷6'] },
  },
  {
    name: 'Bigger numbers: + and −',
    skills: ['add-2digit', 'sub-2digit'],
    enemies: 5,
    speed: [65, 95],
    chase: 0.2,
    lesson: {
      idea: 'Split the second number into tens and ones. Add or take away the tens first, then the ones.',
      examples: ['47+28', '83−36'],
    },
  },
  {
    name: 'Bigger numbers: × and ÷',
    skills: ['mul-2digit', 'div-2digit'],
    enemies: 5,
    speed: [70, 100],
    chase: 0.22,
    lesson: { idea: 'Split the big number into parts that are easy to work with, then put the answers together.', examples: ['17×3', '96÷8'] },
  },
  {
    name: 'Order of operations',
    skills: ['order-ops'],
    enemies: 6,
    speed: [65, 95],
    chase: 0.22,
    lesson: {
      idea: '× and ÷ come before + and −, even when they come second.',
      examples: ['3+4×2'],
      note: 'Not 14! Going left to right (3+4 = 7, then 7×2) gives the wrong answer.',
    },
  },
  {
    name: 'Parentheses',
    skills: ['paren-2op'],
    enemies: 6,
    speed: [65, 95],
    chase: 0.22,
    lesson: { idea: 'Work out the parentheses first, then the rest.', examples: ['(18−6)÷3'] },
  },
  {
    name: 'Multi-step parentheses',
    skills: ['paren-3op'],
    enemies: 6,
    speed: [65, 95],
    chase: 0.22,
    lesson: { idea: 'Parentheses first, then × and ÷, then + and −. One small step at a time.', examples: ['2+(24÷2)×5'] },
  },
];

/** Every stage after the last one: all the bigger problem types, with single-digit facts as the mixed-in enemy. */
export const MIXED_STAGE: Stage = {
  name: 'Mixed review',
  skills: ['add-2digit', 'sub-2digit', 'mul-2digit', 'div-2digit', 'order-ops', 'paren-2op', 'paren-3op'],
  enemies: 6,
  speed: [70, 100],
  chase: 0.24,
};

export const GAME = {
  levelsPerStage: 3, // each entry of STAGES lasts this many levels
  levelsPerShop: 3, // the shop opens after every 3rd level
  stageSpeedStep: 3, // px/s faster for each level within a stage
  mixPerWave: 1, // enemies per wave with a problem type from an earlier stage
  endlessSpeedStep: 3, // px/s faster for each mixed-review stage…
  endlessSpeedMax: 30, // …up to this much
  levelBannerMs: 1300, // pause while "Level N" shows
  clearedBannerMs: 1100, // pause after a level is cleared
};

/**
 * Difficulty: where a run starts in STAGES. The quick check (CHECK) recommends
 * one, and the player can pick any. Problem types from skipped stages start one
 * number size up (`skippedSize`), since the player already knows them.
 * Enemy speed and gear are the same on every setting.
 */
export const PRESETS = [
  { key: 'starter', name: 'Starter', startStage: 0, about: 'Starts with single-digit adding', example: '7+5' },
  { key: 'standard', name: 'Standard', startStage: 3, about: 'Starts with times tables', example: '7×8' },
  { key: 'advanced', name: 'Advanced', startStage: 5, about: 'Starts with bigger numbers', example: '47+28' },
  { key: 'expert', name: 'Expert', startStage: 7, about: 'Starts with order of operations', example: '3+4×2' },
] as const;
export type PresetKey = (typeof PRESETS)[number]['key'];
export const SKIPPED_SIZE = 1;

export interface CheckBand {
  name: string;
  /** Problem types asked in this band, at the smallest number size. */
  skills: Skill[];
  /** Average time per correct answer (typing included) to pass. */
  maxAvgSec: number;
}

/**
 * The quick check: a few typed-answer problems that recommend a difficulty.
 * Band i covers the stages that PRESETS[i + 1] skips. A band passes with
 * `passCorrect` of `perBand` right, fast enough on average; the check stops at
 * the first band that doesn't pass. Bands passed = recommended PRESETS index.
 */
export const CHECK: { perBand: number; passCorrect: number; feedbackMs: number; bands: CheckBand[] } = {
  perBand: 3,
  passCorrect: 2,
  feedbackMs: 700,
  bands: [
    { name: 'Adding and subtracting', skills: ['add-facts', 'sub-facts'], maxAvgSec: 6 },
    { name: 'Times tables', skills: ['mul-facts', 'div-facts'], maxAvgSec: 7 },
    { name: 'Bigger numbers', skills: ['add-2digit', 'sub-2digit', 'mul-2digit', 'div-2digit'], maxAvgSec: 12 },
  ],
};

/** One test-round problem, in both forms: same problem type and size, different numbers. */
export interface TestSlot {
  skill: Skill;
  a: string;
  b: string;
}

/**
 * The test round (learning/testRound.ts): the before/after measure. Unlike the
 * game and the quick check it never adapts or stops early. Everyone gets these
 * problems in this order, so scores can be compared from one test to the next.
 * Forms A and B alternate (A first) so nobody just remembers the answers.
 *
 * It is offered before the first game, then at the end of a game once there
 * have been `minutesBetween` minutes of play since the last test (or since the
 * player last said "not now"). The first three sections match CHECK.bands, so
 * the test also recommends a difficulty.
 */
export const TEST: { minutesBetween: number; sections: { name: string; slots: TestSlot[] }[] } = {
  minutesBetween: 10,
  sections: [
    {
      name: 'Adding and subtracting',
      slots: [
        { skill: 'add-facts', a: '7+8', b: '8+6' },
        { skill: 'add-facts', a: '6+5', b: '4+7' },
        { skill: 'sub-facts', a: '9−4', b: '8−5' },
        { skill: 'sub-facts', a: '15−7', b: '13−6' },
      ],
    },
    {
      name: 'Times tables',
      slots: [
        { skill: 'mul-facts', a: '7×8', b: '8×6' },
        { skill: 'mul-facts', a: '4×6', b: '3×7' },
        { skill: 'div-facts', a: '42÷6', b: '63÷7' },
        { skill: 'div-facts', a: '27÷3', b: '32÷4' },
      ],
    },
    {
      name: 'Bigger numbers',
      slots: [
        { skill: 'add-2digit', a: '47+28', b: '36+57' },
        { skill: 'sub-2digit', a: '83−36', b: '72−45' },
        { skill: 'mul-2digit', a: '17×3', b: '13×4' },
        { skill: 'div-2digit', a: '96÷8', b: '84÷6' },
      ],
    },
    {
      name: 'Multi-step',
      slots: [
        { skill: 'order-ops', a: '3+4×2', b: '5+3×4' },
        { skill: 'order-ops', a: '30−18÷3', b: '20−12÷4' },
        { skill: 'paren-2op', a: '(18−6)÷3', b: '(20−8)÷4' },
        { skill: 'paren-3op', a: '2+(24÷2)×5', b: '3+(36÷3)×4' },
      ],
    },
  ],
};

/**
 * Gold, spent in the shop. A correct hit earns `perOp` for every operation in
 * the problem (7+5 → 10, 3+4×2 → 20, 2+(24÷2)×5 → 30), plus up to `speedBonusMax`
 * for finding it fast: the full bonus within `fullBonusSec` of the target
 * appearing, shrinking to 0 at `zeroBonusSec`. Wrong hits cost nothing but time.
 */
export const GOLD = {
  perOp: 10,
  speedBonusMax: 10,
  fullBonusSec: 3,
  zeroBonusSec: 13,
};

/**
 * Adaptivity, at every shop. Each problem type with at least `minAttempts` hits
 * since it was last rated is rated from those hits (accuracy, and average time
 * to find a correct target):
 *   strong  accuracy ≥ strongAccuracy and average ≤ fast time → number size + step.strong
 *   weak    accuracy < weakAccuracy or average > slow time   → number size + step.weak (smaller),
 *                                                               and it comes back for review
 *   ok      anything in between                               → step.ok
 * Sizes go from 0 to MAX_DIFFICULTY; problems use the whole part, so +0.5 is a
 * step every other shop. Times are for a one-operation problem; each extra
 * operation adds `extraSecPerOp`.
 */
export const ADAPT = {
  strongAccuracy: 0.9,
  weakAccuracy: 0.7,
  fastSec: 6,
  slowSec: 14,
  extraSecPerOp: 4,
  minAttempts: 3,
  step: { strong: 1, ok: 0.5, weak: -0.5 },
  /** Up to this share of each wave is review of weak problem types. */
  reviewShare: 1 / 3,
};

export const COLORS = {
  background: 0x10131c,
  arena: 0x161b27,
  arenaEdge: 0x2c3447,
  player: 0x4fc3f7,
  playerHurt: 0xff8a80,
  spear: 0xe0e0e0,
  spearLocked: 0x5a6275,
  shield: 0x80cbc4,
  shieldBlock: 0xffffff,
  enemy: 0xffb74d,
  enemyWrong: 0xef5350,
  text: '#e8ecf4',
  textDim: '#8b93a7',
  good: '#81c784',
  bad: '#ef5350',
  gold: '#ffca28',
  accent: '#ffd54f',
};
