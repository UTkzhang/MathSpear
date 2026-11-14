import Phaser from 'phaser';
import { COLORS, PRESETS, WIDTH } from '../config';
import { scoreTest, testRecommendation, type Score } from '../learning/testRound';
import { fitCamera, makeButton, makeText, onKey } from '../ui/widgets';
import { loadTests, type SetupData, type TestResultData } from './types';

const sec = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const scoreText = (s: Score) => `${s.correct}/${s.asked}  ·  ${sec(s.avgMs)}`;

/** "4 more right · 2.4 s faster" (now compared with then). */
function change(now: Score, then: Score): string {
  const d = now.correct - then.correct;
  const right = d > 0 ? `${d} more right` : d < 0 ? `${-d} fewer right` : 'same number right';
  if (now.avgMs === null || then.avgMs === null) return right;
  const faster = (then.avgMs - now.avgMs) / 1000;
  return `${right}  ·  ${Math.abs(faster).toFixed(1)} s ${faster >= 0 ? 'faster' : 'slower'}`;
}

/** The test round's results, next to the first test's. */
export class TestResultScene extends Phaser.Scene {
  constructor() {
    super('TestResult');
  }

  create(data: TestResultData): void {
    fitCamera(this);
    const tests = loadTests();
    const n = Math.max(1, tests.length);
    const first = tests.length > 1 ? scoreTest(tests[0]) : null;
    const score = scoreTest(data.record);

    makeText(this, WIDTH / 2, 50, n === 1 ? 'Your starting point' : 'Test round done', {
      fontSize: '38px',
      fontStyle: 'bold',
      color: COLORS.accent,
    });
    const when = data.record.playMinutes === 0 ? 'before any play' : `after ${Math.round(data.record.playMinutes)} min of play`;
    makeText(this, WIDTH / 2, 90, `Test round ${n}  ·  ${when}`, { fontSize: '17px', color: COLORS.textDim });

    makeText(this, WIDTH / 2, 140, `${score.correct} of ${score.asked} right`, { fontSize: '46px', fontStyle: 'bold' });
    makeText(this, WIDTH / 2, 182, `${sec(score.avgMs)} per correct answer`, { fontSize: '19px', color: COLORS.textDim });
    const compare = first
      ? `First test: ${first.correct} of ${first.asked} right, ${sec(first.avgMs)}   →   ${change(score, first)}`
      : 'After some play you get another test round, to see how much you have improved.';
    // Green only for a gain; otherwise neutral (never red: a dip is normal from one day to the next).
    const better = first !== null && (score.correct > first.correct || (score.correct === first.correct && (score.avgMs ?? Infinity) < (first.avgMs ?? Infinity)));
    makeText(this, WIDTH / 2, 220, compare, { fontSize: '18px', color: better ? COLORS.good : first ? COLORS.text : COLORS.textDim });

    const NAME_X = WIDTH / 2 - 60;
    const NOW_X = WIDTH / 2 - 30;
    const FIRST_X = WIDTH / 2 + 150;
    makeText(this, NOW_X, 268, 'Now', { fontSize: '15px', color: COLORS.textDim }).setOrigin(0, 0.5);
    if (first) makeText(this, FIRST_X, 268, 'First test', { fontSize: '15px', color: COLORS.textDim }).setOrigin(0, 0.5);
    score.sections.forEach((s, i) => {
      const y = 298 + i * 32;
      makeText(this, NAME_X, y, s.name, { fontSize: '19px', color: COLORS.textDim }).setOrigin(1, 0.5);
      makeText(this, NOW_X, y, scoreText(s), { fontSize: '19px' }).setOrigin(0, 0.5);
      if (first) makeText(this, FIRST_X, y, scoreText(first.sections[i]), { fontSize: '19px', color: COLORS.textDim }).setOrigin(0, 0.5);
    });

    const missed = data.record.answers.filter((a) => !a.correct).map((a) => `${a.text} = ${a.answer}`);
    if (missed.length) {
      makeText(this, WIDTH / 2, 444, 'To look at again', { fontSize: '16px', color: COLORS.textDim });
      const shown = missed.slice(0, 5).join('      ') + (missed.length > 5 ? `   (+${missed.length - 5} more)` : '');
      makeText(this, WIDTH / 2, 472, shown, { fontSize: '19px' });
    }

    const rec = testRecommendation(score);
    const name = PRESETS.find((p) => p.key === rec.recommended)?.name;
    makeText(this, WIDTH / 2, 516, `Recommended difficulty: ${name}`, { fontSize: '19px', color: COLORS.good });

    const next = () => this.scene.start('Setup', { check: { ...rec, from: 'Test round' } } satisfies SetupData);
    const menu = () => this.scene.start('Menu');
    makeButton(this, WIDTH / 2 - 150, 584, 'Continue', next, { hotkey: '⏎', primary: true });
    makeButton(this, WIDTH / 2 + 150, 584, 'Menu', menu, { hotkey: 'Esc' });
    onKey(this, 'ENTER', next);
    onKey(this, 'SPACE', next);
    onKey(this, 'ESC', menu);
  }
}
