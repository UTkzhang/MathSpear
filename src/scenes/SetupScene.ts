import Phaser from 'phaser';
import { COLORS, PRESETS, WIDTH, type PresetKey } from '../config';
import { fitCamera, makeButton, makeText, makeTitle, onKey, UI } from '../ui/widgets';
import { minutesToNextTest, testOffer, TEST_LENGTH } from '../learning/testRound';
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

const ROW_TOP = 194;
const ROW_GAP = 72;
const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'];

/**
 * Pick a difficulty (where the math starts, PRESETS in config.ts). The test
 * round recommends one, but any can be picked. The test round is offered here
 * until the first one is taken (the "before"), then whenever the "after" is due.
 */
export class SetupScene extends Phaser.Scene {
  constructor() {
    super('Setup');
  }

  create(data: SetupData = {}): void {
    fitCamera(this);
    const recommended = data.check?.recommended ?? loadRecommended();
    const last = loadPreset();
    const tests = loadTests();
    const offer = data.check ? null : testOffer(tests, loadPlayMinutes(), loadTestDeclinedAt());

    makeTitle(this, 'Choose a difficulty');
    const lines: [string, string][] = [];
    if (data.check) {
      const bands = data.check.results.map((r) => `${r.name} ${r.passed ? '✓' : '✗'}`).join('     ');
      lines.push([`Test round:  ${bands}`, COLORS.textDim], [`We recommend ${nameOf(data.check.recommended)}. You can pick any.`, COLORS.good]);
    } else if (offer === 'before') {
      lines.push(
        ['Get a before and after: take the test round now, and again after some play.', COLORS.good],
        [`${TEST_LENGTH} typed problems, a few minutes. It also recommends where to start, but you can pick any.`, COLORS.textDim],
      );
    } else if (offer === 'after') {
      lines.push(
        ['Time for your "after" test round: see how much you have improved since the first one.', COLORS.good],
        [recommended ? `Your last test recommended ${nameOf(recommended)}. You can pick any.` : 'You can pick any difficulty.', COLORS.textDim],
      );
    } else {
      const wait = Math.max(1, Math.ceil(minutesToNextTest(tests, loadPlayMinutes(), loadTestDeclinedAt())));
      lines.push(
        [recommended ? `Your test round recommended ${nameOf(recommended)}. You can pick any.` : 'Pick any difficulty.', COLORS.text],
        [`Your next test round comes after about ${wait} more ${wait === 1 ? 'minute' : 'minutes'} of play, for your before and after.`, COLORS.textDim],
      );
    }
    lines.forEach(([text, color], i) => makeText(this, WIDTH / 2, UI.subtitleY + i * 26, text, { fontSize: i === 0 ? '18px' : '16px', color }));

    // Enter starts the test round when it's offered, and the recommended difficulty otherwise.
    const enterStarts = offer ? null : (recommended ?? last ?? PRESETS[0].key);
    PRESETS.forEach((preset, i) => {
      const y = ROW_TOP + i * ROW_GAP;
      const start = () => this.start(preset.key);
      const isDefault = preset.key === enterStarts;
      makeButton(this, WIDTH / 2 - 190, y, preset.name, start, { hotkey: isDefault ? [String(i + 1), '⏎'] : String(i + 1), width: 240, primary: isDefault });
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

    makeText(this, WIDTH / 2, 492, 'Difficulty only changes where the math starts. Gear, gold and enemies work the same on every setting.', {
      fontSize: '15px',
      color: COLORS.textDim,
    });

    const back = () => this.scene.start('Menu');
    onKey(this, 'ESC', back);
    if (offer) {
      const test = () => this.scene.start('Test', { kind: offer } satisfies TestData);
      makeButton(this, WIDTH / 2 - 150, UI.buttonsY, 'Test round', test, { hotkey: ['C', '⏎'], primary: true });
      makeButton(this, WIDTH / 2 + 150, UI.buttonsY, 'Back', back, { hotkey: 'Esc' });
      onKey(this, 'C', test);
      onKey(this, 'ENTER', test);
    } else {
      makeButton(this, WIDTH / 2, UI.buttonsY, 'Back', back, { hotkey: 'Esc' });
      if (enterStarts) onKey(this, 'ENTER', () => this.start(enterStarts));
    }
  }

  private start(preset: PresetKey): void {
    savePreset(preset);
    this.scene.start('Game', { mode: 'play', preset } satisfies GameData);
  }
}

const nameOf = (key: PresetKey) => PRESETS.find((p) => p.key === key)?.name ?? key;
