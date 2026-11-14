import Phaser from 'phaser';
import { COLORS, WIDTH } from '../config';
import { scoreTest, TEST_LENGTH } from '../learning/testRound';
import { fitCamera, makeButton, makeText, onKey } from '../ui/widgets';
import { exportData, loadPlayMinutes, loadRuns, loadTests, resetData } from './types';

const CONFIRM_MS = 4000; // "Delete everything" has to be pressed twice within this time

/**
 * What Math Spear has saved in this browser (test rounds and the event log of
 * every run), with a download as one JSON file and a way to delete it all.
 * There are no accounts and no server: this file is the only way data leaves the browser.
 */
export class DataScene extends Phaser.Scene {
  private confirmUntil = 0;

  constructor() {
    super('Data');
  }

  create(data: { deleted?: boolean } = {}): void {
    fitCamera(this);
    this.confirmUntil = 0;
    const tests = loadTests();
    const runs = loadRuns();
    const hits = runs.reduce((n, r) => n + r.hits.length, 0);
    const tries = runs.flatMap((r) => r.lessonTries);

    makeText(this, WIDTH / 2, 56, 'Your data', { fontSize: '38px', fontStyle: 'bold', color: COLORS.accent });
    makeText(this, WIDTH / 2, 98, 'Everything is saved only in this browser. Nothing is sent anywhere.', {
      fontSize: '17px',
      color: COLORS.textDim,
    });

    const score = (i: number) => `${scoreTest(tests[i]).correct}/${TEST_LENGTH}`;
    const testLine = tests.length ? `${tests.length}  ·  first ${score(0)}${tests.length > 1 ? `, latest ${score(tests.length - 1)}` : ''}` : 'none yet';
    const rows: [string, string][] = [
      ['Test rounds', testLine],
      ['Runs played', String(runs.length)],
      ['Minutes of play', loadPlayMinutes().toFixed(1)],
      ['Hits saved', String(hits)],
      ['Lesson problems tried', tries.length ? `${tries.length} (${tries.filter((t) => t.correct).length} right)` : 'none yet'],
    ];
    rows.forEach(([label, value], i) => {
      const y = 160 + i * 34;
      makeText(this, WIDTH / 2 - 20, y, label, { fontSize: '19px', color: COLORS.textDim }).setOrigin(1, 0.5);
      makeText(this, WIDTH / 2 + 20, y, value, { fontSize: '19px' }).setOrigin(0, 0.5);
    });

    makeText(
      this,
      WIDTH / 2,
      370,
      'The download is one file with every test round answer and every hit in every run\n' +
        '(the problem, right or wrong, and how long it took). If you are helping test\n' +
        'Math Spear, this is the file to send. Sending it is always your choice.',
      { fontSize: '16px', color: COLORS.textDim, align: 'center', lineSpacing: 4 },
    );
    const status = makeText(this, WIDTH / 2, 438, data.deleted ? 'Deleted. Math Spear has nothing saved in this browser now.' : '', {
      fontSize: '17px',
      color: COLORS.good,
    });

    const download = () => {
      saveJson(`math-spear-data-${new Date().toISOString().slice(0, 10)}.json`, exportData());
      status.setText('Downloaded.').setColor(COLORS.good);
    };
    const remove = () => {
      const now = this.game.loop.time;
      if (now < this.confirmUntil) {
        resetData();
        this.scene.restart({ deleted: true });
        return;
      }
      this.confirmUntil = now + CONFIRM_MS;
      status.setText("Press Delete again to remove everything. This can't be undone.").setColor(COLORS.bad);
    };
    const back = () => this.scene.start('Menu');

    makeButton(this, WIDTH / 2 - 150, 496, 'Download my data', download, { hotkey: 'D', primary: true });
    makeButton(this, WIDTH / 2 + 150, 496, 'Delete everything', remove, { hotkey: 'X' });
    makeButton(this, WIDTH / 2, 572, 'Back', back, { hotkey: 'Esc' });
    onKey(this, 'D', download);
    onKey(this, 'X', remove);
    onKey(this, 'ESC', back);
  }
}

/** Save an object as a .json file through the browser's normal download. */
function saveJson(filename: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
