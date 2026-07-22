import type {
  Bird,
  Cloud,
  ColdFront,
  Field,
  GameState,
  InputIntent,
  LevelRuntime,
  Mountain,
  RainParticle,
  SeaRegion,
  SimEvent,
  SimModule,
  Thermal,
  TierParams,
} from '../types.ts';

// Mountain is used by findMountainUnder / findRunoffDestination helpers.

// ————————————————————————————————————————————————————————————
// Tunables (all in "world units" — the fixed 720-tall virtual space,
// scaled by worldH so behavior is consistent across device aspect ratios)
// ————————————————————————————————————————————————————————————

const GROUND_Y_FRAC = 0.82;
const SKY_TOP_FRAC = 0.06;
const CLOUD_MARGIN_FRAC = 0.04;
const POINTER_OFFSET_Y_FRAC = 0.07;

// Cloud-follow spring-damper. The update below is equivalent to the ODE
//   x'' + (VEL_DAMPING_PER_SEC)·x' + (PULL_ACCEL)·x = PULL_ACCEL·target,
// so the perceived feel is set by two derived quantities:
//   natural freq  ω = √PULL_ACCEL              (how fast it reacts / low lag)
//   damping ratio ζ = VEL_DAMPING/(2·√PULL_ACCEL)  (overshoot vs. sluggishness)
// The original 22 / 2.4 gave ζ≈0.26 — badly under-damped, ~42% overshoot, so a
// child's drag made the cloud shoot past their finger and wobble (~1.3 s ring-out).
// These raise stiffness AND damping together for ζ≈0.84 (imperceptible <1%
// overshoot, settles in ~0.85 s) while the higher ω keeps steady-state follow-lag
// low (~50–100 world-units at realistic child drag speeds — it still trails the
// finger softly like a cloud should, but tracks instead of bouncing).
const PULL_ACCEL = 90; // 1/s^2, how hard the cloud accelerates toward the pointer
const VEL_DAMPING_PER_SEC = 16; // higher = snappier stop, lower = more drift

// ——— Wind & lift: displacement, not force ———
// Wind used to be an acceleration added alongside the pointer pull, which made
// its strength a hostage of the pointer stiffness: steady-state offset was
// windX/PULL_ACCEL, so round 1's PULL_ACCEL 22→90 silently shrank wind from
// 0.64 to 0.16 world-units on a ~1150-wide world and L7/L8 ("一点点风"/"阵风来了")
// stopped delivering the mechanic their names promise.
//
// Wind now offsets the *settle point* instead: while dragging, the cloud homes
// to `pointer + windX` rather than `pointer`, so `windX` IS the displacement in
// world units and is completely independent of PULL_ACCEL / VEL_DAMPING. ζ≈0.84
// and ω are untouched, so round 1's verified drag feel survives a wind retune —
// which was the whole reason wind was left cosmetic last time.
//
// Released clouds get their own gentler push (below) rather than the same
// offset: reusing the settle-point term as a raw acceleration would give a
// terminal drift of windX·PULL_ACCEL/VEL_DAMPING ≈ 5.6·windX u/s (≈250 u/s at
// windX=45), which reads as slapstick rather than weather.
const WIND_FREE_DRIFT_PER_UNIT = 20; // terminal drift ≈ 1.25 · windX units/sec

// ——— Cloud mass vs. wind ———
// A loaded cloud is harder to push around than an empty one: the wind's force is
// roughly unchanged but the mass it acts on has grown, so deflection falls. This
// is real, it is legible (heavy clouds visibly hold their line), and it creates
// an actual decision — cross the windy stretch loaded, not empty.
//
// Deflection is scaled by BASE_MASS/(BASE_MASS + water), i.e. an empty cloud
// takes the full displacement and a 90-unit load takes 40% of it. Simplification
// kept on purpose: a fuller cloud is also drawn larger, so its true sail area
// grows too — but mass grows faster than frontal area, so "heavier deflects
// less" stays the correct direction and is the part worth teaching.
const CLOUD_BASE_MASS = 60;

