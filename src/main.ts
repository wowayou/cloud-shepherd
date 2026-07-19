import { bootGame } from './game/scenes.ts';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui-root') as HTMLElement | null;

if (!canvas || !uiRoot) {
  throw new Error('Expected #game-canvas and #ui-root to exist in index.html');
}

bootGame(canvas, uiRoot);
