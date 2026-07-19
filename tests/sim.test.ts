import { describe, expect, it } from 'vitest';
import { createSim } from '../src/sim/index.ts';
import type { GameState, InputIntent, LevelRuntime, SimEvent } from '../src/types.ts';

const DT = 1000 / 60;

function makeLevel(overrides: Partial<LevelRuntime> = {}): LevelRuntime {
  return {
    id: 999,
    name: 'test level',
    seaWidthN: 0.3,
    fields: [{ normX: 0.7, normY: 0.82, targetMin: 40, targetMax: 100, radius: 0.06 }],
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

function runSteps(
  sim: ReturnType<typeof createSim>,
  state: GameState,
  intent: InputIntent,
  steps: number,
): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    all.push(...sim.step(state, intent, DT));
  }
  return all;
}

describe('sim: init', () => {
  it('starts dry, empty, and playing', () => {
    const sim = createSim();
    const state = sim.init(makeLevel());
    expect(state.phase).toBe('playing');
    expect(state.cloud.water).toBe(0);
    expect(state.fields[0].state).toBe('dry');
    expect(state.fields[0].moisture).toBe(0);
  });
});

describe('sim: absorbing over the sea', () => {
  it('fills the cloud with water when flown low over the sea', () => {
    const sim = createSim();
    const level = makeLevel();
    const state = sim.init(level);
    const intent: InputIntent = { pointerActive: true, pointer: { x: level.worldW * 0.15, y: level.worldH * 0.8 }, rainHeld: false };

    const events = runSteps(sim, state, intent, 400);

    expect(state.cloud.water).toBeGreaterThan(level.tiers.easy.cloudMaxWater * 0.95);
    expect(state.cloud.water).toBeLessThanOrEqual(level.tiers.easy.cloudMaxWater);
    expect(events.some((e) => e.type === 'evaporate')).toBe(true);
    expect(state.stats.waterEvaporated).toBeGreaterThan(0);
  });

  it('never overfills past cloudMaxWater', () => {
    const sim = createSim();
    const level = makeLevel();
    const state = sim.init(level);
    const intent: InputIntent = { pointerActive: true, pointer: { x: level.worldW * 0.15, y: level.worldH * 0.8 }, rainHeld: false };

    runSteps(sim, state, intent, 900);

    expect(state.cloud.water).toBeLessThanOrEqual(level.tiers.easy.cloudMaxWater);
  });
});

describe('sim: raining onto a field', () => {
  it('raises field moisture and blooms once inside the target range, then completes the level', () => {
    const sim = createSim();
    const level = makeLevel();
    const state = sim.init(level);
    const field = state.fields[0];

    // skip travel: place a full cloud directly over the field
    state.cloud.pos = { ...field.pos };
    state.cloud.water = state.cloud.maxWater;

    const intent: InputIntent = { pointerActive: true, pointer: { ...field.pos }, rainHeld: true };
    const events = runSteps(sim, state, intent, 300);

    expect(field.state).toBe('bloom');
    expect(field.moisture).toBeGreaterThanOrEqual(field.targetMin);
    expect(field.moisture).toBeLessThanOrEqual(field.targetMax);
    expect(events.some((e) => e.type === 'fieldBloom' && e.fieldId === field.id)).toBe(true);
    expect(events.some((e) => e.type === 'levelComplete')).toBe(true);
    expect(state.phase).toBe('complete');
  });

  it('wastes rain that falls with no field underneath', () => {
    const sim = createSim();
    const level = makeLevel();
    const state = sim.init(level);

    // cloud is full but far from any field
    state.cloud.pos = { x: level.worldW * 0.15, y: level.worldH * 0.5 };
    state.cloud.water = state.cloud.maxWater;

    const intent: InputIntent = { pointerActive: true, pointer: { ...state.cloud.pos }, rainHeld: true };
    runSteps(sim, state, intent, 30);

    expect(state.stats.waterWasted).toBeGreaterThan(0);
    expect(state.fields[0].moisture).toBe(0);
  });
});

describe('sim: overwatering is recoverable, never a failure', () => {
  it('drains a flooded field back into range and still blooms', () => {
    const sim = createSim();
    // rainRate is deliberately huge relative to the target window so a
    // single step of rain overshoots it in one jump (rather than trickling
    // through it), giving a deterministic overwater trigger to test against.
    const level = makeLevel({
      fields: [{ normX: 0.7, normY: 0.82, targetMin: 10, targetMax: 15, radius: 0.06 }],
      tiers: {
        easy: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 200, evapRate: 60, rainRate: 3000 },
        hard: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 200, evapRate: 60, rainRate: 3000 },
      },
    });
    const state = sim.init(level);
    const field = state.fields[0];
    state.cloud.pos = { ...field.pos };
    state.cloud.water = state.cloud.maxWater;

    const rainIntent: InputIntent = { pointerActive: true, pointer: { ...field.pos }, rainHeld: true };
    const overwaterEvents = runSteps(sim, state, rainIntent, 1);
    expect(overwaterEvents.some((e) => e.type === 'fieldOverwater')).toBe(true);
    expect(field.state).toBe('overwater');
    expect(field.moisture).toBeGreaterThan(field.targetMax);

    // stop raining, let the field drain back into range on its own
    const idleIntent: InputIntent = { pointerActive: false, pointer: { x: 0, y: 0 }, rainHeld: false };
    const recoveryEvents = runSteps(sim, state, idleIntent, 500);

    expect(field.state).toBe('bloom');
    expect(recoveryEvents.some((e) => e.type === 'fieldBloom')).toBe(true);
  });
});

describe('sim: mountains leak water when flown low across them', () => {
  it('drains cloud water while clipping a mountain', () => {
    const sim = createSim();
    const level = makeLevel({
      mountains: [{ normX: 0.5, normY: 0.82, width: 0.2, height: 0.3 }],
    });
    const state = sim.init(level);
    const mountain = state.mountains[0];
    state.cloud.water = state.cloud.maxWater;
    // low altitude, right in the middle of the mountain's span
    state.cloud.pos = { x: mountain.pos.x, y: mountain.pos.y - mountain.height * 0.2 };

    const intent: InputIntent = { pointerActive: false, pointer: { x: 0, y: 0 }, rainHeld: false };
    const events = runSteps(sim, state, intent, 10);

    expect(events.some((e) => e.type === 'mountainLeak')).toBe(true);
    expect(state.stats.waterWasted).toBeGreaterThan(0);
    expect(state.cloud.water).toBeLessThan(state.cloud.maxWater);
  });
});

describe('sim: determinism', () => {
  it('produces identical states from identical (init, intent-sequence) input', () => {
    const level = makeLevel();
    const intents: InputIntent[] = [];
    for (let i = 0; i < 250; i++) {
      intents.push({
        pointerActive: true,
        pointer: { x: level.worldW * (0.15 + (i % 50) * 0.01), y: level.worldH * 0.6 },
        rainHeld: i % 3 === 0,
      });
    }

    function run(): GameState {
      const sim = createSim();
      const state = sim.init(level);
      for (const intent of intents) sim.step(state, intent, DT);
      return state;
    }

    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });
});
