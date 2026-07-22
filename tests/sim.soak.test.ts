import { describe, expect, it } from 'vitest';
import { createSim } from '../src/sim/index.ts';
import type { InputIntent, LevelRuntime } from '../src/types.ts';

const DT = 1000 / 60;

function makeLevel(overrides: Partial<LevelRuntime> = {}): LevelRuntime {
  return {
    id: 998,
    name: 'soak test',
    seaWidthN: 0.25,
    fields: [{ normX: 0.7, normY: 0.82, targetMin: 30, targetMax: 90, radius: 0.06 }],
    tiers: {
      easy: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
      hard: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
    },
    tier: 'easy',
    worldW: 1200,
    worldH: 720,
    ...overrides,
  };
}

describe('sim: ground soak (round 16)', () => {
  it('rain near a field (not centered) still waters it via ground soak', () => {
    const sim = createSim();
    const level = makeLevel();
    const state = sim.init(level);
    const field = state.fields[0];

    // Full cloud parked to the side of the field — outside RAIN_REACH so the
    // old "must glue to the field" path would waste everything.
    const offset = field.radius + level.worldH * 0.09; // beyond direct reach
    state.cloud.pos = { x: field.pos.x - offset, y: field.pos.y };
    state.cloud.water = 100;

    const intent: InputIntent = {
      pointerActive: true,
      pointer: { ...state.cloud.pos },
      rainHeld: true,
      rainPressure: (1.0 - 0.3) / 1.2,
    };
    for (let i = 0; i < 90; i++) sim.step(state, intent, DT); // 1.5s rain
    // Soaks should exist after rain off-field.
    expect(state.soaks.length).toBeGreaterThan(0);

    // Let soaks bleed into the field.
    const idle: InputIntent = { pointerActive: false, pointer: { x: 0, y: 0 }, rainHeld: false };
    for (let i = 0; i < 120; i++) sim.step(state, idle, DT);

    expect(field.moisture).toBeGreaterThan(5);
  });

  it('direct rain on a field still works (simplest path unchanged)', () => {
    const sim = createSim();
    const level = makeLevel();
    const state = sim.init(level);
    const field = state.fields[0];
    state.cloud.pos = { ...field.pos };
    state.cloud.water = 80;
    const intent: InputIntent = {
      pointerActive: true,
      pointer: { ...field.pos },
      rainHeld: true,
      rainPressure: (1.0 - 0.3) / 1.2,
    };
    for (let i = 0; i < 60; i++) sim.step(state, intent, DT);
    expect(field.moisture).toBeGreaterThan(20);
  });
});
