import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootGame } from '../src/game/scenes.ts';
import { STRINGS } from '../src/strings.ts';

beforeAll(() => {
  // jsdom doesn't always implement rAF; startLoop() must not throw regardless.
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16)) as typeof requestAnimationFrame;
  }
  if (typeof globalThis.cancelAnimationFrame !== 'function') {
    globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
  }
});

beforeEach(() => {
  localStorage.clear();
});

function findButtonByText(root: ParentNode, text: string): HTMLButtonElement {
  const btn = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === text);
  if (!btn) throw new Error(`button with text "${text}" not found`);
  return btn;
}

describe('smoke: boot and navigate profile -> levelselect -> playing', () => {
  it('boots without throwing and the playing scene is reachable', () => {
    const canvas = document.createElement('canvas');
    const uiRoot = document.createElement('div');
    document.body.append(canvas, uiRoot);

    let stopLoop: (() => void) | undefined;
    expect(() => {
      stopLoop = bootGame(canvas, uiRoot);
    }).not.toThrow();

    // profile screen: create a new profile
    const nameInput = uiRoot.querySelector('input') as HTMLInputElement;
    nameInput.value = '测试小朋友';
    findButtonByText(uiRoot, STRINGS.profile.confirm).click();

    // level select: the tutorial level (id 0) is always unlocked
    findButtonByText(uiRoot, STRINGS.levelSelect.tierEasy).click();

    // the playing screen (identified by its rain button) should now be visible
    const rainBtn = uiRoot.querySelector('.cs-rain-btn');
    expect(rainBtn).toBeTruthy();
    const playingScreen = rainBtn!.closest('.cs-screen') as HTMLElement;
    expect(playingScreen.style.display).toBe('flex');

    stopLoop?.();
  });
});