// ——— The sun ———
// The sun is the engine of the whole cycle, so it is simulated, not decorative:
// intensity multiplies both sea evaporation and thermal lift. That makes the
// causal chain visible — bright sun ⇒ more vapour ⇒ cloud fills ⇒ cloud rains —
// which is the lesson the game exists to teach, carried by the picture rather
// than by a caption.
const DAY_LENGTH_MS_DEFAULT = 150_000;
// Dawn/dusk floor. A physically honest arc would pass through a true zero, but a
// level where the child simply cannot make progress for thirty seconds is not a
// game — so the arc runs 0.28..1.0 instead of 0..1. Deliberate deviation.
const SUN_MIN_INTENSITY = 0.28;
// Levels open at mid-morning rather than dawn so the first drink isn't sluggish.
const DAY_START_PHASE = 0.28;

const CHILL_THAW_MS = 1300; // frozen stays frozen briefly after leaving the front

// Cloud collision radius for bird strikes, as a fraction of worldH. Render draws
// the blob at ~0.075·worldH; this is deliberately a touch tighter so a hit always
// looks like a hit rather than a near-miss.
const CLOUD_HIT_R_FRAC = 0.062;
const BIRD_HIT_LOSS = 9; // water knocked loose per strike
const BIRD_HIT_COOLDOWN_MS = 700; // one flock can't drain a cloud by grazing it

const ABSORB_BAND_FRAC = 0.11; // how close to the sea surface counts as "flying low"
const RAIN_REACH_FRAC = 0.055; // extra radius beyond a field's own radius that still counts as "over it"

const MOUNTAIN_LEAK_RATE = 14; // water/sec lost while clipping a mountain
// Safety buffer (world-units, as a frac of worldH) above a peak within which the
// cloud already counts as "clipping". Without it the leak was a razor cliff at the
// exact peak point: clearing it by 1 unit was as safe as clearing by 50, yet the
// cloud's puffy belly (~0.7·baseR ≈ 25–43u below its center) was still buried in
// the mountain. This makes the leak begin as that belly grazes the peak, so the
// penalty matches what the child sees and rewards clearing with real headroom.
const MOUNTAIN_SAFE_MARGIN_FRAC = 0.03;
// Rain that lands on a mountain slope (not on a field, not on the sea) used
// to become waterWasted instantly. Round 11: a fraction of it runs downhill
// and arrives at the nearest downhill field after a short delay — the water-
// cycle lesson "runoff" without a Cellular-Automata hydrology module.
// Deliberate simplifications (honest, dated): no real height field, no
// branching streams, no snow — just "mountain got wet → nearby lower field
// gets wet a moment later". Seas stay infinite sources; runoff never creates
// new water, only re-routes what would have been waste.
const RUNOFF_CAPTURE_FRAC = 0.55; // rest still wasted (soaks into rock / evaporates)
const RUNOFF_DELAY_MS = 1800; // ~1.8s — long enough to see a trickle, short enough to feel causal
const RUNOFF_MAX_DIST_FRAC = 0.45; // field must be within this ·worldW of the hit to catch runoff
const OVERWATER_DRAIN_RATE = 7; // water/sec a flooded field drains back toward its cap
const BLOOM_EASE_PER_SEC = 2.4; // bloom01 animation speed once a field locks in

// Cloud morphology (no split). High altitude → lighter "cirrus" feel: slightly
// faster pointer follow + thinner silhouette in Render. Near-full water →
// heavier "cumulus" feel: slightly slower follow + fatter silhouette. The
// existing massFactor already handles wind/thermal; this only retunes the
// pointer spring so "full clouds are sluggish" is legible while dragging.
const CIRRUS_Y_FRAC = 0.28; // above this (small y) counts as high
const FORM_PULL_LIGHT = 1.12; // high+empty spring multiplier
const FORM_PULL_HEAVY = 0.78; // full spring multiplier

// Particle spawn cadence at pressure=0 (drizzle). Higher pressure shortens
// the interval so a downpour looks denser without changing the rate formula.
const PARTICLE_INTERVAL_MS = 90;
// Performance headroom measured in round 8: 1000 soft particles/frame cost
// ~1% of a 16.7ms frame. 220 is a deliberate ~5× bump from 40 that makes
// downpours feel wet without approaching the budget. Still far under the
// design-doc's "800" aspiration — that number needs splash + vapor layers
// that don't exist yet, not just a higher rain cap.
const MAX_PARTICLES = 220;
const PARTICLE_GRAVITY = 260;
const PARTICLE_LIFE_S = 0.6;

