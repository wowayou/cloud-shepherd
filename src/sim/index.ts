import type {
  Cloud,
  Field,
  GameState,
  InputIntent,
  LevelRuntime,
  Mountain,
  RainParticle,
  SimEvent,
  SimModule,
  TierParams,
} from '../types.ts';

// ————————————————————————————————————————————————————————————
// Tunables (all in "world units" — the fixed 720-tall virtual space,
// scaled by worldH so behavior is consistent across device aspect ratios)
// ————————————————————————————————————————————————————————————

const GROUND_Y_FRAC = 0.82;
const SKY_TOP_FRAC = 0.06;
const CLOUD_MARGIN_FRAC = 0.04;
const POINTER_OFFSET_Y_FRAC = 0.07;

const PULL_ACCEL = 22; // 1/s^2, how hard the cloud accelerates toward the pointer
const VEL_DAMPING_PER_SEC = 2.4; // higher = snappier stop, lower = more drift

const ABSORB_BAND_FRAC = 0.11; // how close to the sea surface counts as "flying low"
const RAIN_REACH_FRAC = 0.055; // extra radius beyond a field's own radius that still counts as "over it"

const MOUNTAIN_LEAK_RATE = 14; // water/sec lost while clipping a mountain
const OVERWATER_DRAIN_RATE = 7; // water/sec a flooded field drains back toward its cap
const BLOOM_EASE_PER_SEC = 2.4; // bloom01 animation speed once a field locks in

const PARTICLE_INTERVAL_MS = 90;
const MAX_PARTICLES = 40;
const PARTICLE_GRAVITY = 260;
const PARTICLE_LIFE_S = 0.6;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildInitialState(level: LevelRuntime): GameState {
  const { worldW, worldH } = level;
  const groundY = worldH * GROUND_Y_FRAC;

  const fields: Field[] = level.fields.map((f, id) => ({
    id,
    pos: { x: f.normX * worldW, y: f.normY * worldH },
    radius: f.radius * worldH,
    moisture: 0,
    targetMin: f.targetMin,
    targetMax: f.targetMax,
    state: 'dry',
    bloom01: 0,
  }));

  const mountains: Mountain[] = (level.mountains ?? []).map((m) => ({
    pos: { x: m.normX * worldW, y: m.normY * worldH },
    width: m.width * worldH,
    height: m.height * worldH,
  }));

  const params = level.tiers[level.tier];

  const cloud: Cloud = {
    pos: { x: worldW * 0.5, y: worldH * 0.32 },
    vel: { x: 0, y: 0 },
    water: 0,
    maxWater: params.cloudMaxWater,
    raining: false,
  };

  return {
    phase: 'playing',
    cloud,
    wind: { baseX: params.windBaseX, gustX: 0 },
    fields,
    mountains,
    sea: { x0: 0, x1: level.seaWidthN * worldW, y: groundY },
    particles: [],
    stats: { elapsedMs: 0, waterEvaporated: 0, waterRained: 0, waterWasted: 0 },
    bounds: { w: worldW, h: worldH },
  };
}

function findFieldUnderCloud(fields: Field[], pos: { x: number; y: number }, worldH: number): Field | undefined {
  const reach = worldH * RAIN_REACH_FRAC;
  let best: Field | undefined;
  let bestDist = Infinity;
  for (const f of fields) {
    if (f.state === 'bloom') continue;
    const d = Math.hypot(f.pos.x - pos.x, f.pos.y - pos.y);
    if (d <= f.radius + reach && d < bestDist) {
      best = f;
      bestDist = d;
    }
  }
  return best;
}

function updateField(f: Field, dt: number): SimEvent | null {
  if (f.state === 'bloom') {
    f.bloom01 = Math.min(1, f.bloom01 + BLOOM_EASE_PER_SEC * dt);
    return null;
  }
  if (f.moisture > f.targetMax) {
    f.moisture = Math.max(f.targetMax, f.moisture - OVERWATER_DRAIN_RATE * dt);
    const wasOverwater = f.state === 'overwater';
    f.state = 'overwater';
    return wasOverwater ? null : { type: 'fieldOverwater', fieldId: f.id };
  }
  if (f.moisture >= f.targetMin) {
    f.state = 'bloom';
    f.bloom01 = 0;
    return { type: 'fieldBloom', fieldId: f.id };
  }
  f.state = f.moisture > 0 ? 'growing' : 'dry';
  return null;
}

