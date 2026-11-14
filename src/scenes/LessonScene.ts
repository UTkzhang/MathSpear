import Phaser from 'phaser';
import { COLORS, STAGES, WIDTH, type Lesson } from '../config';
import { currentLevel, markLessonShown, stageIndex, type RunState } from '../game/run';
import { explain, usesStrategy, type Explanation } from '../learning/explain';
import { MARK_END, MARK_START, parseExpr } from '../learning/expr';
import { generateProblem, tierOfSkill, type Problem, type Skill } from '../learning/problems';
import { AnswerPad } from '../ui/answerPad';
import { fitCamera, makeButton, makeLabel, makePanel, makeText, makeTitle, onKey, UI } from '../ui/widgets';
import { loadLessonsSeen, markLessonSeen, type GameData, type LessonData } from './types';

const STEP_MS = 650; // a new line of the worked example every this many ms (first time only)
const READY_MS = 600; // after answering, so the Enter that answered can't also start the level
const ROW_H = 42; // height of one numbered step in a card
const COLUMN_W = 800; // the trick, the example cards and the note all fit this width
const CARD_GAP = 12;
/** What's between the header and the buttons is centred in this part of the screen. */
const BODY = { top: 124, bottom: 522 };
const PRACTICE_NOTE = "Quick practice: try one problem with this trick. It doesn't count.";

// Tints of COLORS.accent and COLORS.good, for the note and the answer.
const NOTE_FILL = 0x2a2616;
const GOOD_FILL = 0x1c2e20;

type Group = Phaser.GameObjects.Container;

/**
 * The short lesson before a stage's first level (Stage.lesson in config.ts):
 *
 *   1. the trick and a worked example, one step at a time
 *   2. quick practice: one problem to try, typed (it doesn't count toward anything)
 *   3. right or not, the steps for that problem, then the level
 *
 * The first time a player meets a lesson the steps appear one by one and Enter
 * goes to the quick practice. Lessons seen before (in this browser) show
 * everything at once, and Enter goes straight to the level. Any lesson can be skipped.
 */