/**
 * Map a 0..1 rain pressure onto a rate multiplier.
 *   0.00 → ×0.30  (mist; barely waters)
 *   0.58 → ×1.00  (the calibrated default — autopilot / rainHeld-only callers)
 *   1.00 → ×1.50  (downpour; faster, easier to overwater)
 * Chosen so `0.3 + p*1.2` hits exactly 1.0 at p≈0.583, matching the design
 * doc's light/heavy range without silently rescaling any level whose tests
 * and star gates were built against the bare `rainRate`.
 */
function rainRateMul(pressure: number): number {
  const p = Math.max(0, Math.min(1, pressure));
  return 0.3 + p * 1.2;
}

/** Default pressure when a caller only sets `rainHeld: true` (tests, autopilot).
 *  Exactly (1.0 - 0.3) / 1.2 so rateMul is 1.0 and existing calibrations keep
 *  their meaning — a rounded 0.583 was 0.9996 and silently under-watered by
 *  ~0.04 units over a 40-unit pour, which the bloom epsilon masked as a pass
 *  on state but failed a moisture >= targetMin assertion. */
const DEFAULT_RAIN_PRESSURE = (1.0 - 0.3) / 1.2;

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

/** Heating power at a point in the day: a sine arc from dawn through noon to
 *  dusk, floored so dawn/dusk are weak rather than dead. */
function sunIntensityAt(dayPhase: number): number {
  const arc = Math.sin(Math.max(0, Math.min(1, dayPhase)) * Math.PI);
  return SUN_MIN_INTENSITY + (1 - SUN_MIN_INTENSITY) * arc;
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

  const thermals: Thermal[] = (level.thermals ?? []).map((t) => ({
    pos: { x: t.normX * worldW, y: groundY },
    width: t.width * worldH,
    height: t.height * worldH,
    lift: t.lift,
  }));

  // startN spreads a flock across the world so the level doesn't open with every
  // bird stacked at the same x.
  const birds: Bird[] = (level.birds ?? []).map((b) => ({
    pos: { x: b.startN * worldW, y: b.normY * worldH },
    vx: b.speed,
    radius: b.radius * worldH,
    flap: b.startN * Math.PI * 2,
  }));

  const coldFronts: ColdFront[] = (level.coldFronts ?? []).map((c) => ({
    pos: { x: c.normX * worldW, y: c.normY * worldH },
    radius: c.radius * worldH,
    vx: c.speed,
  }));

  const params = level.tiers[level.tier];

  const cloud: Cloud = {
    pos: { x: worldW * 0.5, y: worldH * 0.32 },
    vel: { x: 0, y: 0 },
    water: 0,
    maxWater: params.cloudMaxWater,
    raining: false,
    rainPressure: 0,
    chilled: false,
    thawMs: 0,
  };

  return {
    phase: 'playing',
    cloud,
    wind: { baseX: params.windBaseX, gustX: 0 },
    fields,
    mountains,
    thermals,
    birds,
    coldFronts,
    sun: { dayPhase: DAY_START_PHASE, intensity: sunIntensityAt(DAY_START_PHASE) },
    seas: buildSeas(level, worldW, groundY),
    runoff: [],
    particles: [],
    stats: { elapsedMs: 0, waterEvaporated: 0, waterRained: 0, waterWasted: 0 },
    bounds: { w: worldW, h: worldH },
  };
}

/** Resolve LevelDef.seas (or legacy seaWidthN) into world-space SeaRegions. */
function buildSeas(level: LevelRuntime, worldW: number, groundY: number): SeaRegion[] {
  if (level.seas && level.seas.length > 0) {
    return level.seas.map((s) => ({
      x0: Math.min(s.normX0, s.normX1) * worldW,
      x1: Math.max(s.normX0, s.normX1) * worldW,
      y: groundY,
    }));
  }
  return [{ x0: 0, x1: level.seaWidthN * worldW, y: groundY }];
}

