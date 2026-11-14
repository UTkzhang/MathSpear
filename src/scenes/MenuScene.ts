import Phaser from 'phaser';
import { COLORS, GAME, PRESETS, WIDTH, type PresetKey } from '../config';
import { fitCamera, makeButton, makeText, onKey } from '../ui/widgets';
import { levelsText, loadBest, loadPreset, type GameData } from './types';

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

    makeButton(this, WIDTH / 2, 262, 'Tutorial', tutorial, { hotkey: 'T', width: 340 });
    makeButton(this, WIDTH / 2, 330, 'Play', play, { hotkey: '⏎', primary: true, width: 340 });
    makeButton(this, WIDTH / 2, 530, 'Your data', data, { hotkey: 'D', width: 240 });
    onKey(this, 'T', tutorial);
    onKey(this, 'D', data);
    onKey(this, 'ENTER', play);
    onKey(this, 'SPACE', play);

    makeText(this, WIDTH / 2, 400, `A short lesson before each new kind of problem  ·  gold and a shop every ${GAME.levelsPerShop} levels  ·  the math grows with you`, {
      fontSize: '17px',
      color: COLORS.textDim,
    });
    const preset: PresetKey | null = loadPreset();
    const best = preset ? loadBest(preset) : 0;
    if (preset && best > 0) {
      const name = PRESETS.find((p) => p.key === preset)?.name;
      makeText(this, WIDTH / 2, 470, `Best run (${name}): ${levelsText(best)} cleared`, { fontSize: '22px', color: COLORS.accent });
    }

    makeText(this, WIDTH / 2, 604, 'Move: WASD / arrow keys, or hold the mouse   ·   Esc: back to menu', {
      fontSize: '14px',
      color: COLORS.textDim,
    });
  }
}