export class LessonScene extends Phaser.Scene {
  private run!: RunState;
  private stage = 0;
  /** What Enter / S / T do right now; changes with the phase. */
  private keys: Partial<Record<'enter' | 'skip' | 'try', () => void>> = {};
  /** Everything drawn for the current phase, cleared when the phase changes. */
  private drawn: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Lesson');
  }

  create(data: LessonData): void {
    fitCamera(this);
    this.run = data.run;
    this.stage = stageIndex(this.run);
    this.keys = {};
    this.drawn = [];
    const stage = STAGES[this.stage];
    const firstTime = !loadLessonsSeen().includes(stage.name);
    markLessonShown(this.run);
    markLessonSeen(stage.name);

    onKey(this, 'ENTER', () => this.keys.enter?.());
    onKey(this, 'SPACE', () => this.keys.enter?.());
    onKey(this, 'S', () => this.keys.skip?.());
    onKey(this, 'ESC', () => this.keys.skip?.());
    onKey(this, 'T', () => this.keys.try?.());

    this.showLesson(stage.name, stage.lesson!, firstTime);
  }

  private get nextLevel(): string {
    return `Level ${currentLevel(this.run)}`;
  }

  private play = (): void => {
    this.scene.start('Game', { mode: 'play', run: this.run } satisfies GameData);
  };

  private header(title: string, subtitle: string, color: string = COLORS.accent): void {
    this.drawn.push(...makeTitle(this, title, subtitle, color));
  }

  private button(x: number, label: string, action: () => void, hotkey: string, primary = false, width?: number): void {
    this.drawn.push(makeButton(this, x, UI.buttonsY, label, action, { hotkey, primary, width }).container);
  }

  /** A group for one phase's content, laid out from y = 0 and then centred in BODY with `place`. */
  private body(): Group {
    const group = this.add.container(0, 0);
    this.drawn.push(group);
    return group;
  }

  private place(body: Group, height: number, bottom = BODY.bottom): void {
    body.setY(BODY.top + Math.max(0, (bottom - BODY.top - height) / 2));
  }

  private clear(): void {
    for (const o of this.drawn) o.destroy();
    this.drawn = [];
  }

  /** Fade and slide a group in after `delay` ms (or show it at once). */
  private reveal(group: Group, delay: number | null): void {
    if (delay === null) return;
    const x = group.x;
    group.setAlpha(0).setX(x + 16);
    this.tweens.add({ targets: group, alpha: 1, x, delay, duration: 280, ease: 'Cubic.easeOut' });
  }

  // ---------------------------------------------------------------- 1. the trick and worked examples

  private showLesson(name: string, lesson: Lesson, firstTime: boolean): void {
    this.header(name, `A quick lesson before ${this.nextLevel}`);
    const body = this.body();
    const left = WIDTH / 2 - COLUMN_W / 2;

    // The trick, in a banner with an accent edge.
    const idea = makeText(this, left + 26, 0, lesson.idea, { fontSize: '19px', wordWrap: { width: COLUMN_W - 52 } }).setOrigin(0, 0);
    const bannerH = idea.height + 48;
    const bar = this.add.graphics();
    bar.fillStyle(UI.accent, 1);
    bar.fillRoundedRect(left, 0, 6, bannerH, { tl: 12, bl: 12, tr: 0, br: 0 });
    body.add([makePanel(this, left, 0, COLUMN_W, bannerH), bar, makeLabel(this, left + 26, 20, 'The trick', COLORS.accent), idea.setY(33)]);

    // One or two worked examples, in cards.
    const n = lesson.examples.length;
    const cardW = n === 1 ? 520 : (COLUMN_W - CARD_GAP) / 2;
    const cardTop = bannerH + 14;
    // The first time, the steps come in one at a time (two examples side by side keep pace with each other).
    const start = firstTime ? 300 : null;
    let steps = 0;
    let height = cardTop;
    lesson.examples.forEach((example, i) => {
      const cx = n === 1 ? WIDTH / 2 : left + cardW / 2 + i * (cardW + CARD_GAP);
      const card = this.exampleCard(body, cx, cardTop, cardW, example, explain(parseExpr(example)), 'Example', lesson.idea);
      card.rows.forEach((row, k) => this.reveal(row, start === null ? null : start + k * STEP_MS));
      steps = Math.max(steps, card.rows.length);
      height = Math.max(height, card.bottom);
    });
    if (lesson.note) {
      const note = this.callout(body, height + 12, lesson.note);
      this.reveal(note.group, start === null ? null : start + steps * STEP_MS);
      height = note.bottom;
    }
    this.place(body, height);

    // Quick practice comes first the first time; after that the level does.
    this.drawn.push(makeText(this, WIDTH / 2, UI.buttonsY - 42, PRACTICE_NOTE, { fontSize: '15px', color: COLORS.textDim }));
    const practice = () => this.showTry();
    if (firstTime) {
      this.button(WIDTH / 2 - 150, 'Quick practice', practice, '⏎', true);
      this.button(WIDTH / 2 + 150, `Skip to ${this.nextLevel}`, this.play, 'S');
      this.keys = { enter: practice, skip: this.play, try: practice };
    } else {
      this.button(WIDTH / 2 - 150, `Play ${this.nextLevel}`, this.play, '⏎', true);
      this.button(WIDTH / 2 + 150, 'Quick practice', practice, 'T');
      this.keys = { enter: this.play, skip: this.play, try: practice };
    }
  }

  /**
   * One worked example in a card: the problem, the trick used on these numbers,
   * numbered steps, and the answer in a green pill. Multi-step problems show the
   * expression at each step with the part being worked out highlighted, and what
   * that part equals next to it. Returns the groups to reveal one at a time, and
   * the card's bottom edge.
   */
  private exampleCard(
    body: Group,
    cx: number,
    top: number,
    w: number,
    text: string,
    how: Explanation,
    label: string,
    idea = '',
  ): { rows: Group[]; bottom: number } {
    const rows: Group[] = [];
    const group = (x: number, y: number, children: Phaser.GameObjects.GameObject[]) => {
      const c = this.add.container(x, y, children);
      rows.push(c);
      return c;
    };
    const heading = [
      makeLabel(this, cx - w / 2 + 20, top + 24, label),
      makeText(this, cx, top + 38, text, { fontSize: '30px', fontStyle: 'bold' }),
    ];

    // The trick on these numbers ("5 is 2 and 3"), unless the lesson's own words already say it.
    let y = top + 74;
    const hint = specifics(how.how, idea);
    if (hint) {
      const line = makeText(this, 0, 0, hint, { fontSize: '17px', color: COLORS.accent, align: 'center', wordWrap: { width: w - 40 } });
      group(cx, y + line.height / 2 - 11, [line]);
      y += line.height + 18;
    } else {
      y += 8;
    }

    // Numbered steps, lined up with each other and centred in the card as a block.
    const lines = how.steps.map((s, i) => (how.before ? this.markedLine(26, how.before[i]) : this.plainLine(26, s)));
    const lineW = Math.max(...lines.map((l) => l.width));
    const results = how.before ? how.steps.map((s) => makeText(this, 26 + lineW + 28, 0, s, { fontSize: '18px', color: COLORS.accent }).setOrigin(0, 0.5)) : [];
    const blockW = 12 + 26 + lineW + (results.length ? 28 + Math.max(...results.map((r) => r.width)) : 0);
    lines.forEach((line, i) => {
      const badge = this.add.graphics();
      badge.fillStyle(UI.pill, 1);
      badge.fillCircle(0, 0, 12);
      badge.lineStyle(2, UI.pillEdge, 1);
      badge.strokeCircle(0, 0, 12);
      const number = makeText(this, 0, 0, String(i + 1), { fontSize: '13px', fontStyle: 'bold', color: COLORS.textDim });
      group(cx - blockW / 2 + 12, y + i * ROW_H, [badge, number, ...line.parts, ...results.slice(i, i + 1)]);
    });

    // The answer, in a green pill.
    const answer = how.steps[how.steps.length - 1].split(' = ')[1];
    const result = makeText(this, 0, 0, `${text} = ${answer}`, { fontSize: '24px', fontStyle: 'bold', color: COLORS.good });
    const pill = this.add.graphics();
    pill.fillStyle(GOOD_FILL, 1);
    pill.fillRoundedRect(-result.width / 2 - 18, -21, result.width + 36, 42, 21);
    pill.lineStyle(2, UI.good, 1);
    pill.strokeRoundedRect(-result.width / 2 - 18, -21, result.width + 36, 42, 21);
    const pillY = y + (how.steps.length - 1) * ROW_H + 52;
    group(cx, pillY, [pill, result]);

    const bottom = pillY + 21 + 18;
    body.add([makePanel(this, cx - w / 2, top, w, bottom - top), ...heading, ...rows]);
    return { rows, bottom };
  }

  /** One step ("8+2 = 10"), laid out from x. */
  private plainLine(x: number, step: string): { parts: Phaser.GameObjects.GameObject[]; width: number } {
    const t = makeText(this, x, 0, step, { fontSize: '24px' }).setOrigin(0, 0.5);
    return { parts: [t], width: t.width };
  }

  /** An expression with its marked part (MARK_START…MARK_END) highlighted, laid out left to right from x. */
  private markedLine(x: number, marked: string): { parts: Phaser.GameObjects.GameObject[]; width: number } {
    const [pre, rest = ''] = marked.split(MARK_START);
    const [hit, post = ''] = rest.split(MARK_END);
    const parts: Phaser.GameObjects.GameObject[] = [];
    let at = x;
    for (const [part, isHit] of [[pre, false], [hit, true], [post, false]] as const) {
      if (!part) continue;
      const t = makeText(this, at, 0, part, { fontSize: '24px', color: isHit ? COLORS.accent : COLORS.text, fontStyle: isHit ? 'bold' : 'normal' }).setOrigin(0, 0.5);
      if (isHit) {
        const g = this.add.graphics();
        g.fillStyle(UI.accent, 0.16);
        g.fillRoundedRect(at - 5, -17, t.width + 10, 34, 8);
        parts.push(g);
      }
      parts.push(t);
      at += t.width;
    }
    return { parts, width: at - x };
  }

  /** A common mistake to watch for, in a yellow-edged box with a "!" mark. */
  private callout(body: Group, top: number, note: string): { group: Group; bottom: number } {
    const w = COLUMN_W;
    const t = makeText(this, -w / 2 + 52, 0, note, { fontSize: '16px', color: COLORS.accent, wordWrap: { width: w - 76 } }).setOrigin(0, 0.5);
    const h = Math.max(44, t.height + 20);
    const g = this.add.graphics();
    g.fillStyle(NOTE_FILL, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.lineStyle(2, UI.accent, 0.7);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.fillStyle(UI.accent, 1);
    g.fillCircle(-w / 2 + 26, 0, 11);
    const mark = makeText(this, -w / 2 + 26, 0, '!', { fontSize: '15px', fontStyle: 'bold', color: '#1b1b1b' });
    const group = this.add.container(WIDTH / 2, top + h / 2, [g, mark, t]);
    body.add(group);
    return { group, bottom: top + h };
  }

  // ---------------------------------------------------------------- 2. quick practice

  private showTry(): void {
    this.clear();
    this.keys = {};
    const stage = STAGES[this.stage];
    const problem = this.practiceProblem(stage.skills);

    this.header('Quick practice', "Try the trick on this one. It doesn't count, so take your time.");
    const pad = new AnswerPad(this, (value, ms) => this.answered(pad, problem, value, ms));
    const skip = () => this.answered(pad, problem, null, pad.elapsed());
    this.button(WIDTH - 130, 'Skip', skip, 'S', false, 180);
    this.keys = { skip };
    pad.show(problem.text);
  }

  /** A problem from the stage at the run's number size, preferring one where the trick actually helps. */
  private practiceProblem(skills: readonly Skill[]): Problem {
    let problem!: Problem;
    for (let i = 0; i < 20; i++) {
      const skill = this.run.rng.pick(skills);
      problem = generateProblem(tierOfSkill(skill), this.run.rng, skill, this.run.difficulty[skill] ?? 0);
      if (usesStrategy(problem.expr)) break;
    }
    return problem;
  }

  // ---------------------------------------------------------------- 3. how it went, then the level

  private answered(pad: AnswerPad, problem: Problem, given: number | null, ms: number): void {
    if (pad.locked) return;
    pad.hide();
    this.clear();
    const correct = given === problem.answer;
    this.run.lessonTries.push({
      stage: this.stage,
      text: problem.text,
      skill: problem.skill,
      answer: problem.answer,
      given,
      correct,
      ms: Math.round(ms),
    });

    if (correct) this.header('✓  Right!', 'Here is one way to think about it.', COLORS.good);
    else if (given === null) this.header('Here is how it works', 'One way to work it out, step by step.');
    else this.header(`Not quite: you typed ${given}`, 'Here is one way to work it out, step by step.');
    const body = this.body();
    const card = this.exampleCard(body, WIDTH / 2, 0, 520, problem.text, explain(problem.expr), 'Step by step');
    this.place(body, card.bottom, UI.buttonsY - 44);

    this.keys = {};
    this.button(WIDTH / 2, `Play ${this.nextLevel}`, this.play, '⏎', true);
    this.time.delayedCall(READY_MS, () => (this.keys = { enter: this.play, skip: this.play }));
  }
}

/**
 * The part of a strategy that is about these numbers. "Make a ten: 5 is 2 and 3"
 * under a lesson that already says "Make a ten: …" is just "5 is 2 and 3", and a
 * strategy the lesson says word for word isn't repeated at all.
 */
function specifics(how: string, idea: string): string {
  if (idea.startsWith(how)) return '';
  const colon = how.indexOf(': ');
  return colon > 0 && idea.startsWith(how.slice(0, colon + 1)) ? how.slice(colon + 2) : how;
}
