import { describe, expect, it } from 'vitest';
import { createV2State, stepV2 } from '../src/v2/prototype.ts';

describe('v2 valley prototype', () => {
  it('starts playable with living patches', () => {
    const s = createV2State();
    expect(s.phase).toBe('playing');
    expect(s.patches.length).toBeGreaterThan(3);
    expect(s.patches.every((p) => !p.dead)).toBe(true);
  });

  it('raining on a patch raises its wetness', () => {
    const s = createV2State();
    const target = s.patches[3];
    s.aimX = target.x;
    s.raining = true;
    s.rainPressure = 1;
    const before = target.wet;
    for (let i = 0; i < 60; i++) stepV2(s, 1 / 60);
    expect(target.wet).toBeGreaterThan(before);
  });

  it('neglect under strong sun can kill patches and lose', () => {
    const s = createV2State();
    s.raining = false;
    // Force harsh sun and dry patches.
    for (const p of s.patches) {
      p.wet = 0.05;
      p.stress = 0.9;
    }
    s.day = 0.5;
    s.sun = 1;
    for (let i = 0; i < 300; i++) stepV2(s, 1 / 30);
    expect(s.patches.some((p) => p.dead)).toBe(true);
  });

  it('surviving until dusk wins', () => {
    const s = createV2State();
    // Keep everything soaked; fast-forward day.
    s.raining = true;
    s.rainPressure = 1;
    s.aimX = 0.5;
    for (let i = 0; i < 2000 && s.phase === 'playing'; i++) {
      // Sweep aim so all patches get some rain.
      s.aimX = 0.1 + (i % 20) * 0.04;
      stepV2(s, 0.1);
    }
    expect(s.phase).toBe('won');
  });
});
