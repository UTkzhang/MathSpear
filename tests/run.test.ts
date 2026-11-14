import { describe, expect, it } from 'vitest';
import { GAME, GEAR, HEARTS, MIXED_STAGE, PRESETS, SKIPPED_SIZE, STAGES } from '../src/config';
import type { Attempt } from '../src/game/round';
import {
  buy,
  canBuy,
  completeLevel,
  currentLevel,
  earn,
  levelProblems,
  levelSpec,
  newRun,
  nextShopLevel,
  price,
  lessonDue,
  markLessonShown,
  recordAttempts,
  runRecord,
  shopDue,
  sinceLastShop,
  speedOf,
  stageIndex,
  type RunState,
} from '../src/game/run';

const fastHits = (run: RunState): Attempt[] =>
  levelProblems(run).map((p) => ({ problem: p, target: p.answer, correct: true, responseMs: 1500 }));

/** Play the current level with every hit correct and fast. */
function clearLevel(run: RunState) {
  recordAttempts(run, fastHits(run), 10_000);
  return completeLevel(run);
}

describe('a new run', () => {
  it('starts at level 1 with starting gear, one heart and no gold', () => {
    const run = newRun(1);
    expect(currentLevel(run)).toBe(1);
    expect(run).toMatchObject({ preset: 'starter', hp: HEARTS.start, gold: 0, speed: 0, shield: 0 });
    expect(speedOf(run)).toEqual(GEAR.speed[0]);
    expect(run.difficulty).toEqual({});
  });

  it('starts problem types the difficulty skips one size up', () => {
    const run = newRun(1, 'advanced');
    expect(run.difficulty['add-facts']).toBe(SKIPPED_SIZE);
    expect(run.difficulty['mul-facts']).toBe(SKIPPED_SIZE);
    expect(run.difficulty['add-2digit']).toBeUndefined();
  });
});

describe('the shop', () => {
  it('buys speed and shield upgrades in order, for gold', () => {
    const run = newRun(1);
    expect(canBuy(run, 'speed')).toBe(false);
    earn(run, 1000);
    expect(buy(run, 'speed')).toBe(true);
    expect(run.speed).toBe(1);
    expect(run.gold).toBe(1000 - GEAR.speed[1].cost);
    expect(price(run, 'speed')).toBe(GEAR.speed[2].cost);
    expect(buy(run, 'shield')).toBe(true);
    expect(run.shield).toBe(1);
  });

  it('refuses when there is not enough gold, and changes nothing', () => {
    const run = newRun(1);
    earn(run, GEAR.speed[1].cost - 1);
    expect(buy(run, 'speed')).toBe(false);
    expect(run).toMatchObject({ speed: 0, gold: GEAR.speed[1].cost - 1 });
  });

  it('stops at the last upgrade', () => {
    const run = newRun(1);
    earn(run, 100_000);
    for (let i = 0; i < 20; i++) buy(run, 'speed');
    expect(run.speed).toBe(GEAR.speed.length - 1);
    expect(price(run, 'speed')).toBeNull();
  });

  it('sells hearts up to the max, including ones that were lost', () => {
    const run = newRun(1);
    earn(run, 100_000);
    while (buy(run, 'heart'));
    expect(run.hp).toBe(HEARTS.max);
    expect(price(run, 'heart')).toBeNull();
    run.hp -= 1;
    expect(price(run, 'heart')).toBe(HEARTS.cost);
  });

  it('keeps track of all gold earned, even after spending', () => {
    const run = newRun(1);
    earn(run, 1000);
    buy(run, 'speed');
    expect(run.goldEarned).toBe(1000);
  });

  it('gets more expensive with every upgrade', () => {
    for (const list of [GEAR.speed, GEAR.shield]) {
      for (let i = 2; i < list.length; i++) expect(list[i].cost).toBeGreaterThan(list[i - 1].cost);
    }
  });
});

describe('levels and stages', () => {
  it('spends GAME.levelsPerStage levels on each stage, then mixed review, never going back', () => {
    const run = newRun(1);
    expect(levelSpec(run, 1).name).toBe(STAGES[0].name);
    expect(levelSpec(run, GAME.levelsPerStage).name).toBe(STAGES[0].name);
    expect(levelSpec(run, GAME.levelsPerStage + 1).name).toBe(STAGES[1].name);
    const end = STAGES.length * GAME.levelsPerStage;
    expect(levelSpec(run, end).name).toBe(STAGES[STAGES.length - 1].name);
    for (const level of [end + 1, end + 50]) expect(levelSpec(run, level).name).toBe(MIXED_STAGE.name);
    for (let level = 2; level < end + 10; level++) expect(stageIndex(run, level)).toBeGreaterThanOrEqual(stageIndex(run, level - 1));
  });

  it('starts later in the stages on harder difficulties', () => {
    const run = newRun(1, 'expert');
    const start = PRESETS.find((p) => p.key === 'expert')!.startStage;
    expect(stageIndex(run, 1)).toBe(start);
    expect(levelSpec(run, GAME.levelsPerStage + 1).name).toBe(STAGES[start + 1].name);
  });

  it('speeds enemies up a little within a stage, and caps the speed-up in mixed review', () => {
    const run = newRun(1);
    expect(levelSpec(run, 2).speed[0]).toBe(STAGES[0].speed[0] + GAME.stageSpeedStep);
    const far = levelSpec(run, 1000).speed[0];
    expect(far).toBeLessThanOrEqual(MIXED_STAGE.speed[0] + GAME.endlessSpeedMax + GAME.stageSpeedStep * (GAME.levelsPerStage - 1));
  });

  it('mixes one problem from an earlier stage into each wave', () => {
    const run = newRun(3);
    run.cleared = GAME.levelsPerStage * 3; // the multiplying stage
    const spec = levelSpec(run);
    expect(spec.mix).toEqual(['add-facts', 'sub-facts']);
    for (let i = 0; i < 20; i++) {
      const problems = levelProblems(run);
      expect(problems).toHaveLength(spec.enemies);
      expect(problems.filter((p) => spec.mix.includes(p.skill))).toHaveLength(GAME.mixPerWave);
    }
    expect(levelSpec(newRun(1), 1).mix).toEqual([]);
  });

  it('mixes weak problem types into the wave as review', () => {
    const run = newRun(5);
    run.review = ['paren-3op'];
    const problems = levelProblems(run); // level 1: adding, plus review
    expect(problems.some((p) => p.skill === 'paren-3op')).toBe(true);
    expect(problems.some((p) => p.skill === 'add-facts')).toBe(true);
  });
});

