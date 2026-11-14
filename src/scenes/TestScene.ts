import Phaser from 'phaser';
import { COLORS, WIDTH } from '../config';
import { nextForm, scoreTest, testRecommendation, TestRound, TEST_LENGTH } from '../learning/testRound';
import { AnswerPad } from '../ui/answerPad';
import { fitCamera, makeButton, makeText, makeTitle, onKey, UI } from '../ui/widgets';
import {
  declineTest,
  loadPlayMinutes,
  loadTests,
  saveRecommended,
  saveTest,
  type SetupData,
  type TestData,
  type TestResultData,
} from './types';

const DONE_PAUSE_MS = 600;
/** The progress bar under the instructions. */
const BAR = { w: 320, h: 6, y: 170 };

/**
 * The test round (learning/testRound.ts): the same typed-answer problems every
 * time, no feedback until the end. Saved in this browser when finished.
 */
export class TestScene extends Phaser.Scene {
  private round!: TestRound;
  private kind: TestData['kind'] = 'after';
  private pad!: AnswerPad;
  private progressText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Test');
  }

  create(data: TestData): void {
    fitCamera(this);
    this.kind = data.kind;
    this.round = new TestRound(nextForm(loadTests()));

    const why =
      this.kind === 'before'
        ? 'This is your "before": where you are starting from.'
        : 'This is your "after": how much you have improved since your first one.';
    makeTitle(this, 'Test round', why);
    makeText(this, WIDTH / 2, UI.subtitleY + 24, "There's no timer, but your time is noted. Skip any you don't know.", {
      fontSize: '17px',
      color: COLORS.textDim,
    });
    this.progressText = makeText(this, WIDTH / 2, BAR.y - 16, '', { fontSize: '14px', color: COLORS.textDim });
    this.progressBar = this.add.graphics();
    this.pad = new AnswerPad(this, (value, ms) => this.answer(value, ms));

    const stop = () => {
      if (this.round.done) return;
      declineTest();
      this.scene.start('Setup', {} satisfies SetupData);
    };
    const skip = () => {
      if (!this.pad.locked) this.answer(null, this.pad.elapsed());
    };
    makeButton(this, 130, UI.buttonsY, 'Stop', stop, { hotkey: 'Esc', width: 180 });
    makeButton(this, WIDTH - 130, UI.buttonsY, 'Skip', skip, { hotkey: 'S', width: 180 });
    onKey(this, 'ESC', stop);
    onKey(this, 'S', skip);

    this.show();
  }

  private show(): void {
    const p = this.round.current;
    if (!p) return;
    this.progressText.setText(`Problem ${this.round.answers.length + 1} of ${TEST_LENGTH}`);
    this.drawProgress();
    this.pad.show(p.text);
  }

  /** A bar that fills as problems are answered. */
  private drawProgress(): void {
    const g = this.progressBar;
    const left = WIDTH / 2 - BAR.w / 2;
    const done = (this.round.answers.length / TEST_LENGTH) * BAR.w;
    g.clear();
    g.fillStyle(UI.pill, 1);
    g.fillRoundedRect(left, BAR.y, BAR.w, BAR.h, BAR.h / 2);
    if (done >= BAR.h) {
      g.fillStyle(UI.accent, 1);
      g.fillRoundedRect(left, BAR.y, done, BAR.h, BAR.h / 2);
    }
  }

  private answer(given: number | null, ms: number): void {
    if (this.round.done) return;
    this.round.answer(given, ms);
    if (!this.round.done) {
      this.show();
      return;
    }
    const record = this.round.record(loadPlayMinutes());
    saveTest(record);
    saveRecommended(testRecommendation(scoreTest(record)).recommended);
    // A short pause, so the Enter that answered the last problem can't also press "Continue".
    this.pad.locked = true;
    this.progressText.setText('Done!').setColor(COLORS.good);
    this.drawProgress();
    this.time.delayedCall(DONE_PAUSE_MS, () => this.scene.start('TestResult', { kind: this.kind, record } satisfies TestResultData));
  }
}
