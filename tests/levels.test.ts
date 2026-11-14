import { describe, expect, it } from 'vitest';
import { CHECK, MIXED_STAGE, PRESETS, STAGES, type Stage } from '../src/config';
import { newRun, levelSpec } from '../src/game/run';
import { generateWave, tierOfSkill } from '../src/learning/problems';
import { createRng } from '../src/learning/rng';

const hardestTier = (s: Stage) => Math.max(...s.skills.map(tierOfSkill));
const easiestTier = (s: Stage) => Math.min(...s.skills.map(tierOfSkill));

describe('STAGES', () => {
  it('starts with single-digit adding and ends with parentheses', () => {
    expect(STAGES[0].skills).toEqual(['add-facts']);
    expect(hardestTier(STAGES[STAGES.length - 1])).toBe(4);
  });

  it('never gets easier math or fewer enemies from one stage to the next', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(easiestTier(STAGES[i]), `stage ${i + 1} tier`).toBeGreaterThanOrEqual(easiestTier(STAGES[i - 1]));
      expect(hardestTier(STAGES[i]), `stage ${i + 1} tier`).toBeGreaterThanOrEqual(hardestTier(STAGES[i - 1]));
      expect(STAGES[i].enemies, `stage ${i + 1} enemies`).toBeGreaterThanOrEqual(STAGES[i - 1].enemies);
    }
  });

  it('has sensible speed ranges', () => {
    for (const s of [...STAGES, MIXED_STAGE]) {
      expect(s.speed[0]).toBeGreaterThan(0);
      expect(s.speed[1]).toBeGreaterThanOrEqual(s.speed[0]);
    }
  });

  // Every wave a run can see: the stage's skills, plus one enemy from earlier stages, at every number size.
  it.each([...STAGES, MIXED_STAGE].map((s, i) => [i + 1, s] as const))('stage %i can always fill its wave with unique answers', (n, stage) => {
    const earlier = STAGES.slice(0, n - 1).flatMap((s) => s.skills).filter((s) => !stage.skills.includes(s));
    for (const size of [0, 1, 2, 3]) {
      const difficulty = Object.fromEntries([...stage.skills, ...earlier].map((s) => [s, size]));
      for (let seed = 0; seed < 100; seed++) {
        const pools = Array.from({ length: stage.enemies }, (_, i) => (i === 0 && earlier.length ? earlier : stage.skills));
        const problems = generateWave(pools, createRng(seed), difficulty);
        expect(new Set(problems.map((p) => p.answer)).size).toBe(stage.enemies);
      }
    }
  });
});

describe('PRESETS', () => {
  it('start in order, from the first stage', () => {
    expect(PRESETS[0].startStage).toBe(0);
    for (let i = 1; i < PRESETS.length; i++) expect(PRESETS[i].startStage).toBeGreaterThan(PRESETS[i - 1].startStage);
    expect(PRESETS[PRESETS.length - 1].startStage).toBeLessThan(STAGES.length);
  });

  it('each start at the stage they name', () => {
    for (const p of PRESETS) expect(levelSpec(newRun(1, p.key), 1)).toMatchObject({ name: STAGES[p.startStage].name });
  });

  it('have one quick-check band for each stage range they skip', () => {
    expect(CHECK.bands).toHaveLength(PRESETS.length - 1);
    CHECK.bands.forEach((band, i) => {
      const skipped = STAGES.slice(PRESETS[i].startStage, PRESETS[i + 1].startStage).flatMap((s) => s.skills);
      for (const skill of band.skills) expect(skipped, `band ${i + 1}`).toContain(skill);
    });
  });
});
