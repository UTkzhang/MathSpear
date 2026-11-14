import Phaser from 'phaser';
import { CHECK, COLORS, PRESETS, WIDTH } from '../config';
import { QuickCheck } from '../learning/placement';
import { createRng, randomSeed } from '../learning/rng';
import { AnswerPad } from '../ui/answerPad';
import { fitCamera, makeButton, makeText, onKey } from '../ui/widgets';
import { saveRecommended, type SetupData } from './types';

const MAX_PROBLEMS = CHECK.perBand * CHECK.bands.length;

/**
 * The quick check (learning/placement.ts): type the answer to a few problems,
 * then go back to the difficulty screen with a recommendation.
 */
export class CheckScene extends Phaser.Scene {
  private check!: QuickCheck;
  private pad!: AnswerPad;
  private progressText!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;

  constructor() {
    super('Check');
  }

  create(): void {
    fitCamera(this);
    this.check = new QuickCheck(createRng(randomSeed()));

    makeText(this, WIDTH / 2, 56, 'Quick check', { fontSize: '38px', fontStyle: 'bold', color: COLORS.accent });
    makeText(this, WIDTH / 2, 98, 'Type each answer and press Enter. This only picks where you start, so take your time.', {
      fontSize: '17px',
      color: COLORS.textDim,
    });
    this.progressText = makeText(this, WIDTH / 2, 150, '', { fontSize: '16px', color: COLORS.textDim });
    this.feedbackText = makeText(this, WIDTH / 2, 352, '', { fontSize: '22px' });
    this.pad = new AnswerPad(this, (value, ms) => this.submit(value, ms));

    const skip = () => this.scene.start('Setup', {} satisfies SetupData);
    makeButton(this, 130, 590, 'Skip', skip, { hotkey: 'Esc', width: 180 });
    onKey(this, 'ESC', skip);

    this.show();
  }

  private show(): void {
    const p = this.check.current;
    if (!p) return;
    this.progressText.setText(`Problem ${this.check.answers.length + 1}  ·  up to ${MAX_PROBLEMS}`);
    this.pad.show(p.text);
  }

  private submit(value: number, ms: number): void {
    const p = this.check.current;
    if (!p) return;
    const right = this.check.answer(value, ms);
    this.feedbackText.setText(right ? '✓ Right' : `✗  ${p.text} = ${p.answer}`).setColor(right ? COLORS.good : COLORS.bad);
    this.pad.locked = true;
    this.time.delayedCall(CHECK.feedbackMs, () => {
      this.pad.locked = false;
      this.feedbackText.setText('');
      if (this.check.done) this.finish();
      else this.show();
    });
  }

  private finish(): void {
    const recommended = PRESETS[this.check.recommended].key;
    saveRecommended(recommended);
    this.scene.start('Setup', { check: { results: this.check.results, recommended, from: 'Quick check' } } satisfies SetupData);
  }
}
