import Phaser from 'phaser';
import { COLORS, GAME, GEAR, HEARTS, WIDTH } from '../config';
import { summarize } from '../game/gold';
import type { Attempt } from '../game/round';
import { levelSpec, presetOf } from '../game/run';
import { skillReport, type Rating } from '../learning/adapt';
import { explainLine } from '../learning/explain';
import { SKILL_NAMES } from '../learning/problems';
import { fitCamera, makeButton, makeLabel, makePanel, makeText, makeTitle, onKey, UI } from '../ui/widgets';
import { afterTestDue, TEST_LENGTH } from '../learning/testRound';
import {
  clearSavedRun,
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

/** "45 s", "2 min 20 s". */
function playTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

// Three panels: the whole run and each problem type side by side, and the misses under them.
const PANELS = { top: 208, h: 200 };
const RUN_PANEL = { x: 44, w: 400 };
const SKILL_PANEL = { x: 460, w: 456 };
const MISS_PANEL = { x: 44, y: 420, w: 872, h: 92 };

/** The one summary screen at the end of a run (or the tutorial): the whole run, each problem type, and what to look at again. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: ResultData): void {
    fitCamera(this);

    if (data.mode === 'tutorial') {
      this.tutorialDone();
      return;
    }

    const { run, outOfHearts } = data;
    saveRun(run, outOfHearts ? 'out of hearts' : 'ended at the shop');
    clearSavedRun();
    const s = summarize(run.attempts);
    const best = loadBest(run.preset);
    const newBest = run.cleared > best;
    if (newBest) saveBest(run.preset, run.cleared);

    const reached = levelSpec(run, outOfHearts ? run.cleared + 1 : Math.max(1, run.cleared)).name;
    makeTitle(
      this,
      outOfHearts ? 'Out of hearts' : 'Run complete',
      `${presetOf(run.preset).name}  ·  reached ${reached}  ·  ${playTime(run.playMs)} of play`,
      outOfHearts ? COLORS.bad : COLORS.good,
    );
    makeText(this, WIDTH / 2, 144, `${levelsText(run.cleared)} cleared`, { fontSize: '44px', fontStyle: 'bold', color: COLORS.accent });
    makeText(this, WIDTH / 2, 182, newBest ? 'New best!' : `Best: ${levelsText(best)}`, {
      fontSize: '17px',
      color: newBest ? COLORS.good : COLORS.textDim,
    });

    // Left: the whole run.
    makePanel(this, RUN_PANEL.x, PANELS.top, RUN_PANEL.w, PANELS.h);
    makeLabel(this, RUN_PANEL.x + 20, PANELS.top + 22, 'This run');
    const rows: [string, string, string][] = [
      ['Gold earned', run.goldEarned.toLocaleString(), COLORS.gold],
      ['Right hits', `${s.correct}`, COLORS.text],
      ['Wrong hits', `${s.wrong}`, COLORS.text],
      ['Accuracy', s.accuracy === null ? '–' : `${Math.round(s.accuracy * 100)}%`, COLORS.text],
      ['Time to find a target', sec(s.avgResponseMs), COLORS.text],
      ['Gear', `speed ${run.speed + 1}/${GEAR.speed.length}  ·  shield ${run.shield + 1}/${GEAR.shield.length}`, COLORS.text],
    ];
    rows.forEach(([label, value, color], i) => {
      const y = PANELS.top + 50 + i * 26;
      makeText(this, RUN_PANEL.x + 196, y, label, { fontSize: '17px', color: COLORS.textDim }).setOrigin(1, 0.5);
      makeText(this, RUN_PANEL.x + 212, y, value, { fontSize: '17px', color }).setOrigin(0, 0.5);
    });

    // Right: each problem type, rated the same way the shop rates it.
    this.skillTable(run.attempts);

    // Below: the problems missed, most recent first, and the latest one worked out.
    makePanel(this, MISS_PANEL.x, MISS_PANEL.y, MISS_PANEL.w, MISS_PANEL.h);
    makeLabel(this, MISS_PANEL.x + 20, MISS_PANEL.y + 22, 'To look at again');
    const misses = run.attempts.filter((a) => !a.correct).reverse();
    const missed = [...new Set(misses.map((a) => `${a.problem.text} = ${a.problem.answer}`))];
    if (missed.length) {
      const shown = missed.slice(0, 4);
      makeText(this, WIDTH / 2, MISS_PANEL.y + 36, shown.join('      ') + (missed.length > 4 ? `   (+${missed.length - 4} more)` : ''), {
        fontSize: '19px',
      });
      const p = misses[0].problem;
      makeText(this, WIDTH / 2, MISS_PANEL.y + 66, `${p.text}:  ${explainLine(p.expr, 80)}`, { fontSize: '16px', color: COLORS.textDim });
    } else {
      makeText(this, WIDTH / 2, MISS_PANEL.y + MISS_PANEL.h / 2 + 4, run.attempts.length ? 'Nothing: no wrong hits this run!' : 'No hits this run.', {
        fontSize: '18px',
        color: run.attempts.length ? COLORS.good : COLORS.textDim,
      });
    }

    if (afterTestDue(loadTests(), loadPlayMinutes(), loadTestDeclinedAt())) {
      this.testButtons();
      return;
    }
    this.buttons('Play again');
  }

  /** After the tutorial: how the real game differs, as a short list. */
  private tutorialDone(): void {
    makeTitle(this, 'Tutorial complete!', 'Here is how the real game works.', COLORS.good);
    const points = [
      `You start with ${HEARTS.start} heart and a small shield.`,
      'Correct hits earn gold: more for fast hits and harder problems.',
      `Every ${GAME.levelsPerShop} levels the shop sells speed, a wider shield, or more hearts (up to ${HEARTS.max}).`,
      'The math starts where your difficulty says, and grows as you get faster.',
      'Each new kind of problem starts with a short lesson: a trick, an example, one to try.',
      'A wrong hit shows the steps. Problems you find hard come back for practice.',
    ];
    const ROW = 44;
    const w = 760;
    const h = points.length * ROW + 28;
    const top = 124 + (UI.buttonsY - 44 - 124 - h) / 2;
    makePanel(this, WIDTH / 2 - w / 2, top, w, h);
    const dots = this.add.graphics();
    dots.fillStyle(UI.accent, 1);
    points.forEach((point, i) => {
      const y = top + 14 + ROW / 2 + i * ROW;
      dots.fillCircle(WIDTH / 2 - w / 2 + 34, y, 4);
      makeText(this, WIDTH / 2 - w / 2 + 54, y, point, { fontSize: '18px' }).setOrigin(0, 0.5);
    });
    this.buttons('Start the game');
  }

  /** Accuracy and speed per problem type (learning/adapt.ts skillReport), at most SKILL_ROWS of them. */
  private skillTable(attempts: readonly Attempt[]): void {
    const NAME_X = SKILL_PANEL.x + 208;
    const STAT_X = NAME_X + 14;
    const RATING_X = NAME_X + 132;
    makePanel(this, SKILL_PANEL.x, PANELS.top, SKILL_PANEL.w, PANELS.h);
    makeLabel(this, SKILL_PANEL.x + 20, PANELS.top + 22, 'By problem type');
    const all = skillReport(attempts);
    if (!all.length) {
      makeText(this, SKILL_PANEL.x + SKILL_PANEL.w / 2, PANELS.top + PANELS.h / 2 + 8, 'No hits yet.', { fontSize: '17px', color: COLORS.textDim });
      return;
    }
    const more = all.length > SKILL_ROWS;
    const kept = new Set([...all].sort((a, b) => b.attempts - a.attempts).slice(0, more ? SKILL_ROWS - 1 : SKILL_ROWS));
    const rows = all.filter((r) => kept.has(r));
    rows.forEach((r, i) => {
      const y = PANELS.top + 50 + i * 26;
      const [label, color] = RATING_LABELS[r.rating ?? 'none'];
      makeText(this, NAME_X, y, SKILL_NAMES[r.skill], { fontSize: '16px', color: COLORS.textDim }).setOrigin(1, 0.5);
      makeText(this, STAT_X, y, `${r.correct}/${r.attempts}  ·  ${sec(r.avgMs)}`, { fontSize: '16px' }).setOrigin(0, 0.5);
      makeText(this, RATING_X, y, label, { fontSize: '15px', color }).setOrigin(0, 0.5);
    });
    if (more) {
      makeText(this, SKILL_PANEL.x + SKILL_PANEL.w / 2, PANELS.top + 50 + rows.length * 26, `+${all.length - rows.length} more in the downloaded data`, {
        fontSize: '14px',
        color: COLORS.textDim,
      });
    }
  }

  /**
   * The test round is due: offer it first, with playing on as "not now". It is
   * the "after" once a first test has been taken; a player who skipped the first
   * one is offered their "before" here instead.
   */
  private testButtons(): void {
    const kind: TestData['kind'] = loadTests().length ? 'after' : 'before';
    const pitch =
      kind === 'after'
        ? `Time for your "after" test round: ${TEST_LENGTH} typed problems, to see your before and after.`
        : `Get a before and after: take the test round now (${TEST_LENGTH} typed problems), and again after some play.`;
    makeText(this, WIDTH / 2, 536, pitch, { fontSize: '17px', color: COLORS.good });
    const test = () => this.scene.start('Test', { kind } satisfies TestData);
    const later = (scene: string) => () => {
      declineTest();
      this.scene.start(scene);
    };
    makeButton(this, WIDTH / 2 - 260, UI.buttonsY, 'Test round', test, { hotkey: '⏎', primary: true, width: 240 });
    makeButton(this, WIDTH / 2, UI.buttonsY, 'Not now: play', later('Setup'), { hotkey: 'P', width: 240 });
    makeButton(this, WIDTH / 2 + 260, UI.buttonsY, 'Menu', later('Menu'), { hotkey: 'Esc', width: 240 });
    onKey(this, 'ENTER', test);
    onKey(this, 'SPACE', test);
    onKey(this, 'P', later('Setup'));
    onKey(this, 'ESC', later('Menu'));
  }

  private buttons(primaryLabel: string): void {
    const play = () => this.scene.start('Setup');
    const menu = () => this.scene.start('Menu');
    makeButton(this, WIDTH / 2 - 150, UI.buttonsY, primaryLabel, play, { hotkey: '⏎', primary: true });
    makeButton(this, WIDTH / 2 + 150, UI.buttonsY, 'Menu', menu, { hotkey: 'Esc' });
    onKey(this, 'ENTER', play);
    onKey(this, 'SPACE', play);
    onKey(this, 'ESC', menu);
  }
}
