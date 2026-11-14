import Phaser from 'phaser';
import { COLORS, PRESETS, TEST, WIDTH } from '../config';
import { scoreTest, testRecommendation, type Score } from '../learning/testRound';
import { fitCamera, makeButton, makeLabel, makePanel, makeText, makeTitle, onKey, UI } from '../ui/widgets';
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

    const when = data.record.playMinutes === 0 ? 'before any play' : `after ${Math.round(data.record.playMinutes)} min of play`;
    makeTitle(this, n === 1 ? 'Your starting point' : 'Test round done', `Test round ${n}  ·  ${when}`);

    makeText(this, WIDTH / 2, 146, `${score.correct} of ${score.asked} right`, { fontSize: '44px', fontStyle: 'bold' });
    makeText(this, WIDTH / 2, 186, `${sec(score.avgMs)} per correct answer`, { fontSize: '18px', color: COLORS.textDim });
    const compare = first
      ? `First test: ${first.correct} of ${first.asked} right, ${sec(first.avgMs)}   →   ${change(score, first)}`
      : `This is your "before". After ${TEST.minutesBetween} minutes of play, take it again to see your before and after.`;
    // Green only for a gain; otherwise neutral (never red: a dip is normal from one day to the next).
    const better = first !== null && (score.correct > first.correct || (score.correct === first.correct && (score.avgMs ?? Infinity) < (first.avgMs ?? Infinity)));
    makeText(this, WIDTH / 2, 222, compare, { fontSize: '17px', color: better ? COLORS.good : first ? COLORS.text : COLORS.textDim });

    // Each section, now and (from the second test on) in the first test: a table centred in its panel.
    const panel = { w: first ? 600 : 440, top: 246, h: 170 };
    const NAME_X = WIDTH / 2 + (first ? -50 : 36);
    const NOW_X = NAME_X + 24;
    const FIRST_X = NOW_X + 166;
    makePanel(this, WIDTH / 2 - panel.w / 2, panel.top, panel.w, panel.h);
    makeLabel(this, NOW_X, panel.top + 24, first ? 'Now' : 'Right  ·  time');
    if (first) makeLabel(this, FIRST_X, panel.top + 24, 'First test');
    score.sections.forEach((s, i) => {
      const y = panel.top + 54 + i * 30;
      makeText(this, NAME_X, y, s.name, { fontSize: '18px', color: COLORS.textDim }).setOrigin(1, 0.5);
      makeText(this, NOW_X, y, scoreText(s), { fontSize: '18px' }).setOrigin(0, 0.5);
      if (first) makeText(this, FIRST_X, y, scoreText(first.sections[i]), { fontSize: '18px', color: COLORS.textDim }).setOrigin(0, 0.5);
    });

    const missed = data.record.answers.filter((a) => !a.correct).map((a) => `${a.text} = ${a.answer}`);
    const shown = missed.slice(0, 5).join('      ') + (missed.length > 5 ? `   (+${missed.length - 5} more)` : '');
    makeText(this, WIDTH / 2, 446, missed.length ? 'To look at again' : 'Every one right!', {
      fontSize: '15px',
      color: missed.length ? COLORS.textDim : COLORS.good,
    });
    if (missed.length) makeText(this, WIDTH / 2, 472, shown, { fontSize: '18px' });

    const rec = testRecommendation(score);
    const name = PRESETS.find((p) => p.key === rec.recommended)?.name;
    makeText(this, WIDTH / 2, 518, `Recommended difficulty: ${name}`, { fontSize: '19px', color: COLORS.good });

    const next = () => this.scene.start('Setup', { check: rec } satisfies SetupData);
    const menu = () => this.scene.start('Menu');
    makeButton(this, WIDTH / 2 - 150, UI.buttonsY, 'Continue', next, { hotkey: '⏎', primary: true });
    makeButton(this, WIDTH / 2 + 150, UI.buttonsY, 'Menu', menu, { hotkey: 'Esc' });
    onKey(this, 'ENTER', next);
    onKey(this, 'SPACE', next);
    onKey(this, 'ESC', menu);
  }
}
