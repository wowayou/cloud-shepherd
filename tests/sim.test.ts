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

    // The last bloom happens mid-rain and step() early-returns forever once
    // complete — so the completing step is the only chance to emit rainStop.
    // Without it the audio rain loop plays on into the result screen (real
    // playtest bug). rainStop must arrive no later than levelComplete.
    const rainStopIdx = events.findIndex((e) => e.type === 'rainStop');
    const completeIdx = events.findIndex((e) => e.type === 'levelComplete');
    expect(rainStopIdx).toBeGreaterThanOrEqual(0);
    expect(rainStopIdx).toBeLessThan(completeIdx);
    expect(state.cloud.raining).toBe(false);
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

describe('sim: wind as displacement', () => {
  // Round 7 redefined wind: it offsets the point the cloud settles at, instead
  // of being an acceleration whose visible effect was windX/PULL_ACCEL and so
  // silently shrank whenever the pointer spring was retuned. These lock the new
  // contract: windX IS the world-unit offset, and it stays that way regardless
  // of the spring constants.
  function settleWithWind(windBaseX: number): { offset: number; pointerX: number } {
    const level = makeLevel({
      tier: 'hard',
      tiers: {
        easy: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
        hard: { windBaseX, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
      },
    });
    const sim = createSim();
    const state = sim.init(level);
    const pointerX = level.worldW * 0.5;
    const intent: InputIntent = {
      pointerActive: true,
      pointer: { x: pointerX, y: level.worldH * 0.4 },
      rainHeld: false,
    };
    runSteps(sim, state, intent, 400); // well past the ~0.85s settle time
    return { offset: state.cloud.pos.x - pointerX, pointerX };
  }

  it('parks the held cloud windBaseX world-units downwind of the finger', () => {
    for (const wind of [0, 20, 45, 60]) {
      const { offset } = settleWithWind(wind);
      expect(Math.abs(offset - wind)).toBeLessThan(1);
    }
  });

  it('blows the cloud the other way for negative wind', () => {
    const { offset } = settleWithWind(-40);
    expect(Math.abs(offset - -40)).toBeLessThan(1);
  });

  it('drifts a released cloud downwind, but far slower than the settle-point force would', () => {
    const level = makeLevel({
      tier: 'hard',
      tiers: {
        easy: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
        hard: { windBaseX: 45, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
      },
    });
    const sim = createSim();
    const state = sim.init(level);
    const startX = state.cloud.pos.x;
    runSteps(sim, state, { pointerActive: false, pointer: { x: 0, y: 0 }, rainHeld: false }, 120); // 2s
    const drifted = state.cloud.pos.x - startX;
    expect(drifted).toBeGreaterThan(20); // it really does blow away
    // reusing the settle-point term as raw acceleration would give ~5.6*windX
    // = ~250 u/s here; the dedicated free-drift constant keeps it ~1.25*windX
    expect(Math.abs(state.cloud.vel.x)).toBeLessThan(120);
  });
});

describe('sim: dynamic obstacles', () => {
  it('a thermal lifts the held cloud above the finger', () => {
    const level = makeLevel({
      thermals: [{ normX: 0.5, width: 0.3, height: 0.5, lift: 90 }],
    });
    const sim = createSim();
    const state = sim.init(level);
    const pointerY = level.worldH * 0.6;
    const intent: InputIntent = {
      pointerActive: true,
      pointer: { x: level.worldW * 0.5, y: pointerY },
      rainHeld: false,
    };
    runSteps(sim, state, intent, 400);
    const insideY = state.cloud.pos.y;

    // same drag, no thermal
    const plainSim = createSim();
    const plain = plainSim.init(makeLevel());
    runSteps(plainSim, plain, intent, 400);

    expect(insideY).toBeLessThan(plain.cloud.pos.y - 40); // lifted, y grows downward
  });

  it('a bird strike costs water and counts as waste, on a cooldown', () => {
    const level = makeLevel({
      // parked directly on the cloud's spawn point so the strike is deterministic
      birds: [{ normY: 0.32, speed: 0, radius: 0.05, startN: 0.5 }],
    });
    const sim = createSim();
    const state = sim.init(level);
    state.cloud.water = 100;

    const intent: InputIntent = { pointerActive: false, pointer: { x: 0, y: 0 }, rainHeld: false };
    const first = runSteps(sim, state, intent, 1);
    expect(first.filter((e) => e.type === 'birdHit')).toHaveLength(1);
    expect(state.cloud.water).toBe(91);
    expect(state.stats.waterWasted).toBe(9);

    // still overlapping, but the cooldown suppresses repeat hits
    const during = runSteps(sim, state, intent, 20); // ~333ms
    expect(during.filter((e) => e.type === 'birdHit')).toHaveLength(0);

    const after = runSteps(sim, state, intent, 30); // past the 700ms cooldown
    expect(after.filter((e) => e.type === 'birdHit').length).toBeGreaterThan(0);
  });

  it('a cold front suspends both drinking and raining while inside', () => {
    const level = makeLevel({
      seaWidthN: 1, // sea everywhere, so absorption depends only on the chill
      coldFronts: [{ normX: 0.5, normY: 0.7, radius: 0.3, speed: 0 }],
    });
    const sim = createSim();
    const state = sim.init(level);

    // y 0.85 puts the settled cloud well inside the absorb band; 0.78 lands it
    // exactly on the boundary, which makes the test a coin flip rather than a
    // statement about the chill.
    const insideSeaLevel: InputIntent = {
      pointerActive: true,
      pointer: { x: level.worldW * 0.5, y: level.worldH * 0.85 },
      rainHeld: true,
    };
    const events = runSteps(sim, state, insideSeaLevel, 120);
    expect(events.some((e) => e.type === 'chillEnter')).toBe(true);
    expect(state.cloud.chilled).toBe(true);
    expect(state.cloud.water).toBe(0); // never drank despite skimming the sea
    expect(state.cloud.raining).toBe(false);

    // leave the front — drinking resumes
    const outside: InputIntent = {
      pointerActive: true,
      pointer: { x: level.worldW * 0.95, y: level.worldH * 0.85 },
      rainHeld: false,
    };
    const exitEvents = runSteps(sim, state, outside, 120);
    expect(exitEvents.some((e) => e.type === 'chillExit')).toBe(true);
    expect(state.cloud.water).toBeGreaterThan(0);
  });
});

describe('sim: clamping must not leave phantom velocity', () => {
  // Found while trying to script a playthrough: holding the finger low — which
  // is exactly how you water a field — pins the cloud against its floor while
  // the spring keeps pulling toward an unreachable target below it. Position
  // was clamped but velocity was not, so the cloud sat still on screen while
  // reporting ~137 u/s. Input's auto-rain arms only under NEAR_STILL_SPEED=45,
  // so "hold still over the field" silently did nothing.
  const NEAR_STILL_SPEED = 45; // mirrors input/index.ts

  it('settles to a near-zero speed when the pointer is held below the floor', () => {
    const level = makeLevel();
    const sim = createSim();
    const state = sim.init(level);
    // well below the cloud's lowest reachable position
    const intent: InputIntent = {
      pointerActive: true,
      pointer: { x: level.worldW * 0.7, y: level.worldH * 0.99 },
      rainHeld: false,
    };
    runSteps(sim, state, intent, 400);

    const speed = Math.hypot(state.cloud.vel.x, state.cloud.vel.y);
    expect(speed).toBeLessThan(NEAR_STILL_SPEED);
  });

  it('does the same against the side walls', () => {
    const level = makeLevel();
    const sim = createSim();
    const state = sim.init(level);
    const intent: InputIntent = {
      pointerActive: true,
      pointer: { x: -level.worldW, y: level.worldH * 0.4 },
      rainHeld: false,
    };
    runSteps(sim, state, intent, 400);
    expect(Math.abs(state.cloud.vel.x)).toBeLessThan(NEAR_STILL_SPEED);
  });
});

describe('sim: round 8 — sun, mass-vs-wind, cold-front thaw', () => {
  it('a heavier (fuller) cloud deflects less in the same wind than an empty one', () => {
    const level = makeLevel({
      tier: 'hard',
      tiers: {
        easy: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
        hard: { windBaseX: 45, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
      },
    });

    function settleOffset(startWater: number): number {
      const sim = createSim();
      const state = sim.init(level);
      state.cloud.water = startWater;
      const pointerX = level.worldW * 0.5;
      const intent: InputIntent = { pointerActive: true, pointer: { x: pointerX, y: level.worldH * 0.4 }, rainHeld: false };
      runSteps(sim, state, intent, 400);
      return state.cloud.pos.x - pointerX;
    }

    const emptyOffset = settleOffset(0);
    const fullOffset = settleOffset(120);
    expect(emptyOffset).toBeGreaterThan(0);
    expect(fullOffset).toBeGreaterThan(0);
    expect(fullOffset).toBeLessThan(emptyOffset * 0.7); // meaningfully less deflected
  });

  it('the sun advances over elapsed time and its intensity follows a dawn->noon->dusk arc', () => {
    const level = makeLevel({ tiers: { ...makeLevel().tiers, hard: { ...makeLevel().tiers.hard, dayLengthMs: 4000 } } });
    const sim = createSim();
    const state = sim.init({ ...level, tier: 'hard' });
    const start = state.sun.intensity;
    const intent: InputIntent = { pointerActive: false, pointer: { x: 0, y: 0 }, rainHeld: false };
    runSteps(sim, state, intent, 60); // 1s of a 4s day -> should be brighter (climbing toward noon)
    expect(state.sun.intensity).toBeGreaterThan(start);
    expect(state.sun.intensity).toBeLessThanOrEqual(1);
    expect(state.sun.intensity).toBeGreaterThanOrEqual(0.28); // never fully dark
  });

  it('sun intensity multiplies evaporation rate, not just a cosmetic number', () => {
    const dim = makeLevel({
      tiers: {
        easy: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 999, evapRate: 60, rainRate: 60, dayLengthMs: 1_000_000_000 },
        hard: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 999, evapRate: 60, rainRate: 60, dayLengthMs: 1_000_000_000 },
      },
    });
    const sim = createSim();
    const state = sim.init(dim);
    // day length astronomically long -> dayPhase barely moves -> intensity
    // stays pinned near its DAY_START_PHASE value for the whole run
    const intent: InputIntent = { pointerActive: true, pointer: { x: dim.worldW * 0.15, y: dim.worldH * 0.8 }, rainHeld: false };
    runSteps(sim, state, intent, 60);
    const gained = state.cloud.water;
    expect(gained).toBeLessThan(60 * (60 / 60)); // less than the nominal evapRate*dt would give at intensity 1
    expect(gained).toBeGreaterThan(0);
  });

  it('cold front: the cloud stays frozen for a thaw period after leaving, not instantly', () => {
    const level = makeLevel({
      seaWidthN: 1,
      coldFronts: [{ normX: 0.5, normY: 0.85, radius: 0.3, speed: 0 }],
    });
    const sim = createSim();
    const state = sim.init(level);
    const inside: InputIntent = { pointerActive: true, pointer: { x: level.worldW * 0.5, y: level.worldH * 0.85 }, rainHeld: false };
    runSteps(sim, state, inside, 60);
    expect(state.cloud.chilled).toBe(true);

    // step immediately outside the front
    const outside: InputIntent = { pointerActive: true, pointer: { x: level.worldW * 0.99, y: level.worldH * 0.4 }, rainHeld: false };
    sim.step(state, outside, DT);
    // one frame later: must still be chilled (thaw hasn't elapsed), proving
    // there's a real cost to leaving rather than an instant on/off toggle
    expect(state.cloud.chilled).toBe(true);

    runSteps(sim, state, outside, 200); // well past the thaw window
    expect(state.cloud.chilled).toBe(false);
  });
});
