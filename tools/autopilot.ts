/**
 * The autopilot that drives the real deterministic Sim for calibration and for
 * the "every level is completable" test.
 *
 * It steers with a leaky integral controller rather than a hand-derived aim-off,
 * so it compensates for wind and thermal lift the same way a skilled player
 * learns to — without this file needing to know those forces exist. That is the
 * point: the numbers stay honest if the force model changes again.
 *
 * Kept deliberately separate from calibrate.ts so importing it (from tests) has
 * no side effects and prints nothing.
 */
import { createSim } from '../src/sim/index.ts';
import type { Field, GameState, InputIntent, LevelDef, LevelRuntime, Tier } from '../src/types.ts';

const DT = 1000 / 60;
const WORLD_H = 720;
const WORLD_W = 720 * (16 / 9);
const ABSORB_BAND_FRAC = 0.11; // mirrors sim/index.ts
const RAIN_REACH_FRAC = 0.055;
const MAX_MS = 180_000;

function runtimeFor(level: LevelDef, tier: Tier): LevelRuntime {
  return { ...level, tier, worldW: WORLD_W, worldH: WORLD_H };
}

function remainingNeed(state: GameState): number {
  return state.fields
    .filter((f) => f.state !== 'bloom')
    .reduce((sum, f) => sum + Math.max(0, f.targetMin - f.moisture), 0);
}

function nearestThirsty(state: GameState): Field | undefined {
  let best: Field | undefined;
  let bestD = Infinity;
  for (const f of state.fields) {
    if (f.state === 'bloom') continue;
    const d = Math.hypot(f.pos.x - state.cloud.pos.x, f.pos.y - state.cloud.pos.y);
    if (d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

export interface RunResult {
  elapsedMs: number;
  waste: number;
  completed: boolean;
}

export function idealRun(level: LevelDef, tier: Tier): RunResult {
  const sim = createSim();
  const state = sim.init(runtimeFor(level, tier));
  // Integral term: accumulates however much aim-off is needed to hold station
  // against wind/lift. This is the autopilot's whole model of "there are forces".
  //
  // It leaks (0.94) and resets whenever the destination jumps, because a plain
  // accumulator winds up: the offset built while parked over a field is wrong
  // the instant the goal becomes the sea, and unwinding it cost so much time
  // that every multi-trip level read as 30–180s and L10 looked uncompletable.
  const bias = { x: 0, y: 0 };
  let lastDesired: { x: number; y: number } | null = null;

  // Explicit mode with hysteresis. A stateless "is my water less than what's
  // still needed?" test flip-flops: the instant rain starts, `water` and `need`
  // fall together, so the test flips back to "go refill" after one frame and
  // the autopilot ping-pongs between sea and field forever. That made every
  // level needing more than one sea trip (3, 6, 9, 10, 15) read as 30s–180s.
  let mode: 'drink' | 'water' = 'drink';

  while (state.stats.elapsedMs < MAX_MS && state.phase === 'playing') {
    const need = remainingNeed(state);
    const target = nearestThirsty(state);
    let desiredX: number;
    let desiredY: number;
    let wantRain = false;

    const wantForTrip = Math.min(state.cloud.maxWater, need);
    if (mode === 'drink' && (state.cloud.water >= wantForTrip - 0.5 || state.cloud.water >= state.cloud.maxWater - 0.5)) {
      mode = 'water';
    } else if (mode === 'water' && state.cloud.water <= 0.5 && need > 0) {
      mode = 'drink';
    }

    if (mode === 'drink') {
      // drink: sit in the middle of the sea, inside the absorb band
      desiredX = (state.sea.x0 + state.sea.x1) / 2;
      desiredY = state.sea.y - WORLD_H * ABSORB_BAND_FRAC * 0.45;
    } else if (target) {
      // water: hover just above the field, well inside the rain-catch radius
      desiredX = target.pos.x;
      desiredY = target.pos.y - target.radius * 0.5;
      const d = Math.hypot(target.pos.x - state.cloud.pos.x, target.pos.y - state.cloud.pos.y);
      // only open the tap once actually in catch range, so the autopilot never
      // manufactures waste a careful player wouldn't
      wantRain = d <= target.radius + WORLD_H * RAIN_REACH_FRAC * 0.6;
    } else {
      break;
    }

    if (lastDesired && Math.hypot(desiredX - lastDesired.x, desiredY - lastDesired.y) > 50) {
      bias.x = 0;
      bias.y = 0;
    }
    lastDesired = { x: desiredX, y: desiredY };

    bias.x = bias.x * 0.94 + (desiredX - state.cloud.pos.x) * 0.08;
    bias.y = bias.y * 0.94 + (desiredY - state.cloud.pos.y) * 0.08;
    bias.x = Math.max(-600, Math.min(600, bias.x));
    bias.y = Math.max(-600, Math.min(600, bias.y));

    const intent: InputIntent = {
      pointerActive: true,
      pointer: { x: desiredX + bias.x, y: desiredY + bias.y },
      rainHeld: wantRain,
    };
    sim.step(state, intent, DT);
  }

  return {
    elapsedMs: state.stats.elapsedMs,
    waste: state.stats.waterWasted,
    completed: state.phase === 'complete',
  };
}

