import { bootGame } from './game/scenes.ts';

// Project wind-down (2026-07-23): the v2 closed-water-cycle prototype was
// retired — its evaporation/runoff read as a fake diagram, not nature, and the
// core "water cycle toy" never cleared the fun bar (see FUN.md / ARCHIVE.md).
// main is switched back to the v1 campaign, which is teachable-but-plain but at
// least does not misrepresent the physics. v2 source stays in src/v2/ for
// reference. Next exploration (magnetism, possibly Three.js) starts fresh.
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui-root') as HTMLElement | null;

if (!canvas || !uiRoot) {
  throw new Error('Expected #game-canvas and #ui-root to exist in index.html');
}

bootGame(canvas, uiRoot);
