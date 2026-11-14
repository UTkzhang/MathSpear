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

/**
 * A small "!" icon with a tooltip, for extra explanations that would clutter
 * the screen as plain text. The tooltip shows while the mouse is over the icon,
 * and a click or tap pins it open until the next click or tap (so it works on
 * touch screens, which have no hover). It opens above the icon (or below with
 * `below`), kept inside the screen.
 */
export function makeInfoIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tip: string,
  opts: { maxWidth?: number; below?: boolean } = {},
): Phaser.GameObjects.Container {
  const r = 11;
  const ring = scene.add.graphics();
  const mark = makeText(scene, 0, 0, '!', { fontSize: '15px', fontStyle: 'bold', color: COLORS.textDim });
  const draw = (hover: boolean) => {
    ring.clear();
    ring.fillStyle(hover ? 0x324060 : 0x263045, 1);
    ring.fillCircle(0, 0, r);
    ring.lineStyle(2, hover ? 0xe8ecf4 : 0x8b93a7, 1);
    ring.strokeCircle(0, 0, r);
    mark.setColor(hover ? COLORS.text : COLORS.textDim);
  };
  draw(false);

  const icon = scene.add.container(x, y, [ring, mark]);
  icon.setSize(r * 2 + 8, r * 2 + 8);
  icon.setInteractive({ cursor: 'help' });

  const box = makeText(scene, x, opts.below ? y + r + 8 : y - r - 8, tip, {
    fontSize: '14px',
    backgroundColor: '#263045',
    padding: { x: 12, y: 8 },
    wordWrap: { width: opts.maxWidth ?? 360 },
    lineSpacing: 3,
  })
    .setOrigin(0.5, opts.below ? 0 : 1)
    .setDepth(1000)
    .setVisible(false);
  const half = box.width / 2;
  box.x = Math.min(WIDTH - half - 8, Math.max(half + 8, x));

  let hover = false;
  let pinned = false;
  const update = () => {
    draw(hover || pinned);
    box.setVisible(hover || pinned);
  };
  icon.on('pointerover', () => {
    hover = true;
    update();
  });
  icon.on('pointerout', () => {
    hover = false;
    update();
  });
  // A press on the icon pins or unpins it; a press anywhere else closes it.
  scene.input.on('pointerdown', (_: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
    pinned = over.includes(icon) ? !pinned : false;
    update();
  });
  return icon;
}
