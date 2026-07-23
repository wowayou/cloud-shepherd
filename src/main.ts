import { bootV2 } from './v2/boot.ts';

// Round 17: v2 (closed-water-cycle valley) is the game now. The v1 campaign
// (src/game/scenes.ts + its modules) is archived in the tree, unreferenced —
// see ARCHIVE.md for how to bring it back up. bootV2 with no onExit runs
// standalone (no "← 返回旧版" chrome).
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui-root') as HTMLElement | null;

if (!canvas || !uiRoot) {
  throw new Error('Expected #game-canvas and #ui-root to exist in index.html');
}

bootV2(canvas, uiRoot);
