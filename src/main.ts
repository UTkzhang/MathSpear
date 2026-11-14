import Phaser from 'phaser';
import { COLORS, HEIGHT, RENDER_SCALE, WIDTH } from './config';
import { CheckScene } from './scenes/CheckScene';
import { DataScene } from './scenes/DataScene';
import { GameScene } from './scenes/GameScene';
import { LessonScene } from './scenes/LessonScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { SetupScene } from './scenes/SetupScene';
import { ShopScene } from './scenes/ShopScene';
import { TestResultScene } from './scenes/TestResultScene';
import { TestScene } from './scenes/TestScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Canvas at real screen resolution; each scene zooms its camera by RENDER_SCALE.
  width: WIDTH * RENDER_SCALE,
  height: HEIGHT * RENDER_SCALE,
  backgroundColor: COLORS.background,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, SetupScene, CheckScene, TestScene, TestResultScene, LessonScene, GameScene, ShopScene, ResultScene, DataScene],
});

// Dev builds only: expose the game for console debugging.
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