export function createSim(): SimModule {
  let params: TierParams = {
    windBaseX: 0,
    gustAmp: 0,
    gustPeriodMs: 4000,
    cloudMaxWater: 100,
    evapRate: 30,
    rainRate: 30,
  };
  let rng: () => number = mulberry32(1);
  let rainAccumMs = 0;

  function init(level: LevelRuntime): GameState {
    params = level.tiers[level.tier];
    rng = mulberry32(level.id * 1000 + (level.tier === 'hard' ? 1 : 0) + 1);
    rainAccumMs = 0;
    return buildInitialState(level);
  }

  function step(state: GameState, intent: InputIntent, dtMs: number): SimEvent[] {
    if (state.phase === 'complete') return [];
    const events: SimEvent[] = [];
    const dt = dtMs / 1000;
    const { w: worldW, h: worldH } = state.bounds;
    state.stats.elapsedMs += dtMs;

    // wind
    state.wind.baseX = params.windBaseX;
    state.wind.gustX =
      params.gustAmp > 0
        ? Math.sin((state.stats.elapsedMs / params.gustPeriodMs) * Math.PI * 2) * params.gustAmp
        : 0;
    const windX = state.wind.baseX + state.wind.gustX;

    // pointer pull + wind + damping
    let ax = windX;
    let ay = 0;
    if (intent.pointerActive) {
      const targetX = intent.pointer.x;
      const targetY = intent.pointer.y - worldH * POINTER_OFFSET_Y_FRAC;
      ax += (targetX - state.cloud.pos.x) * PULL_ACCEL;
      ay += (targetY - state.cloud.pos.y) * PULL_ACCEL;
    }
    const damp = Math.max(0, 1 - VEL_DAMPING_PER_SEC * dt);
    state.cloud.vel.x = (state.cloud.vel.x + ax * dt) * damp;
    state.cloud.vel.y = (state.cloud.vel.y + ay * dt) * damp;
    state.cloud.pos.x += state.cloud.vel.x * dt;
    state.cloud.pos.y += state.cloud.vel.y * dt;

    const marginX = worldW * CLOUD_MARGIN_FRAC;
    const marginY = worldH * CLOUD_MARGIN_FRAC;
    state.cloud.pos.x = Math.min(worldW - marginX, Math.max(marginX, state.cloud.pos.x));
    state.cloud.pos.y = Math.min(
      worldH * GROUND_Y_FRAC - marginY,
      Math.max(worldH * SKY_TOP_FRAC, state.cloud.pos.y),
    );

    // sea absorption (must be flying low over the sea band)
    const overSea = state.cloud.pos.x >= state.sea.x0 && state.cloud.pos.x <= state.sea.x1;
    const lowOverSea = state.sea.y - state.cloud.pos.y <= worldH * ABSORB_BAND_FRAC;
    if (overSea && lowOverSea && state.cloud.water < state.cloud.maxWater) {
      const amt = Math.min(params.evapRate * dt, state.cloud.maxWater - state.cloud.water);
      if (amt > 0) {
        state.cloud.water += amt;
        state.stats.waterEvaporated += amt;
        events.push({ type: 'evaporate', amount: amt });
      }
    }

    // mountains: flying at/under the peak height clips and leaks water
    for (const m of state.mountains) {
      const left = m.pos.x - m.width / 2;
      const right = m.pos.x + m.width / 2;
      const topY = m.pos.y - m.height;
      if (
        state.cloud.pos.x >= left &&
        state.cloud.pos.x <= right &&
        state.cloud.pos.y > topY &&
        state.cloud.water > 0
      ) {
        const leak = Math.min(MOUNTAIN_LEAK_RATE * dt, state.cloud.water);
        if (leak > 0) {
          state.cloud.water -= leak;
          state.stats.waterWasted += leak;
          events.push({ type: 'mountainLeak', amount: leak });
        }
      }
    }

    // rain
    const wasRaining = state.cloud.raining;
    state.cloud.raining = intent.rainHeld && state.cloud.water > 0;
    if (state.cloud.raining && !wasRaining) events.push({ type: 'rainStart' });
    if (!state.cloud.raining && wasRaining) events.push({ type: 'rainStop' });

    if (state.cloud.raining) {
      const amt = Math.min(params.rainRate * dt, state.cloud.water);
      state.cloud.water -= amt;
      state.stats.waterRained += amt;
      const field = findFieldUnderCloud(state.fields, state.cloud.pos, worldH);
      if (field) {
        field.moisture += amt;
      } else {
        state.stats.waterWasted += amt;
      }

      rainAccumMs += dtMs;
      while (rainAccumMs >= PARTICLE_INTERVAL_MS) {
        rainAccumMs -= PARTICLE_INTERVAL_MS;
        const particle: RainParticle = {
          pos: { x: state.cloud.pos.x + (rng() - 0.5) * worldH * 0.03, y: state.cloud.pos.y },
          vel: { x: (rng() - 0.5) * 10, y: 40 },
          life: PARTICLE_LIFE_S,
        };
        state.particles.push(particle);
        if (state.particles.length > MAX_PARTICLES) state.particles.shift();
      }
    } else {
      rainAccumMs = 0;
    }

    // particles
    state.particles = state.particles.filter((p) => {
      p.vel.y += PARTICLE_GRAVITY * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
      return p.life > 0;
    });

    // fields
    for (const f of state.fields) {
      const ev = updateField(f, dt);
      if (ev) events.push(ev);
    }

    if (state.phase === 'playing' && state.fields.every((f) => f.state === 'bloom')) {
      state.phase = 'complete';
      events.push({ type: 'levelComplete', stats: { ...state.stats } });
    }

    return events;
  }

  return { init, step };
}
