/**
 * The untimed tutorial: a short script of steps that teaches moving,
 * aiming with the spear tip, what a wrong hit does, and hearts.
 * It drives the GameScene through a few public methods.
 */
import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import { add, num } from '../learning/expr';
import { generateRoundProblems, problemFromExpr, skillsForTier } from '../learning/problems';
import { createRng } from '../learning/rng';
import type { GameScene } from './GameScene';

type Step = 'move' | 'first-hit' | 'try-wrong' | 'clear-rest' | 'hearts' | 'done';

const MOVE_DISTANCE = 250; // px the player has to move before the next step
const MID_Y = (HUD_HEIGHT + HEIGHT) / 2;

const addFact = (a: number, b: number) => problemFromExpr(add(num(a), num(b)), 'add-facts', 1);

export class Tutorial {
  private step: Step = 'move';
  private moved = 0;
  private hitWrong = false;

  constructor(private readonly scene: GameScene) {}

  start(): void {
    this.go('move');
  }

  onMove(distance: number): void {
    if (this.step !== 'move') return;
    this.moved += distance;
    if (this.moved >= MOVE_DISTANCE) this.go('first-hit');
  }

  onCorrect(cleared: boolean): void {
    switch (this.step) {
      case 'first-hit':
        this.scene.setPrompt('Nice hit! That earned gold, and faster hits earn more.');
        this.later(1400, 'try-wrong');
        break;
      case 'try-wrong':
        // They found the right one before trying a wrong one. Explain anyway.
        this.go('clear-rest');
        break;
      case 'clear-rest':
      case 'hearts':
        if (cleared) this.go(this.step === 'clear-rest' ? 'hearts' : 'done');
        break;
    }
  }

  onWrong(): void {
    this.hitWrong = true;
    if (this.step === 'try-wrong') this.go('clear-rest');
  }

  private later(ms: number, step: Step): void {
    this.scene.time.delayedCall(ms, () => this.go(step));
  }

  private go(step: Step): void {
    this.step = step;
    const s = this.scene;
    switch (step) {
      case 'move':
        s.setPrompt('Move with WASD or the arrow keys.\n(You can also hold the mouse or your finger where you want to go.)');
        break;

      case 'first-hit':
        s.placePlayer(WIDTH * 0.3, MID_Y + 60, { x: 1, y: 0 });
        s.startRound([addFact(2, 3)], { speed: [0, 0], positions: [{ x: WIDTH * 0.75, y: MID_Y - 40 }] });
        s.setPrompt('Your spear is in your right hand and points the way you move. Only its TIP counts.\nFind the enemy whose problem equals 5, and touch it with the tip.');
        break;

      case 'try-wrong': {
        s.placePlayer(WIDTH / 2, MID_Y + 110);
        s.startRound([addFact(4, 4), addFact(2, 5), addFact(3, 6)], {
          speed: [0, 0],
          positions: [
            { x: WIDTH * 0.25, y: MID_Y - 60 },
            { x: WIDTH * 0.5, y: MID_Y - 110 },
            { x: WIDTH * 0.75, y: MID_Y - 60 },
          ],
        });
        s.setTargetAnswer(7);
        s.setPrompt('The target is 7. First, hit a WRONG enemy on purpose (like 4+4)\nto see what happens.');
        break;
      }

      case 'clear-rest':
        s.setEnemySpeed([35, 55]);
        s.setPrompt(
          this.hitWrong
            ? 'A wrong hit shows the real answer and locks your spear for 5 seconds (it turns grey).\nYou blink and can\'t be hurt, but you can\'t hit anything either. Now clear the rest. They move now!'
            : 'Good eye! A wrong hit would show the real answer and lock your spear for 5 seconds.\nNow clear the rest. They move now!',
        );
        break;

      case 'hearts':
        s.hpFloor = 1; // nobody fails the tutorial
        s.startRound(generateRoundProblems(3, createRng(2024), skillsForTier(1)), { speed: [70, 100], chase: 0.5 });
        s.setPrompt('Enemies that touch you cost a heart (top left), but the shield you hold out\nin your left hand blocks them. Keep them on your shield side, and clear these three!');
        break;

      case 'done':
        s.setPrompt('Tutorial complete!');
        s.finishTutorial();
        break;
    }
  }
}
