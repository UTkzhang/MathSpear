import Phaser from 'phaser';
import { COLORS, WIDTH } from '../config';
import { makeButton, makeText } from './widgets';

const MAX_DIGITS = 4;
const PAD_TOP = 410;
const PAD_STEP = { x: 86, y: 56 };

/**
 * A problem, the typed answer under it, and an on-screen number pad (for mouse
 * and touch). Used by the test round and the lessons.
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
  private readonly problemText: Phaser.GameObjects.Text;
  private readonly inputText: Phaser.GameObjects.Text;
  private readonly keys: Phaser.GameObjects.Container[] = [];

  /** `onSubmit` gets the typed number and the time since the problem appeared. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSubmit: (value: number, ms: number) => void,
  ) {
    this.problemText = makeText(scene, WIDTH / 2, 215, '', { fontSize: '56px', fontStyle: 'bold' });
    this.inputText = makeText(scene, WIDTH / 2, 290, '', { fontSize: '44px', fontStyle: 'bold' });

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
    this.typed = '';
    this.render();
    this.shownAt = this.now();
  }

  /** Hide the problem, the answer and the number pad, and stop taking input. */
  hide(): void {
    this.locked = true;
    for (const o of [this.problemText, this.inputText, ...this.keys]) o.setVisible(false);
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
    this.inputText.setText(this.typed || '?').setColor(this.typed ? COLORS.text : COLORS.textDim);
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
