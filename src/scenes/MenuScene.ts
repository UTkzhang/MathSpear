import Phaser from 'phaser';
import { COLORS, PRESETS, WIDTH, type PresetKey } from '../config';
import { currentLevel, presetOf } from '../game/run';
import { fitCamera, hasKeyboard, makeButton, makeInfoIcon, makeText, onKey } from '../ui/widgets';
import { levelsText, loadBest, loadPreset, loadSavedRun, type GameData, type ShopData } from './types';

let urlChecked = false;

/**
 * Demo links: ?tutorial, or ?play (optionally &seed=123 for the same problems
 * every time, and &difficulty=expert to skip the difficulty screen's choice).
 */
function gameFromUrl(): GameData | null {
  const params = new URLSearchParams(window.location.search);
  if (params.has('tutorial')) return { mode: 'tutorial' };
  if (!params.has('play') && !params.has('seed')) return null;
  const seed = Number(params.get('seed'));
  const preset = PRESETS.find((p) => p.key === params.get('difficulty'))?.key;
  return { mode: 'play', preset, seed: params.has('seed') && Number.isFinite(seed) ? seed : undefined };
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    fitCamera(this);
    if (!urlChecked) {
      urlChecked = true;
      const fromUrl = gameFromUrl();
      if (fromUrl) {
        this.scene.start('Game', fromUrl);
        return;
      }
    }

    const tutorial = () => this.scene.start('Game', { mode: 'tutorial' } satisfies GameData);
    const play = () => this.scene.start('Setup');
    const data = () => this.scene.start('Data');

    makeText(this, WIDTH / 2, 110, 'Math Spear', { fontSize: '64px', fontStyle: 'bold', color: COLORS.accent });
    makeText(this, WIDTH / 2, 168, 'Hit the enemy whose problem matches the target.', { fontSize: '21px', color: COLORS.textDim });

    // A run in progress comes first: Enter resumes it, and Play becomes "New run".
    const saved = loadSavedRun();
    if (saved) {
      const resume = () =>
        saved.shop
          ? this.scene.start('Shop', { run: saved.run, report: saved.shop } satisfies ShopData)
          : this.scene.start('Game', { mode: 'play', run: saved.run } satisfies GameData);
      const label = `Resume  ·  Level ${currentLevel(saved.run)} (${presetOf(saved.run.preset).name})`;
      makeButton(this, WIDTH / 2, 228, label, resume, { hotkey: '⏎', primary: true, width: 340 });
      makeButton(this, WIDTH / 2, 292, 'New run', play, { hotkey: 'N', width: 340 });
      makeButton(this, WIDTH / 2, 356, 'Tutorial', tutorial, { hotkey: 'T', width: 340 });
      makeText(this, WIDTH / 2, 398, 'A new run replaces the saved one.', { fontSize: '14px', color: COLORS.textDim });
      onKey(this, 'ENTER', resume);
      onKey(this, 'SPACE', resume);
      onKey(this, 'N', play);
    } else {
      makeButton(this, WIDTH / 2, 262, 'Tutorial', tutorial, { hotkey: 'T', width: 340 });
      makeButton(this, WIDTH / 2, 330, 'Play', play, { hotkey: '⏎', primary: true, width: 340 });
      onKey(this, 'ENTER', play);
      onKey(this, 'SPACE', play);
    }
    makeButton(this, WIDTH / 2, 530, 'Your data', data, { hotkey: 'D', width: 340 });
    makeInfoIcon(this, WIDTH / 2 + 170 + 26, 530, 'All your data is stored locally in this browser and stays private to your device. We do not store it online.');
    onKey(this, 'T', tutorial);
    onKey(this, 'D', data);

    const preset: PresetKey | null = loadPreset();
    const best = preset ? loadBest(preset) : 0;
    if (preset && best > 0) {
      const name = PRESETS.find((p) => p.key === preset)?.name;
      makeText(this, WIDTH / 2, 440, `Best run (${name}): ${levelsText(best)} cleared`, { fontSize: '22px', color: COLORS.accent });
    }

    const controls = hasKeyboard(this)
      ? 'Move: WASD / arrow keys, or hold the mouse   ·   Esc: back to menu'
      : 'Move: hold your finger where you want to go';
    makeText(this, WIDTH / 2, 604, controls, { fontSize: '14px', color: COLORS.textDim });
  }
}
