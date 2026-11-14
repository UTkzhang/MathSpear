import Phaser from 'phaser';
import { COLORS, HEIGHT, RENDER_SCALE, WIDTH } from '../config';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Shared layout and panel colours. Every screen puts its title, the line under
 * it and its bottom row of buttons at the same heights, and draws its panels in
 * the same colours, so nothing jumps around from one screen to the next.
 */
export const UI = {
  titleY: 54,
  subtitleY: 96,
  buttonsY: 584,
  card: 0x1b2130,
  cardEdge: 0x2c3447,
  pill: 0x263045,
  pillEdge: 0x3d4a66,
  accent: 0xffd54f,
  good: 0x81c784,
};

const FADE_MS = 140;

/**
 * Zoom the camera so the scene's WIDTH×HEIGHT world fills the high-resolution
 * canvas, and fade the scene in (pass `fade = false` when a scene restarts
 * itself just to redraw).
 */
export function fitCamera(scene: Phaser.Scene, fade = true): void {
  const camera = scene.cameras.main;
  camera.setZoom(RENDER_SCALE).centerOn(WIDTH / 2, HEIGHT / 2);
  if (fade) camera.fadeIn(FADE_MS, 0x10, 0x13, 0x1c);
}

/** True on a computer with a keyboard: key hints are left out on phones and tablets. */
export const hasKeyboard = (scene: Phaser.Scene): boolean => scene.sys.game.device.os.desktop;

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

/** The screen's title and the line under it. Returns what it drew (the title first). */
export function makeTitle(scene: Phaser.Scene, title: string, subtitle = '', color: string = COLORS.accent): Phaser.GameObjects.Text[] {
  const drawn = [makeText(scene, WIDTH / 2, UI.titleY, title, { fontSize: '38px', fontStyle: 'bold', color })];
  if (subtitle) drawn.push(makeText(scene, WIDTH / 2, UI.subtitleY, subtitle, { fontSize: '17px', color: COLORS.textDim }));
  return drawn;
}

/** A small heading in capitals for a panel or a group of lines ("THE TRICK"). Left-aligned at x. */
export function makeLabel(scene: Phaser.Scene, x: number, y: number, text: string, color: string = COLORS.textDim): Phaser.GameObjects.Text {
  return makeText(scene, x, y, text.toUpperCase(), { fontSize: '12px', fontStyle: 'bold', color, letterSpacing: 1.5 }).setOrigin(0, 0.5);
}

/** A rounded panel behind a group of things. */
export function makePanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; edge?: number; edgeAlpha?: number; radius?: number } = {},
): Phaser.GameObjects.Graphics {
  const radius = opts.radius ?? 12;
  const g = scene.add.graphics();
  g.fillStyle(opts.fill ?? UI.card, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(2, opts.edge ?? UI.cardEdge, opts.edgeAlpha ?? 1);
  g.strokeRoundedRect(x, y, w, h, radius);
  return g;
}

/**
 * Run `action` on a click or tap that both starts and ends on `target`. A mouse
 * button already held down when the target appears (the game moves the player
 * that way) doesn't count when it's let go.
 */
export function onPress(
  target: Phaser.GameObjects.GameObject,
  action: () => void,
  look: { over?: () => void; out?: () => void; down?: () => void } = {},
): void {
  let armed = false;
  target.on('pointerover', () => look.over?.());
  target.on('pointerout', () => {
    armed = false;
    look.out?.();
  });
  target.on('pointerdown', () => {
    armed = true;
    look.down?.();
  });
  target.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    if (!armed) return;
    armed = false;
    // A finger leaves no hover behind; a mouse is still over the target.
    if (pointer.wasTouch) look.out?.();
    else look.over?.();
    action();
  });
}

export interface Button {
  container: Phaser.GameObjects.Container;
  setEnabled(enabled: boolean): void;
}

/**
 * A clickable rounded button. `hotkey` (one key or several) is shown as a hint
 * on computers; the caller binds the keys.
 */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { width?: number; hotkey?: string | string[]; primary?: boolean } = {},
): Button {
  const width = opts.width ?? 260;
  const height = 48;
  const look = opts.primary
    ? { fill: 0x2e7d32, hover: 0x388e3c, press: 0x256628, edge: 0x43a047, key: '#c8e6c9' }
    : { fill: UI.pill, hover: 0x324060, press: 0x1e2637, edge: UI.pillEdge, key: COLORS.textDim };

  const bg = scene.add.graphics();
  const draw = (color: number) => {
    bg.clear();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, look.edge, 1);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
  };
  draw(look.fill);

  const children: Phaser.GameObjects.GameObject[] = [bg, makeText(scene, 0, 0, label, { fontSize: '20px' })];

  // Key hints, as small keycaps along the right edge.
  const keys = hasKeyboard(scene) ? [opts.hotkey ?? []].flat() : [];
  if (keys.length) {
    const caps = scene.add.graphics();
    children.push(caps);
    let right = width / 2 - 10;
    for (const key of [...keys].reverse()) {
      const text = makeText(scene, 0, 0, key, { fontSize: '12px', color: look.key });
      const w = Math.max(22, text.width + 12);
      caps.fillStyle(0x000000, 0.25);
      caps.fillRoundedRect(right - w, -11, w, 22, 5);
      text.setPosition(right - w / 2, 0);
      children.push(text);
      right -= w + 4;
    }
  }

  const container = scene.add.container(x, y, children);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });
  onPress(container, onClick, {
    over: () => {
      draw(look.hover);
      container.setScale(1);
    },
    out: () => {
      draw(look.fill);
      container.setScale(1);
    },
    down: () => {
      draw(look.press);
      container.setScale(0.97);
    },
  });

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
    ring.fillStyle(hover ? 0x324060 : UI.pill, 1);
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
