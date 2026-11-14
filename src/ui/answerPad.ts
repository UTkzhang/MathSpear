import Phaser from 'phaser';
import { COLORS, WIDTH } from '../config';
import { hasKeyboard, makeButton, makeText, UI } from './widgets';

const MAX_DIGITS = 4;
const PROBLEM_Y = 236;
const BOX = { w: 156, h: 78, gap: 20 };
const PAD_STEP = { x: 86, y: 56 };
const PAD_TOP = UI.buttonsY - 3 * PAD_STEP.y; // the bottom row lines up with the screen's buttons
const CARET_MS = 500; // the caret in the answer box blinks on and off this often

/**
 * A problem with a box for the typed answer next to it ("9+3 = ▯"), and an
 * on-screen number pad (for mouse and touch). Used by the test round and the
 * lessons.
 *
 * Typed answers come from the DOM keydown event directly: Phaser's keyboard
 * queue is made for held game keys and can hand the scene the same quick
 * keypress more than once.
 */
export class AnswerPad {
  /** While locked (e.g. during feedback), typing is ignored. */
  locked = false;
  private typed = '';
  private shownAt = 0;
  private boxX = WIDTH / 2;
  private readonly problemText: Phaser.GameObjects.Text;
  private readonly box: Phaser.GameObjects.Graphics;
  private readonly inputText: Phaser.GameObjects.Text;
  private readonly caret: Phaser.GameObjects.Rectangle;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly keys: Phaser.GameObjects.Container[] = [];

  /** `onSubmit` gets the typed number and the time since the problem appeared. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSubmit: (value: number, ms: number) => void,
  ) {
    this.problemText = makeText(scene, WIDTH / 2, PROBLEM_Y, '', { fontSize: '52px', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.box = scene.add.graphics();
    this.inputText = makeText(scene, WIDTH / 2, PROBLEM_Y, '', { fontSize: '46px', fontStyle: 'bold' });
    this.caret = scene.add.rectangle(WIDTH / 2, PROBLEM_Y, 3, 42, UI.accent);
    scene.time.addEvent({ delay: CARET_MS, loop: true, callback: () => this.caret.setAlpha(this.caret.alpha ? 0 : 1) });
    this.hint = makeText(scene, WIDTH / 2, PROBLEM_Y + 70, hasKeyboard(scene) ? 'Type the answer, then press Enter' : 'Tap the answer, then ✓', {
      fontSize: '15px',
      color: COLORS.textDim,
    });

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
    keys.forEach((k, i) => {
      const x = WIDTH / 2 + ((i % 3) - 1) * PAD_STEP.x;
      const y = PAD_TOP + Math.floor(i / 3) * PAD_STEP.y;
      const press = k === '⌫' ? () => this.erase() : k === '✓' ? () => this.submit() : () => this.type(k);
      this.keys.push(makeButton(scene, x, y, k, press, { width: 76, primary: k === '✓' }).container);
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (/^[0-9]$/.test(e.key)) this.type(e.key);
      else if (e.key === 'Backspace') {
        e.preventDefault();
        this.erase();
      } else if (e.key === 'Enter') this.submit();
    };
    window.addEventListener('keydown', onKeyDown);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', onKeyDown));
  }

  /** Show a new problem with an empty answer, and start its clock. */
  show(text: string): void {
    this.problemText.setText(`${text} =`);
    // The problem and the answer box, centred together.
    const left = WIDTH / 2 - (this.problemText.width + BOX.gap + BOX.w) / 2;
    this.problemText.setX(left);
    this.boxX = left + this.problemText.width + BOX.gap + BOX.w / 2;
    this.box.clear();
    this.box.fillStyle(UI.card, 1);
    this.box.fillRoundedRect(this.boxX - BOX.w / 2, PROBLEM_Y - BOX.h / 2, BOX.w, BOX.h, 12);
    this.box.lineStyle(2, UI.accent, 1);
    this.box.strokeRoundedRect(this.boxX - BOX.w / 2, PROBLEM_Y - BOX.h / 2, BOX.w, BOX.h, 12);
    this.typed = '';
    this.render();
    this.shownAt = this.now();
  }

  /** Hide the problem, the answer and the number pad, and stop taking input. */
  hide(): void {
    this.locked = true;
    for (const o of [this.problemText, this.box, this.inputText, this.caret, this.hint, ...this.keys]) o.setVisible(false);
    for (const k of this.keys) k.disableInteractive();
  }

  /** Time since the current problem appeared. */
  elapsed(): number {
    return this.now() - this.shownAt;
  }

  private now(): number {
    return this.scene.game.loop.time;
  }

  private render(): void {
    this.inputText.setText(this.typed).setX(this.boxX);
    // The caret sits just after what's typed (in the middle of an empty box).
    this.caret.setX(this.typed ? this.boxX + this.inputText.width / 2 + 5 : this.boxX);
  }

  private type(digit: string): void {
    if (this.locked || this.typed.length >= MAX_DIGITS) return;
    this.typed = this.typed === '0' ? digit : this.typed + digit;
    this.render();
  }

  private erase(): void {
    if (this.locked) return;
    this.typed = this.typed.slice(0, -1);
    this.render();
  }

  private submit(): void {
    if (this.locked || !this.typed) return;
    this.onSubmit(Number(this.typed), this.elapsed());
  }
}