describe('shop cadence and adapting', () => {
  it('opens the shop every GAME.levelsPerShop levels', () => {
    const run = newRun(4);
    for (let level = 1; level <= GAME.levelsPerShop * 3; level++) {
      expect(nextShopLevel(run)).toBe(Math.ceil(level / GAME.levelsPerShop) * GAME.levelsPerShop);
      const report = clearLevel(run);
      expect(report !== null, `level ${level}`).toBe(level % GAME.levelsPerShop === 0);
      expect(shopDue(run)).toBe(level % GAME.levelsPerShop === 0);
    }
  });

  it('grows the numbers for a skill that went well, at the shop', () => {
    const run = newRun(4);
    for (let i = 1; i < GAME.levelsPerShop; i++) clearLevel(run);
    expect(run.difficulty['add-facts']).toBeUndefined();
    const report = clearLevel(run);
    expect(report?.results.map((r) => [r.skill, r.rating])).toEqual([['add-facts', 'strong']]);
    expect(run.difficulty['add-facts']).toBe(1);
    expect(run.pending).toEqual([]);
  });

  it('never jumps more than one number size per shop', () => {
    const run = newRun(6);
    let before = { ...run.difficulty };
    for (let level = 1; level <= 30; level++) {
      if (!clearLevel(run)) continue;
      for (const [skill, size] of Object.entries(run.difficulty)) {
        const was = before[skill as keyof typeof before] ?? 0;
        expect(size! - was, `${skill} at level ${level}`).toBeLessThanOrEqual(1);
      }
      before = { ...run.difficulty };
    }
  });
});

describe('lessons', () => {
  it('come before the first level of each stage, once per run', () => {
    const run = newRun(1);
    expect(lessonDue(run)).toBe(true);
    markLessonShown(run);
    expect(lessonDue(run)).toBe(false);
    for (let i = 1; i < GAME.levelsPerStage; i++) {
      clearLevel(run);
      expect(lessonDue(run), `level ${currentLevel(run)}`).toBe(false);
    }
    clearLevel(run);
    expect(stageIndex(run)).toBe(1);
    expect(lessonDue(run)).toBe(true);
  });

  it('start with the stage the difficulty starts at, and stop at mixed review', () => {
    const expert = newRun(1, 'expert');
    expect(lessonDue(expert)).toBe(true);
    markLessonShown(expert);
    expect(expert.lessonsShown).toEqual([PRESETS[3].startStage]);
    const run = newRun(1);
    run.cleared = STAGES.length * GAME.levelsPerStage;
    expect(levelSpec(run).name).toBe(MIXED_STAGE.name);
    expect(lessonDue(run)).toBe(false);
  });

  it('every stage has one, with one or two examples', () => {
    for (const stage of STAGES) {
      expect(stage.lesson, stage.name).toBeDefined();
      expect(stage.lesson!.examples.length).toBeGreaterThanOrEqual(1);
      expect(stage.lesson!.examples.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('the event log', () => {
  it('tags every hit with its level', () => {
    const run = newRun(1);
    clearLevel(run);
    clearLevel(run);
    expect(new Set(run.attempts.map((a) => a.level))).toEqual(new Set([1, 2]));
  });

  it('gives the shop the hits since the last shop', () => {
    const run = newRun(1);
    for (let i = 0; i < GAME.levelsPerShop; i++) clearLevel(run);
    const first = sinceLastShop(run);
    expect(first.length).toBe(run.attempts.length);
    for (let i = 0; i < GAME.levelsPerShop; i++) clearLevel(run);
    const second = sinceLastShop(run);
    expect(new Set(second.map((a) => a.level))).toEqual(new Set([4, 5, 6]));
    expect(second.length + first.length).toBe(run.attempts.length);
  });

  it('saves a run as plain data: every hit, the lesson answers, and the number sizes', () => {
    const run = newRun(1, 'standard');
    clearLevel(run);
    run.lessonTries.push({ stage: 3, text: '7×8', skill: 'mul-facts', answer: 56, given: 54, correct: false, ms: 4200 });
    const record = runRecord(run, 'quit', '2026-11-14T12:00:00.000Z');
    expect(record).toMatchObject({ preset: 'standard', ended: 'quit', cleared: 1, at: '2026-11-14T12:00:00.000Z' });
    expect(record.hits).toHaveLength(run.attempts.length);
    expect(record.hits[0]).toEqual({
      level: 1,
      skill: run.attempts[0].problem.skill,
      text: run.attempts[0].problem.text,
      answer: run.attempts[0].problem.answer,
      target: run.attempts[0].target,
      correct: true,
      ms: 1500,
    });
    expect(record.lessonTries).toEqual(run.lessonTries);
    expect(record.sizes).toEqual(run.difficulty);
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });
});
