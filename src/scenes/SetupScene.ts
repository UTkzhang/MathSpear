import Phaser from 'phaser';
import { COLORS, PRESETS, WIDTH, type PresetKey } from '../config';
import { fitCamera, makeButton, makeText, onKey } from '../ui/widgets';
import { beforeTestDue, TEST_LENGTH } from '../learning/testRound';
import {
  levelsText,
  loadBest,
  loadPlayMinutes,
  loadPreset,
  loadRecommended,
  loadTestDeclinedAt,
  loadTests,
  savePreset,
  type GameData,
  type SetupData,
  type TestData,
} from './types';

const ROW_TOP = 196;
const ROW_GAP = 70;
const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'];

/**
 * Pick a difficulty (where the math starts, PRESETS in config.ts). The quick
 * check or the test round recommends one; any can be picked. Before the first
 * game, the test round is offered here in place of the quick check.
 */
export class SetupScene extends Phaser.Scene {
  constructor() {
    super('Setup');
  }

  create(data: SetupData = {}): void {
    fitCamera(this);
    const recommended = data.check?.recommended ?? loadRecommended();
    const last = loadPreset();
    const firstTime = beforeTestDue(loadTests(), loadPlayMinutes(), loadTestDeclinedAt());

    makeText(this, WIDTH / 2, 56, 'Choose a difficulty', { fontSize: '38px', fontStyle: 'bold', color: COLORS.accent });
    if (data.check) {
      const bands = data.check.results.map((r) => `${r.name} ${r.passed ? '✓' : '✗'}`).join('     ');
      makeText(this, WIDTH / 2, 100, `${data.check.from}:  ${bands}`, { fontSize: '18px', color: COLORS.textDim });
      makeText(this, WIDTH / 2, 132, `We recommend ${nameOf(data.check.recommended)}.`, { fontSize: '20px', color: COLORS.good });
    } else if (firstTime) {
      makeText(this, WIDTH / 2, 100, `New here? Take the test round first: ${TEST_LENGTH} typed problems, a few minutes.`, {
        fontSize: '19px',
        color: COLORS.good,
      });
      makeText(this, WIDTH / 2, 130, 'It recommends where to start, and later shows how much you have improved.', {
        fontSize: '17px',
        color: COLORS.textDim,
      });
    } else {
      const line = recommended
        ? `We recommend ${nameOf(recommended)}, from your last check. You can take the quick check again any time.`
        : 'Not sure? Take the quick check: a few problems, about a minute.';
      makeText(this, WIDTH / 2, 110, line, { fontSize: '18px', color: COLORS.textDim });
    }

    PRESETS.forEach((preset, i) => {
      const y = ROW_TOP + i * ROW_GAP;
      const start = () => this.start(preset.key);
      makeButton(this, WIDTH / 2 - 190, y, preset.name, start, { hotkey: String(i + 1), width: 240, primary: preset.key === recommended });
      makeText(this, WIDTH / 2 - 40, y - 10, `${preset.about}  ·  ${preset.example}`, { fontSize: '18px' }).setOrigin(0, 0.5);
      const notes = [
        preset.key === recommended ? 'Recommended' : '',
        preset.key === last ? 'Last played' : '',
        loadBest(preset.key) > 0 ? `Best run: ${levelsText(loadBest(preset.key))}` : '',
      ].filter(Boolean);
      makeText(this, WIDTH / 2 - 40, y + 13, notes.join('  ·  '), {
        fontSize: '14px',
        color: preset.key === recommended ? COLORS.good : COLORS.textDim,
      }).setOrigin(0, 0.5);
      onKey(this, NUMBER_KEYS[i], start);
    });

    const check = firstTime
      ? () => this.scene.start('Test', { kind: 'before' } satisfies TestData)
      : () => this.scene.start('Check');
    const checkLabel = firstTime ? 'Test round' : 'Quick check';
    const back = () => this.scene.start('Menu');
    makeButton(this, WIDTH / 2 - 150, 510, checkLabel, check, { hotkey: 'C', primary: firstTime || !recommended });
    makeButton(this, WIDTH / 2 + 150, 510, 'Back', back, { hotkey: 'Esc' });
    onKey(this, 'C', check);
    onKey(this, 'ESC', back);
    onKey(this, 'ENTER', () => (recommended && !firstTime ? this.start(recommended) : check()));

    makeText(this, WIDTH / 2, 580, 'Difficulty only changes where the math starts. Gear, gold and enemies work the same on every setting.', {
      fontSize: '15px',
      color: COLORS.textDim,
    });
  }

  private start(preset: PresetKey): void {
    savePreset(preset);
    this.scene.start('Game', { mode: 'play', preset } satisfies GameData);
  }
}

const nameOf = (key: PresetKey) => PRESETS.find((p) => p.key === key)?.name ?? key;
