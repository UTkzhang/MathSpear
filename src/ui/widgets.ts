import Phaser from 'phaser';
import { COLORS, HEIGHT, RENDER_SCALE, WIDTH } from '../config';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Zoom the camera so the scene's WIDTH×HEIGHT world fills the high-resolution canvas. */
export function fitCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RENDER_SCALE).centerOn(WIDTH / 2, HEIGHT / 2);
}

/** Text rendered at the canvas's real pixel density so it stays sharp. */
export function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, content, { fontFamily: FONT, fontSize: '18px', color: COLORS.text, resolution: RENDER_SCALE, ...style })
    .setOrigin(0.5);
}

export interface Button {
  container: Phaser.GameObjects.Container;
  setEnabled(enabled: boolean): void;
}

/** A clickable rounded button. `hotkey` is shown as a hint, the caller binds it. */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { width?: number; hotkey?: string; primary?: boolean } = {},
): Button {
  const width = opts.width ?? 260;
  const height = 48;
  const fill = opts.primary ? 0x2e7d32 : 0x263045;
  const hover = opts.primary ? 0x388e3c : 0x324060;

  const bg = scene.add.graphics();
  const draw = (color: number) => {
    bg.clear();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, 0x3d4a66, 1);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
  };
  draw(fill);

  const text = makeText(scene, 0, 0, label, { fontSize: '20px' });
  const children: Phaser.GameObjects.GameObject[] = [bg, text];
  if (opts.hotkey) {
    children.push(makeText(scene, width / 2 - 22, 0, opts.hotkey, { fontSize: '14px', color: COLORS.textDim }));
  }

  const container = scene.add.container(x, y, children);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });
  container.on('pointerover', () => draw(hover));
  container.on('pointerout', () => draw(fill));
  container.on('pointerup', onClick);

  return {
    container,
    setEnabled(enabled) {
      container.setAlpha(enabled ? 1 : 0.4);
      if (enabled) container.setInteractive({ useHandCursor: true });
      else container.disableInteractive();
    },
  };
}

/** Bind a keyboard key to an action for the life of the scene. */
export function onKey(scene: Phaser.Scene, key: string, action: () => void): void {
  scene.input.keyboard?.on(`keydown-${key}`, action);
}
