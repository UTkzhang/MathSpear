import Phaser from 'phaser';
import { COLORS, STAGES, WIDTH, type Lesson } from '../config';
import { currentLevel, markLessonShown, stageIndex, type RunState } from '../game/run';
import { explain, usesStrategy, type Explanation } from '../learning/explain';
import { parseExpr } from '../learning/expr';
import { generateProblem, tierOfSkill, type Problem, type Skill } from '../learning/problems';
import { AnswerPad } from '../ui/answerPad';
import { fitCamera, makeButton, makeText, onKey } from '../ui/widgets';
import { loadLessonsSeen, markLessonSeen, type GameData, type LessonData } from './types';

const STEP_MS = 650; // a new line of the worked example every this many ms (first time only)
const READY_MS = 600; // after answering, so the Enter that answered can't also start the level
const COLUMN_W = 400;

/**
 * The short lesson before a stage's first level (Stage.lesson in config.ts):
 *
 *   1. the strategy and a worked example, one step at a time
 *   2. one problem to try, typed (it doesn't count toward anything)
 *   3. right or not, the steps for that problem, then the level
 *
 * The first time a player meets a lesson the steps appear one by one and Enter
 * goes to the problem to try. Lessons seen before (in this browser) show
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

  private text(x: number, y: number, content: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    const t = makeText(this, x, y, content, style);
    this.drawn.push(t);
    return t;
  }

  private clear(): void {
    for (const o of this.drawn) o.destroy();
    this.drawn = [];
  }

  // ---------------------------------------------------------------- 1. the strategy and worked examples

  private showLesson(name: string, lesson: Lesson, firstTime: boolean): void {
    this.text(WIDTH / 2, 40, `${this.nextLevel}  ·  new problems`, { fontSize: '16px', color: COLORS.textDim });
    this.text(WIDTH / 2, 78, name, { fontSize: '38px', fontStyle: 'bold', color: COLORS.accent });
    this.text(WIDTH / 2, 128, lesson.idea, { fontSize: '20px', align: 'center', wordWrap: { width: 820 } });

    const n = lesson.examples.length;
    let delay = 0;
    lesson.examples.forEach((example, i) => {
      const x = n === 1 ? WIDTH / 2 : WIDTH / 2 + (i === 0 ? -1 : 1) * (COLUMN_W / 2 + 20);
      const expr = parseExpr(example);
      const lines = this.workedExample(x, 196, example, explain(expr), firstTime, lesson.idea);
      for (const line of lines) {
        if (firstTime) {
          delay += STEP_MS;
          this.time.delayedCall(delay, () => line.setVisible(true));
        }
      }
    });
    if (lesson.note) {
      const note = this.text(WIDTH / 2, 478, lesson.note, { fontSize: '17px', color: COLORS.accent, align: 'center', wordWrap: { width: 820 } });
      if (firstTime) {
        note.setVisible(false);
        this.time.delayedCall(delay + STEP_MS, () => note.setVisible(true));
      }
    }

    const tryOne = () => this.showTry();
    if (firstTime) {
      this.drawn.push(makeButton(this, WIDTH / 2 - 150, 560, 'Your turn', tryOne, { hotkey: '⏎', primary: true }).container);
      this.drawn.push(makeButton(this, WIDTH / 2 + 150, 560, `Skip to ${this.nextLevel}`, this.play, { hotkey: 'S' }).container);
      this.keys = { enter: tryOne, skip: this.play };
    } else {
      this.drawn.push(makeButton(this, WIDTH / 2 - 150, 560, `Play ${this.nextLevel}`, this.play, { hotkey: '⏎', primary: true }).container);
      this.drawn.push(makeButton(this, WIDTH / 2 + 150, 560, 'Try one first', tryOne, { hotkey: 'T' }).container);
      this.keys = { enter: this.play, skip: this.play, try: tryOne };
    }
  }

  /**
   * One worked example in a column: the problem, the strategy, the steps, the answer.
   * Returns the lines to reveal one at a time (hidden if `hidden`). The strategy
   * line is left out when the lesson's idea already says it.
   */
  private workedExample(x: number, top: number, text: string, how: Explanation, hidden: boolean, idea = ''): Phaser.GameObjects.Text[] {
    this.text(x, top, `${text} = ?`, { fontSize: '34px', fontStyle: 'bold' });
    const lines: Phaser.GameObjects.Text[] = [];
    if (!idea.startsWith(how.how)) {
      lines.push(this.text(x, top + 44, how.how, { fontSize: '17px', color: COLORS.textDim, align: 'center', wordWrap: { width: COLUMN_W } }));
    }
    how.steps.forEach((s, i) => {
      const rest = how.after && i < how.steps.length - 1 ? `     →  ${how.after[i]}` : '';
      lines.push(this.text(x, top + 92 + i * 40, s + rest, { fontSize: '24px' }));
    });
    const answer = how.steps[how.steps.length - 1].split(' = ')[1];
    lines.push(this.text(x, top + 100 + how.steps.length * 40, `${text} = ${answer}`, { fontSize: '26px', fontStyle: 'bold', color: COLORS.good }));
    if (hidden) for (const l of lines) l.setVisible(false);
    return lines;
  }

  // ---------------------------------------------------------------- 2. one to try

  private showTry(): void {
    this.clear();
    this.keys = {};
    const stage = STAGES[this.stage];
    const problem = this.practiceProblem(stage.skills);

    this.text(WIDTH / 2, 56, 'Your turn', { fontSize: '38px', fontStyle: 'bold', color: COLORS.accent });
    this.text(WIDTH / 2, 98, `Try the trick on this one. Type the answer and press Enter. It doesn't count, so take your time.`, {
      fontSize: '17px',
      color: COLORS.textDim,
    });
    const pad = new AnswerPad(this, (value, ms) => this.answered(pad, problem, value, ms));
    const skip = () => this.answered(pad, problem, null, pad.elapsed());
    this.drawn.push(makeButton(this, 130, 590, 'Skip', skip, { hotkey: 'S', width: 180 }).container);
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

    const title = correct ? '✓  Right!' : given === null ? 'Here is how it works' : `Not quite: you typed ${given}`;
    this.text(WIDTH / 2, 70, title, { fontSize: '36px', fontStyle: 'bold', color: correct ? COLORS.good : COLORS.accent });
    this.text(WIDTH / 2, 112, correct ? 'One way to think about it:' : 'Here are the steps:', { fontSize: '17px', color: COLORS.textDim });
    this.workedExample(WIDTH / 2, 180, problem.text, explain(problem.expr), false);

    this.keys = {};
    const button = makeButton(this, WIDTH / 2, 560, `Play ${this.nextLevel}`, this.play, { hotkey: '⏎', primary: true });
    this.drawn.push(button.container);
    this.time.delayedCall(READY_MS, () => (this.keys = { enter: this.play, skip: this.play }));
  }
}