/** True when the cloud is horizontally over any evaporative water body. */
function overAnySea(seas: SeaRegion[], x: number): SeaRegion | undefined {
  for (const s of seas) {
    if (x >= s.x0 && x <= s.x1) return s;
  }
  return undefined;
}

/** Mountain whose horizontal span contains x, with its index for runoff tags. */
function findMountainUnder(
  mountains: Mountain[],
  x: number,
): { id: number; m: Mountain } | undefined {
  for (let i = 0; i < mountains.length; i++) {
    const m = mountains[i];
    const half = m.width / 2;
    if (x >= m.pos.x - half && x <= m.pos.x + half) return { id: i, m };
  }
  return undefined;
}

/**
 * Pick the nearest non-bloom field downhill of a mountain hit. "Downhill" is
 * simplified to "lower on screen (larger y) OR further from the peak in x" —
 * good enough to teach runoff without a height field. Returns -1 if nothing
 * is in range (packet will waste on delivery).
 */
function findRunoffDestination(
  fields: Field[],
  mountain: Mountain,
  hitX: number,
  worldW: number,
): number {
  const maxDist = worldW * RUNOFF_MAX_DIST_FRAC;
  let bestId = -1;
  let bestScore = Infinity;
  for (const f of fields) {
    if (f.state === 'bloom') continue;
    const dx = f.pos.x - hitX;
    const dist = Math.abs(dx);
    if (dist > maxDist) continue;
    // Prefer fields that are lower (larger y) than the mountain base, and
    // closer in x. Score is distance with a small bonus for being downhill.
    const downhill = f.pos.y >= mountain.pos.y - mountain.height * 0.15 ? 0 : 40;
    const score = dist + downhill;
    if (score < bestScore) {
      bestScore = score;
      bestId = f.id;
    }
  }
  return bestId;
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
  // Epsilon, not a hack: rain is accumulated in floating-point increments, so a
  // field can finish a downpour a few hundredths short of its target — visually
  // identical to a satisfied field, but refusing to bloom, which reads as a bug
  // to a child who just emptied a whole cloud onto it. 0.5 units is ~12ms of
  // rain at the standard rate, far below anything perceivable.
  if (f.moisture >= f.targetMin - 0.5) {
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
  let birdCooldownMs = 0;

  function init(level: LevelRuntime): GameState {
    params = level.tiers[level.tier];
    rng = mulberry32(level.id * 1000 + (level.tier === 'hard' ? 1 : 0) + 1);
    rainAccumMs = 0;
    birdCooldownMs = 0;
    return buildInitialState(level);
  }

  function step(state: GameState, intent: InputIntent, dtMs: number): SimEvent[] {
    if (state.phase === 'complete') return [];
    const events: SimEvent[] = [];
    const dt = dtMs / 1000;
    const { w: worldW, h: worldH } = state.bounds;
    state.stats.elapsedMs += dtMs;

    // the sun's arc — everything downstream reads from it
    const dayLength = params.dayLengthMs ?? DAY_LENGTH_MS_DEFAULT;
    state.sun.dayPhase = (DAY_START_PHASE + state.stats.elapsedMs / dayLength) % 1;
    state.sun.intensity = sunIntensityAt(state.sun.dayPhase);

    // wind
    state.wind.baseX = params.windBaseX;
    state.wind.gustX =
      params.gustAmp > 0
        ? Math.sin((state.stats.elapsedMs / params.gustPeriodMs) * Math.PI * 2) * params.gustAmp
        : 0;
    // A loaded cloud resists the wind; an empty one gets shoved around.
    const massFactor = CLOUD_BASE_MASS / (CLOUD_BASE_MASS + state.cloud.water);
    const windX = (state.wind.baseX + state.wind.gustX) * massFactor;

    // dynamic obstacles move before the cloud reacts to them
    for (const b of state.birds) {
      b.pos.x += b.vx * dt;
      b.flap += dt * 9;
      const margin = b.radius * 2;
      if (b.vx > 0 && b.pos.x > worldW + margin) b.pos.x = -margin;
      if (b.vx < 0 && b.pos.x < -margin) b.pos.x = worldW + margin;
    }
    for (const c of state.coldFronts) {
      c.pos.x += c.vx * dt;
      // cold fronts bounce rather than wrap, so they stay in the playfield the
      // child is working in instead of vanishing off-screen for long stretches
      if (c.pos.x < c.radius || c.pos.x > worldW - c.radius) {
        c.vx = -c.vx;
        c.pos.x = Math.min(worldW - c.radius, Math.max(c.radius, c.pos.x));
      }
    }

    // thermal lift: an upward settle-point offset while inside the column,
    // fading out over its top third so the edge isn't a cliff
    let liftY = 0;
    for (const t of state.thermals) {
      const halfW = t.width / 2;
      if (Math.abs(state.cloud.pos.x - t.pos.x) > halfW) continue;
      const above = t.pos.y - state.cloud.pos.y; // height above the ground line
      if (above < 0 || above > t.height) continue;
      const fade = Math.min(1, (t.height - above) / (t.height * 0.34));
      // Thermals are the sun's doing, so they rise and fall with it — and, like
      // wind, they shift a heavy cloud less than a light one.
      liftY += t.lift * fade * state.sun.intensity * massFactor;
    }

    // pointer pull + wind + damping. Wind and thermals shift the point the
    // cloud settles at rather than adding force, so their strength is
    // independent of PULL_ACCEL/VEL_DAMPING (see the constants above).
    // Form pull: high empty clouds snap a bit faster; full clouds feel heavier
    // under the finger. Multiplies only the pointer spring, not wind settle,
    // so calibrated wind displacements stay honest.
    const wet01 = state.cloud.maxWater > 0 ? state.cloud.water / state.cloud.maxWater : 0;
    const high01 = Math.max(0, Math.min(1, (CIRRUS_Y_FRAC * worldH - state.cloud.pos.y) / (CIRRUS_Y_FRAC * worldH)));
    const formPull =
      FORM_PULL_HEAVY +
      (1 - FORM_PULL_HEAVY) * (1 - wet01) +
      (FORM_PULL_LIGHT - 1) * high01 * (1 - wet01 * 0.7);
    const pull = PULL_ACCEL * formPull;
    let ax = 0;
    let ay = 0;
    if (intent.pointerActive) {
      const targetX = intent.pointer.x + windX;
      const targetY = intent.pointer.y - worldH * POINTER_OFFSET_Y_FRAC - liftY;
      ax += (targetX - state.cloud.pos.x) * pull;
      ay += (targetY - state.cloud.pos.y) * pull;
    } else {
      ax += windX * WIND_FREE_DRIFT_PER_UNIT;
      ay += -liftY * WIND_FREE_DRIFT_PER_UNIT;
    }
    const damp = Math.max(0, 1 - VEL_DAMPING_PER_SEC * dt);
    state.cloud.vel.x = (state.cloud.vel.x + ax * dt) * damp;
    state.cloud.vel.y = (state.cloud.vel.y + ay * dt) * damp;
    state.cloud.pos.x += state.cloud.vel.x * dt;
    state.cloud.pos.y += state.cloud.vel.y * dt;

    // Clamp to the playfield — and zero the velocity component that got
    // clamped. Clamping position alone leaves a phantom velocity: while the
    // finger is held past a wall the spring keeps accelerating toward a target
    // the cloud can never reach, so it sits visually still while reporting a
    // large speed (~137 u/s against the floor at PULL_ACCEL 90). Input arms
    // auto-rain only below NEAR_STILL_SPEED=45, so holding the finger low over
    // a field — the natural way to water one — silently never started the rain.
    const marginX = worldW * CLOUD_MARGIN_FRAC;
    const marginY = worldH * CLOUD_MARGIN_FRAC;
    const minX = marginX;
    const maxX = worldW - marginX;
    const minY = worldH * SKY_TOP_FRAC;
    const maxY = worldH * GROUND_Y_FRAC - marginY;

    const clampedX = Math.min(maxX, Math.max(minX, state.cloud.pos.x));
    if (clampedX !== state.cloud.pos.x) {
      state.cloud.pos.x = clampedX;
      state.cloud.vel.x = 0;
    }
    const clampedY = Math.min(maxY, Math.max(minY, state.cloud.pos.y));
    if (clampedY !== state.cloud.pos.y) {
      state.cloud.pos.y = clampedY;
      state.cloud.vel.y = 0;
    }

    // cold fronts: inside one, the cloud is frozen — it can neither drink nor
    // rain. Emitted as enter/exit edges so Audio and the HUD can react once
    // instead of every frame.
    // Leaving the front doesn't thaw the cloud instantly — it stays frozen for
    // CHILL_THAW_MS afterwards, so escaping is a decision with a cost rather
    // than a doorway you can dip in and out of for free.
    const wasChilled = state.cloud.chilled;
    const insideFront = state.coldFronts.some(
      (c) => Math.hypot(c.pos.x - state.cloud.pos.x, c.pos.y - state.cloud.pos.y) <= c.radius,
    );
    if (insideFront) state.cloud.thawMs = CHILL_THAW_MS;
    else state.cloud.thawMs = Math.max(0, state.cloud.thawMs - dtMs);
    state.cloud.chilled = insideFront || state.cloud.thawMs > 0;
    if (state.cloud.chilled && !wasChilled) events.push({ type: 'chillEnter' });
    if (!state.cloud.chilled && wasChilled) events.push({ type: 'chillExit' });

    // bird strikes knock water loose, on a cooldown so a single flock brushing
    // the cloud can't drain it frame-by-frame
    birdCooldownMs = Math.max(0, birdCooldownMs - dtMs);
    if (birdCooldownMs === 0 && state.cloud.water > 0) {
      const hitR = worldH * CLOUD_HIT_R_FRAC;
      const struck = state.birds.some(
        (b) => Math.hypot(b.pos.x - state.cloud.pos.x, b.pos.y - state.cloud.pos.y) <= b.radius + hitR,
      );
      if (struck) {
        const loss = Math.min(BIRD_HIT_LOSS, state.cloud.water);
        state.cloud.water -= loss;
        state.stats.waterWasted += loss;
        birdCooldownMs = BIRD_HIT_COOLDOWN_MS;
        events.push({ type: 'birdHit', amount: loss });
      }
    }

    // sea absorption (must be flying low over any water body). Multi-sea levels
    // use the same infinite-source, sun-driven rate as the classic left-edge
    // sea — the only change is "which horizontal band counts as water".
    const underSea = overAnySea(state.seas, state.cloud.pos.x);
    const lowOverSea = underSea
      ? underSea.y - state.cloud.pos.y <= worldH * ABSORB_BAND_FRAC
      : false;
    if (!state.cloud.chilled && underSea && lowOverSea && state.cloud.water < state.cloud.maxWater) {
      // The sun is literally what lifts the water: a weak dawn sun fills the
      // cloud slowly, a noon sun fills it fast. This is the game's core lesson
      // expressed as a rate rather than as a sentence.
      const amt = Math.min(params.evapRate * state.sun.intensity * dt, state.cloud.maxWater - state.cloud.water);
      if (amt > 0) {
        state.cloud.water += amt;
        state.stats.waterEvaporated += amt;
        events.push({ type: 'evaporate', amount: amt });
      }
    }

    // mountains: flying within a safety margin of (or under) the peak height
    // clips and leaks water
    const mountainSafeMargin = worldH * MOUNTAIN_SAFE_MARGIN_FRAC;
    for (const m of state.mountains) {
      const left = m.pos.x - m.width / 2;
      const right = m.pos.x + m.width / 2;
      const topY = m.pos.y - m.height;
      if (
        state.cloud.pos.x >= left &&
        state.cloud.pos.x <= right &&
        state.cloud.pos.y > topY - mountainSafeMargin &&
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
    state.cloud.raining = intent.rainHeld && state.cloud.water > 0 && !state.cloud.chilled;
    // Resolve pressure: player input supplies a 0..1 ramp; callers that only
    // flip rainHeld (tests, autopilot) get the mid-strength default so their
    // calibrated rainRate stays rate×1.0. Clamped here, never trusted raw.
    const pressure = state.cloud.raining
      ? Math.max(0, Math.min(1, intent.rainPressure ?? DEFAULT_RAIN_PRESSURE))
      : 0;
    state.cloud.rainPressure = pressure;
    if (state.cloud.raining && !wasRaining) events.push({ type: 'rainStart' });
    if (!state.cloud.raining && wasRaining) events.push({ type: 'rainStop' });
    if (state.cloud.raining) events.push({ type: 'rainPressure', pressure });

    if (state.cloud.raining) {
      const rateMul = rainRateMul(pressure);
      const amt = Math.min(params.rainRate * rateMul * dt, state.cloud.water);
      state.cloud.water -= amt;
      state.stats.waterRained += amt;
      const field = findFieldUnderCloud(state.fields, state.cloud.pos, worldH);
      if (field) {
        field.moisture += amt;
      } else {
        // Not over a field. If we're over a mountain slope, a share of the rain
        // becomes delayed runoff toward the nearest downhill field instead of
        // pure waste — the water-cycle "runoff" lesson, taught by the sim.
        const slope = findMountainUnder(state.mountains, state.cloud.pos.x);
        if (slope) {
          const captured = amt * RUNOFF_CAPTURE_FRAC;
          const wastedNow = amt - captured;
          if (wastedNow > 0) state.stats.waterWasted += wastedNow;
          if (captured > 0.001) {
            const dest = findRunoffDestination(
              state.fields,
              state.mountains[slope.id],
              state.cloud.pos.x,
              worldW,
            );
            state.runoff.push({
              mountainId: slope.id,
              fieldId: dest,
              amount: captured,
              delayMs: RUNOFF_DELAY_MS,
              hitX: state.cloud.pos.x,
            });
            events.push({ type: 'runoff', amount: captured, mountainId: slope.id });
          }
        } else {
          state.stats.waterWasted += amt;
        }
      }

      // Density tracks pressure: drizzle spawns sparsely, downpour fills the
      // air. Interval scales 1.6× (light) → 0.45× (heavy) of the base 90ms.
      const interval = PARTICLE_INTERVAL_MS * (1.6 - 1.15 * pressure);
      // Wider spray + faster fall at high pressure so the downpour *looks*
      // like one, not just denser dots of the same drizzle.
      const sprayW = worldH * (0.022 + 0.04 * pressure);
      const fallSpeed = 30 + 50 * pressure;
      rainAccumMs += dtMs;
      while (rainAccumMs >= interval) {
        rainAccumMs -= interval;
        const particle: RainParticle = {
          pos: { x: state.cloud.pos.x + (rng() - 0.5) * sprayW, y: state.cloud.pos.y },
          vel: { x: (rng() - 0.5) * (8 + 18 * pressure), y: fallSpeed },
          life: PARTICLE_LIFE_S * (0.85 + 0.3 * pressure),
        };
        state.particles.push(particle);
        if (state.particles.length > MAX_PARTICLES) state.particles.shift();
      }
    } else {
      rainAccumMs = 0;
    }

    // Deliver delayed runoff packets. Water that finds no field (fieldId -1)
    // becomes waste at delivery time — it reached the sea / soaked away.
    if (state.runoff.length > 0) {
      const next: typeof state.runoff = [];
      for (const p of state.runoff) {
        p.delayMs -= dtMs;
        if (p.delayMs > 0) {
          next.push(p);
          continue;
        }
        if (p.fieldId >= 0) {
          const f = state.fields[p.fieldId];
          if (f && f.state !== 'bloom') {
            f.moisture += p.amount;
          } else {
            state.stats.waterWasted += p.amount;
          }
        } else {
          state.stats.waterWasted += p.amount;
        }
      }
      state.runoff = next;
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
      // The last bloom almost always happens mid-rain, and once phase is
      // 'complete' step() early-returns forever — so the rainStop below is the
      // only chance to close the audio rain loop. Without it the rain sound
      // plays on into the result screen and never stops.
      if (state.cloud.raining) {
        state.cloud.raining = false;
        state.cloud.rainPressure = 0;
        events.push({ type: 'rainStop' });
      }
      state.phase = 'complete';
      events.push({ type: 'levelComplete', stats: { ...state.stats } });
    }

    return events;
  }

  return { init, step };
}
