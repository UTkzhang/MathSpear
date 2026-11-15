import Phaser from 'phaser';
import { COLORS, GAME, GEAR, HEARTS, PLAYER, SHIELD, SPEAR, WIDTH } from '../config';
import { summarize } from '../game/gold';
import { buy, canBuy, currentLevel, levelSpec, price, sinceLastShop, type Item, type RunState } from '../game/run';
import { sizeChanges } from '../learning/adapt';
import { explainLine } from '../learning/explain';
import { SKILL_NAMES, type Skill } from '../learning/problems';
import { fitCamera, makeButton, makeLabel, makePanel, makeText, makeTitle, onKey, UI } from '../ui/widgets';
import type { ResultData, ShopData } from './types';

const CARD_W = 270;
const CARD_H = 242;
const CARD_TOP = 290;
/** The summary of the levels just played: a panel under the title. */
const SUMMARY = { x: WIDTH / 2 - 420, y: 122, w: 840, h: 112, lineH: 24 };
const PREVIEW_SCALE = 1.6;
const HOTKEYS: Record<Item, [string, string]> = { speed: ['ONE', '1'], shield: ['TWO', '2'], heart: ['THREE', '3'] };

const names = (skills: Skill[]) => skills.map((s) => SKILL_NAMES[s]).join(', ');

/**
 * Every GAME.levelsPerShop levels: spend gold on speed, a wider shield, or a
 * heart. It is also the summary of those levels: how they went, one missed
 * problem worked out, and how the problems are changing (learning/adapt.ts).
 */
export class ShopScene extends Phaser.Scene {
  private shop!: ShopData;
  /** True while the scene restarts itself to redraw after a purchase (so it doesn't fade in again). */
  private redraw = false;

  constructor() {
    super('Shop');
  }

  create(data: ShopData): void {
    this.shop = data;
    fitCamera(this, !this.redraw);
    this.redraw = false;
    const run = data.run;
    const next = currentLevel(run);

    makeTitle(
      this,
      `Level ${run.cleared} cleared!`,
      `Next: Level ${next}  ·  ${levelSpec(run).name}  ·  next shop after level ${run.cleared + GAME.levelsPerShop}`,
      COLORS.good,
    );
    this.summary();
    makeText(this, WIDTH / 2, 262, `${run.gold.toLocaleString()} gold to spend`, { fontSize: '24px', fontStyle: 'bold', color: COLORS.gold });

    this.card('speed', WIDTH / 2 - 300);
    this.card('shield', WIDTH / 2);
    this.card('heart', WIDTH / 2 + 300);

    const play = () => this.scene.start('Game', { mode: 'play', run });
    const end = () => this.scene.start('Result', { mode: 'play', run, outOfHearts: false } satisfies ResultData);
    makeButton(this, WIDTH / 2 - 150, UI.buttonsY, `Play Level ${next}`, play, { hotkey: '⏎', primary: true });
    makeButton(this, WIDTH / 2 + 150, UI.buttonsY, 'End run', end, { hotkey: 'Esc' });
    onKey(this, 'ENTER', play);
    onKey(this, 'SPACE', play);
    onKey(this, 'ESC', end);
  }

  /**
   * How the levels since the last shop went, one missed problem worked out, and
   * how the problems are changing (at most four lines, centred in the panel).
   */
  private summary(): void {
    const run = this.shop.run;
    const recent = sinceLastShop(run);
    const s = summarize(recent);
    const first = recent.length ? recent[0].level : run.cleared;
    const time = s.avgResponseMs === null ? '' : `  ·  ${(s.avgResponseMs / 1000).toFixed(1)} s to find a target`;
    const tally = s.wrong ? `${s.correct} right, ${s.wrong} wrong` : `All ${s.correct} right`;
    const lines: [string, string, string][] = [[`${tally}${time}`, COLORS.text, '19px']];

    const missed = recent.filter((a) => !a.correct).pop();
    if (missed) {
      const p = missed.problem;
      lines.push([`Look again: ${p.text} = ${p.answer}.  ${explainLine(p.expr, 80)}`, COLORS.textDim, '16px']);
    }
    const { bigger, smaller } = sizeChanges(this.shop.report);
    const review = this.shop.report.review;
    const changes: [string, string, string][] = [];
    if (bigger.length) changes.push([`Bigger numbers next: ${names(bigger)}`, COLORS.accent, '16px']);
    if (smaller.length) changes.push([`Smaller numbers for now: ${names(smaller)}`, COLORS.textDim, '16px']);
    if (review.length) changes.push([`Back for practice: ${names(review)}`, COLORS.textDim, '16px']);
    if (!changes.length) changes.push(['Keep it up: the problems grow as you get faster.', COLORS.textDim, '16px']);
    lines.push(...changes.slice(0, 2));

    makePanel(this, SUMMARY.x, SUMMARY.y, SUMMARY.w, SUMMARY.h);
    makeLabel(this, SUMMARY.x + 20, SUMMARY.y + 20, first === run.cleared ? `Level ${first}` : `Levels ${first}–${run.cleared}`);
    const top = SUMMARY.y + SUMMARY.h / 2 - ((lines.length - 1) * SUMMARY.lineH) / 2;
    lines.forEach(([text, color, fontSize], i) => makeText(this, WIDTH / 2, top + i * SUMMARY.lineH, text, { fontSize, color }));
  }

