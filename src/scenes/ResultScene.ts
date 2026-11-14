import Phaser from 'phaser';
import { COLORS, GAME, GEAR, HEARTS, WIDTH } from '../config';
import { summarize } from '../game/gold';
import type { Attempt } from '../game/round';
import { levelSpec, presetOf } from '../game/run';
import { skillReport, type Rating } from '../learning/adapt';
import { explainLine } from '../learning/explain';
import { SKILL_NAMES } from '../learning/problems';
import { fitCamera, makeButton, makeText, onKey } from '../ui/widgets';
import { afterTestDue, TEST_LENGTH } from '../learning/testRound';
import {
  declineTest,
  levelsText,
  loadBest,
  loadPlayMinutes,
  loadTestDeclinedAt,
  loadTests,
  saveBest,
  saveRun,
  type ResultData,
  type TestData,
} from './types';

const SKILL_ROWS = 6;
const RATING_LABELS: Record<Rating | 'none', [string, string]> = {
  strong: ['Strong', COLORS.good],
  ok: ['Getting there', COLORS.text],
  weak: ['Needs practice', COLORS.accent],
  none: ['Too few to tell', COLORS.textDim],
};
const sec = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);

/** The one summary screen at the end of a run (or the tutorial): the whole run, each problem type, and what to look at again. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: ResultData): void {
    fitCamera(this);

    if (data.mode === 'tutorial') {
      makeText(this, WIDTH / 2, 70, 'Tutorial complete!', { fontSize: '44px', fontStyle: 'bold', color: COLORS.good });
      makeText(
        this,
        WIDTH / 2,
        220,
        `In the real game you start with ${HEARTS.start} heart and a small shield.\n` +
          'Correct hits earn gold (more for fast hits and harder problems).\n' +
          `Every ${GAME.levelsPerShop} levels the shop sells speed, a wider shield,\n` +
          `or more hearts (up to ${HEARTS.max}).\n\n` +
          'The math starts where your difficulty says and grows as you get faster.\n' +
          'Each new kind of problem starts with a short lesson: a trick, an example, one to try.\n' +
          'A wrong hit shows the steps. Problems you find hard come back for practice.',
        { fontSize: '20px', align: 'center', lineSpacing: 6 },
      );
      this.buttons('Start the game');
      return;
    }

    const { run, outOfHearts } = data;
    saveRun(run, outOfHearts ? 'out of hearts' : 'ended at the shop');
    const s = summarize(run.attempts);
    const best = loadBest(run.preset);
    const newBest = run.cleared > best;
    if (newBest) saveBest(run.preset, run.cleared);

    makeText(this, WIDTH / 2, 46, outOfHearts ? 'Out of hearts' : 'Run complete', {
      fontSize: '36px',
      fontStyle: 'bold',
      color: outOfHearts ? COLORS.bad : COLORS.good,
    });
    const reached = levelSpec(run, outOfHearts ? run.cleared + 1 : Math.max(1, run.cleared)).name;
    makeText(this, WIDTH / 2, 84, `${presetOf(run.preset).name}  ·  reached ${reached}  ·  ${Math.round(run.playMs / 1000)}s of play`, {
      fontSize: '17px',
      color: COLORS.textDim,
    });
    makeText(this, WIDTH / 2, 132, `${levelsText(run.cleared)} cleared`, { fontSize: '46px', fontStyle: 'bold', color: COLORS.accent });
    makeText(this, WIDTH / 2, 172, newBest ? 'New best!' : `Best: ${levelsText(best)}`, {
      fontSize: '17px',
      color: newBest ? COLORS.good : COLORS.textDim,
    });

    // Left: the whole run.
    const rows: [string, string, string][] = [
      ['Gold earned', run.goldEarned.toLocaleString(), COLORS.gold],
      ['Right hits', `${s.correct}`, COLORS.text],
      ['Wrong hits', `${s.wrong}`, COLORS.text],
      ['Accuracy', s.accuracy === null ? '–' : `${Math.round(s.accuracy * 100)}%`, COLORS.text],
      ['Time to find a target', sec(s.avgResponseMs), COLORS.text],
      ['Gear', `speed ${run.speed + 1}/${GEAR.speed.length}  ·  shield ${run.shield + 1}/${GEAR.shield.length}`, COLORS.text],
    ];
    rows.forEach(([label, value, color], i) => {
      const y = 232 + i * 30;
      makeText(this, 250, y, label, { fontSize: '18px', color: COLORS.textDim }).setOrigin(1, 0.5);
      makeText(this, 268, y, value, { fontSize: '18px', color }).setOrigin(0, 0.5);
    });

    // Right: each problem type, rated the same way the shop rates it.
    this.skillTable(run.attempts);

    // The problems missed, most recent first, and the latest one worked out.
    const misses = run.attempts.filter((a) => !a.correct).reverse();
    const missed = [...new Set(misses.map((a) => `${a.problem.text} = ${a.problem.answer}`))];
    if (missed.length) {
      makeText(this, WIDTH / 2, 428, 'Problems to look at again', { fontSize: '16px', color: COLORS.textDim });
      const shown = missed.slice(0, 4);
      makeText(this, WIDTH / 2, 456, shown.join('      ') + (missed.length > 4 ? `   (+${missed.length - 4} more)` : ''), {
        fontSize: '19px',
      });
      const p = misses[0].problem;
      makeText(this, WIDTH / 2, 486, `${p.text}:  ${explainLine(p.expr, 80)}`, { fontSize: '16px', color: COLORS.textDim });
    }

    if (afterTestDue(loadTests(), loadPlayMinutes(), loadTestDeclinedAt())) {
      this.testButtons();
      return;
    }
    this.buttons('Play again');
  }

  /** Accuracy and speed per problem type (learning/adapt.ts skillReport), at most SKILL_ROWS of them. */
  private skillTable(attempts: readonly Attempt[]): void {
    const NAME_X = 690;
    const STAT_X = 705;
    const RATING_X = 818;
    const all = skillReport(attempts);
    if (!all.length) return;
    const kept = new Set([...all].sort((a, b) => b.attempts - a.attempts).slice(0, SKILL_ROWS));
    const rows = all.filter((r) => kept.has(r));
    makeText(this, 700, 222, 'By problem type', { fontSize: '16px', color: COLORS.textDim });
    rows.forEach((r, i) => {
      const y = 250 + i * 28;
      const [label, color] = RATING_LABELS[r.rating ?? 'none'];
      makeText(this, NAME_X, y, SKILL_NAMES[r.skill], { fontSize: '16px', color: COLORS.textDim }).setOrigin(1, 0.5);
      makeText(this, STAT_X, y, `${r.correct}/${r.attempts}  ·  ${sec(r.avgMs)}`, { fontSize: '16px' }).setOrigin(0, 0.5);
      makeText(this, RATING_X, y, label, { fontSize: '15px', color }).setOrigin(0, 0.5);
    });
    if (all.length > rows.length) {
      makeText(this, 700, 250 + rows.length * 28, `(+${all.length - rows.length} more in the downloaded data)`, {
        fontSize: '14px',
        color: COLORS.textDim,
      });
    }
  }

  /** The test round is due: offer it first, with playing on as "not now". */
  private testButtons(): void {
    makeText(this, WIDTH / 2, 522, `Time for a test round: ${TEST_LENGTH} typed problems, to see how much you've improved.`, {
      fontSize: '18px',
      color: COLORS.good,
    });
    const test = () => this.scene.start('Test', { kind: 'after' } satisfies TestData);
    const later = (scene: string) => () => {
      declineTest();
      this.scene.start(scene);
    };
    makeButton(this, WIDTH / 2 - 270, 576, 'Test round', test, { hotkey: '⏎', primary: true, width: 240 });
    makeButton(this, WIDTH / 2, 576, 'Not now: play', later('Setup'), { hotkey: 'P', width: 240 });
    makeButton(this, WIDTH / 2 + 270, 576, 'Menu', later('Menu'), { hotkey: 'Esc', width: 240 });
    onKey(this, 'ENTER', test);
    onKey(this, 'SPACE', test);
    onKey(this, 'P', later('Setup'));
    onKey(this, 'ESC', later('Menu'));
  }

  private buttons(primaryLabel: string): void {
    const play = () => this.scene.start('Setup');
    const menu = () => this.scene.start('Menu');
    makeButton(this, WIDTH / 2 - 150, 570, primaryLabel, play, { hotkey: '⏎', primary: true });
    makeButton(this, WIDTH / 2 + 150, 570, 'Menu', menu, { hotkey: 'Esc' });
    onKey(this, 'ENTER', play);
    onKey(this, 'SPACE', play);
    onKey(this, 'ESC', menu);
  }
}
