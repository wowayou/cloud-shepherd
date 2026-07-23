import { beforeAll, describe, expect, it } from 'vitest';
import { bootV2 } from '../src/v2/boot.ts';

beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16)) as typeof requestAnimationFrame;
  }
  if (typeof globalThis.cancelAnimationFrame !== 'function') {
    globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
  }
});

describe('v2 boot (main entry, round 17)', () => {
  it('boots standalone without an onExit and shows no "back to v1" chrome', () => {
    const canvas = document.createElement('canvas');
    const uiRoot = document.createElement('div');
    document.body.append(canvas, uiRoot);

    // jsdom canvas has no 2D context; bootV2 must fail soft (return a stop fn),
    // never throw, so a browser without canvas support degrades gracefully.
    let stop: (() => void) | undefined;
    expect(() => {
      stop = bootV2(canvas, uiRoot);
    }).not.toThrow();

    // As the main entry there is no exit target, so no "← 返回旧版" button.
    const back = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('返回旧版'),
    );
    expect(back).toBeUndefined();

    stop?.();
  });
});