  private purchase(item: Item): void {
    if (!buy(this.shop.run, item)) return;
    this.redraw = true;
    this.scene.restart(this.shop);
  }

  private card(item: Item, cx: number): void {
    const run = this.shop.run;
    const top = CARD_TOP;
    makePanel(this, cx - CARD_W / 2, top, CARD_W, CARD_H);

    const { title, stat } = describe(run, item);
    makeText(this, cx, top + 28, title, { fontSize: '22px', fontStyle: 'bold' });
    this.preview(item, cx, top + 90);
    makeText(this, cx, top + 150, stat, { fontSize: '16px', color: COLORS.textDim, align: 'center' });

    // The button says why it can't be pressed: nothing left to buy, or not enough gold.
    const cost = price(run, item);
    const [key, hint] = HOTKEYS[item];
    const label = cost === null ? 'Maxed out' : run.gold < cost ? `Need ${cost} gold` : `Buy  ·  ${cost} gold`;
    const button = makeButton(this, cx, top + 202, label, () => this.purchase(item), { width: CARD_W - 30, hotkey: hint });
    button.setEnabled(canBuy(run, item));
    onKey(this, key, () => this.purchase(item));
  }

  /** A picture of the gear: what you have now, and the next upgrade faded. */
  private preview(item: Item, cx: number, cy: number): void {
    const run = this.shop.run;
    if (item === 'heart') {
      makeText(this, cx, cy, '♥'.repeat(run.hp) + '♡'.repeat(HEARTS.max - run.hp), { fontSize: '40px', color: COLORS.bad });
      return;
    }
    const g = this.add.graphics({ x: cx, y: cy });

    if (item === 'speed') {
      // A meter: one bar per speed level, owned ones lit, the next one faded.
      const n = GEAR.speed.length;
      const w = 18;
      const gap = 8;
      const left = -((n * w + (n - 1) * gap) / 2);
      for (let i = 0; i < n; i++) {
        const h = 16 + i * 9;
        const x = left + i * (w + gap);
        const y = 22 - h;
        const owned = i <= run.speed;
        const nextUp = i === run.speed + 1;
        g.fillStyle(COLORS.player, owned ? 1 : nextUp ? 0.3 : 0);
        g.fillRoundedRect(x, y, w, h, 3);
        g.lineStyle(2, owned ? COLORS.player : 0x3d4a66, 1);
        g.strokeRoundedRect(x, y, w, h, 3);
      }
      return;
    }

    // The player facing right, drawn at game size and scaled up: shield front-left (top right), spear on the right (bottom).
    g.setScale(PREVIEW_SCALE);
    const r = PLAYER.radius;
    const shield = (arcDeg: number, alpha: number) => {
      const mid = -(SHIELD.side * Math.PI) / 180;
      const half = (arcDeg * Math.PI) / 360;
      g.lineStyle(SHIELD.thickness, COLORS.shield, alpha);
      g.beginPath();
      g.arc(0, 0, r + SHIELD.gap, mid - half, mid + half);
      g.strokePath();
    };
    const nextShield = GEAR.shield[run.shield + 1];
    if (nextShield) shield(nextShield.arcDeg, 0.25);
    shield(GEAR.shield[run.shield].arcDeg, 1);
    g.fillStyle(COLORS.player, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(4, COLORS.spear, 1);
    g.lineBetween(-r * 0.5, SPEAR.sideOffset, r + SPEAR.length, SPEAR.sideOffset);
    g.fillStyle(COLORS.spear, 1);
    g.fillCircle(r + SPEAR.length, SPEAR.sideOffset, SPEAR.tipRadius);
  }
}

function describe(run: RunState, item: Item): { title: string; stat: string } {
  switch (item) {
    case 'speed': {
      const cur = GEAR.speed[run.speed];
      const nxt = GEAR.speed[run.speed + 1];
      return {
        title: `Speed  ${run.speed + 1}/${GEAR.speed.length}`,
        stat: nxt ? `Move a bit faster:\n${cur.speed} → ${nxt.speed}` : `Speed ${cur.speed}\nAs fast as it gets!`,
      };
    }
    case 'shield': {
      const cur = GEAR.shield[run.shield];
      const nxt = GEAR.shield[run.shield + 1];
      return {
        title: `Shield  ${run.shield + 1}/${GEAR.shield.length}`,
        stat: nxt ? `Covers more of your front and left:\n${cur.arcDeg}° → ${nxt.arcDeg}°` : `Covers ${cur.arcDeg}°\nThe best shield!`,
      };
    }
    case 'heart':
      return {
        title: `Hearts  ${run.hp}/${HEARTS.max}`,
        stat: run.hp < HEARTS.max ? `One more heart:\n${run.hp} → ${run.hp + 1}` : 'All hearts full',
      };
  }
}
