import Phaser from 'phaser';
import { COLORS, WIDTH } from '../config';
import { nextForm, scoreTest, testRecommendation, TestRound, TEST_LENGTH } from '../learning/testRound';
import { AnswerPad } from '../ui/answerPad';
import { fitCamera, makeButton, makeText, onKey } from '../ui/widgets';
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

/**
 * The test round (learning/testRound.ts): the same typed-answer problems every
 * time, no feedback until the end. Saved in this browser when finished.
 */
export class TestScene extends Phaser.Scene {
  private round!: TestRound;
  private kind: TestData['kind'] = 'after';
  private pad!: AnswerPad;
  private progressText!: Phaser.GameObjects.Text;

  constructor() {
    super('Test');
  }

  create(data: TestData): void {
    fitCamera(this);
    this.kind = data.kind;
    this.round = new TestRound(nextForm(loadTests()));

    makeText(this, WIDTH / 2, 50, 'Test round', { fontSize: '38px', fontStyle: 'bold', color: COLORS.accent });
    const why = this.kind === 'before' ? 'This shows where you are starting from.' : 'This shows how much you have improved.';
    makeText(this, WIDTH / 2, 92, `${why} Type each answer and press Enter.`, { fontSize: '17px', color: COLORS.textDim });
    makeText(this, WIDTH / 2, 116, "There's no timer, but your time is noted. Skip any you don't know.", {
      fontSize: '17px',
      color: COLORS.textDim,
    });
    this.progressText = makeText(this, WIDTH / 2, 158, '', { fontSize: '16px', color: COLORS.textDim });
    this.pad = new AnswerPad(this, (value, ms) => this.answer(value, ms));

    const stop = () => {
      if (this.round.done) return;
      declineTest();
      this.scene.start('Setup', {} satisfies SetupData);
    };
    const skip = () => {
      if (!this.pad.locked) this.answer(null, this.pad.elapsed());
    };
    makeButton(this, 130, 590, 'Stop', stop, { hotkey: 'Esc', width: 180 });
    makeButton(this, WIDTH - 130, 590, 'Skip', skip, { hotkey: 'S', width: 180 });
    onKey(this, 'ESC', stop);
    onKey(this, 'S', skip);

    this.show();
  }

  private show(): void {
    const p = this.round.current;
    if (!p) return;
    this.progressText.setText(`Problem ${this.round.answers.length + 1} of ${TEST_LENGTH}`);
    this.pad.show(p.text);
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
    this.time.delayedCall(DONE_PAUSE_MS, () => this.scene.start('TestResult', { kind: this.kind, record } satisfies TestResultData));
  }
}
