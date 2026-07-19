import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootGame } from '../src/game/scenes.ts';
import { createUi, factCardText } from '../src/ui/index.ts';
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

  it('completing a level reveals the fact card in its prompt-then-flip state, and a tap flips it', () => {
    // Exercise the fact-card flip directly through the public UiModule
    // surface (mount + setScene + showResult), the same path bootGame drives.
    // End-to-end "drag the cloud to bloom every field" stays a manual browser
    // check per MODULES.md; this test guards the flip's DOM contract headlessly.
    const ui = createUi();
    const root = document.createElement('div');
    document.body.append(root);
    const noop = () => {};
    ui.mount(root, {
      onSelectProfile: noop,
      onCreateProfile: noop,
      onSelectLevel: noop,
      onPause: noop,
      onResume: noop,
      onRetry: noop,
      onNext: noop,
      onQuit: noop,
      onToggleMute: noop,
      onRainHold: noop,
    });

    const fact = factCardText('evaporation');
    ui.setScene('result');
    ui.showResult(3, fact);

    const card = root.querySelector('.cs-fact-card') as HTMLElement;
    expect(card.style.display).toBe('block');

    // Pre-flip: only the prompt is visible (knowThis headline + tapToFlip hint).
    const prompt = card.querySelector('.cs-fact-prompt') as HTMLElement;
    expect(prompt).toBeTruthy();
    expect(prompt.textContent).toContain(STRINGS.result.knowThis);
    expect(prompt.textContent).toContain(STRINGS.result.tapToFlip);
    expect(prompt.textContent).not.toContain(STRINGS.facts.evaporation.text);

    // The full fact text is staged on the element, not yet rendered.
    expect(prompt.dataset.factText).toBe(fact);

    // Tap → flips to the full fact text.
    card.click();
    expect(prompt.textContent).toBe(fact);
    expect(prompt.className).toBe('cs-fact-text');
  });

  it('a level with no fact card hides the fact-card element entirely', () => {
    const ui = createUi();
    const root = document.createElement('div');
    document.body.append(root);
    const noop = () => {};
    ui.mount(root, {
      onSelectProfile: noop, onCreateProfile: noop, onSelectLevel: noop,
      onPause: noop, onResume: noop, onRetry: noop, onNext: noop, onQuit: noop,
      onToggleMute: noop, onRainHold: noop,
    });

    ui.setScene('result');
    ui.showResult(2, undefined);
    const card = root.querySelector('.cs-fact-card') as HTMLElement;
    expect(card.style.display).toBe('none');
  });
});
