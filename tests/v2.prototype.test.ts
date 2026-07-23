import { describe, expect, it } from 'vitest';
import { createV2State, stepV2 } from '../src/v2/prototype.ts';

describe('v2 closed-water-cycle prototype', () => {
  it('starts playable with fields and a conserved total', () => {
    const s = createV2State();
    expect(s.phase).toBe('playing');
    expect(s.fields.length).toBeGreaterThan(3);
    // sea + cloud + fields exactly equals the world total at start.
    const sum = s.sea + s.cloud + s.fields.reduce((a, f) => a + f.moisture, 0);
    expect(sum).toBeCloseTo(s.total, 5);
  });

  it('conserves water across any sequence of actions (the whole point)', () => {
    const s = createV2State();
    const start = s.sea + s.cloud + s.fields.reduce((a, f) => a + f.moisture, 0);
    // Rain hard, sweep aim, sometimes over bare ground, for a while.
    for (let i = 0; i < 1500 && s.phase === 'playing'; i++) {
      s.raining = i % 5 !== 0;
      s.rainPressure = 1;
      s.aimX = 0.05 + (i % 25) * 0.037; // sweeps past fields and off the end
      stepV2(s, 1 / 60);
    }
    const now = s.sea + s.cloud + s.fields.reduce((a, f) => a + f.moisture, 0);
    // No water is ever created or destroyed — only moved.
    expect(now).toBeCloseTo(start, 3);
  });

  it('sun evaporates sea into the cloud (sea drops, cloud rises) when not raining', () => {
    const s = createV2State();
    s.raining = false;
    s.day = 0.5; // noon-ish, strong sun
    s.sun = 1;
    const seaBefore = s.sea;
    const cloudBefore = s.cloud;
    for (let i = 0; i < 120; i++) stepV2(s, 1 / 60);
    expect(s.sea).toBeLessThan(seaBefore);
    expect(s.cloud).toBeGreaterThan(cloudBefore);
  });

  it('pouring on a field raises its moisture and empties the cloud', () => {
    const s = createV2State();
    const target = s.fields[2];
    s.aimX = target.x;
    s.raining = true;
    s.rainPressure = 1;
    const wetBefore = target.moisture;
    const cloudBefore = s.cloud;
    for (let i = 0; i < 30; i++) stepV2(s, 1 / 60);
    expect(target.moisture).toBeGreaterThan(wetBefore);
    expect(s.cloud).toBeLessThan(cloudBefore);
  });

  it('holding the whole valley in its green band wins', () => {
    const s = createV2State();
    // Nudge every field into the happy band and hold there.
    for (const f of s.fields) f.moisture = 12; // between GREEN_LO(7) and GREEN_HI(18)
    for (let i = 0; i < 2000 && s.phase === 'playing'; i++) {
      // Top up whichever field is drifting low, sweeping the aim to it.
      const dry = s.fields.reduce((a, b) => (b.moisture < a.moisture ? b : a));
      s.aimX = dry.x;
      s.raining = dry.moisture < 12;
      s.rainPressure = 1;
      stepV2(s, 1 / 30);
    }
    expect(s.phase).toBe('won');
  });
});
