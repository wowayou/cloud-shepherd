import type { LevelDef, TierParams } from '../types.ts';

// Shared tunables so tier tables below stay readable as diffs from a baseline.
const EASY_BASE: TierParams = {
  windBaseX: 0,
  gustAmp: 0,
  gustPeriodMs: 5000,
  cloudMaxWater: 150,
  evapRate: 55,
  rainRate: 55,
};

// Per-level hard-tier star gates. Retuned after the round-1 Sim retune made the
// cloud follow the pointer far more responsively (PULL_ACCEL 22→90): levels now
// complete in a fraction of the old time, so the previous flat 22s/34s gate handed
// out 3 stars on every hard level automatically. These thresholds are calibrated
// against measured play — an "ideal" deterministic run of createSim() (the skilled
// lower bound) plus real-browser Playwright playthroughs (~1.2–1.5× that) — so:
//   3★ (t3)  ≈ 2× the ideal-run time — a clean, well-planned run
//   2★ (t2)  ≈ 3× the ideal-run time — an ordinary completion
//   1★       — anything slower (still a win: finishing is never a failure)
// The `waste` gates are unchanged in spirit; the snappier cloud is *more* precise
// (near-zero overshoot) so clean play wastes ~0, and mountain levels get more room
// for the occasional leak.
function stars(t3: number, t2: number, w3: number, w2: number): NonNullable<TierParams['starThresholds']> {
  return { timeMs: [t3, t2], waste: [w3, w2] };
}

const HARD_BASE: TierParams = {
  windBaseX: 0,
  gustAmp: 0,
  gustPeriodMs: 5000,
  cloudMaxWater: 90,
  evapRate: 42,
  rainRate: 42,
  starThresholds: stars(11000, 17000, 15, 40),
};

function easy(overrides: Partial<TierParams> = {}): TierParams {
  return { ...EASY_BASE, ...overrides };
}

function hard(overrides: Partial<TierParams> = {}): TierParams {
  return { ...HARD_BASE, ...overrides };
}

export const LEVELS: LevelDef[] = [
  {
    id: 0,
    name: '认识云朵',
    seaWidthN: 0.3,
    fields: [{ normX: 0.7, normY: 0.82, targetMin: 40, targetMax: 130, radius: 0.09 }],
    tiers: {
      easy: easy({ cloudMaxWater: 200, evapRate: 80, rainRate: 80 }),
      hard: easy({ cloudMaxWater: 200, evapRate: 80, rainRate: 80 }),
    },
    tutorial: [
      { trigger: 'start', textKey: 'dragCloud' },
      { trigger: 'start', textKey: 'goToSea' },
      { trigger: 'cloudFull', textKey: 'cloudFull' },
      { trigger: 'cloudFull', textKey: 'goToField' },
      { trigger: 'overField', textKey: 'holdToRain' },
      { trigger: 'fieldBloom', textKey: 'watchBloom' },
    ],
  },
  {
    id: 1,
    name: '第一场雨',
    seaWidthN: 0.28,
    fields: [{ normX: 0.72, normY: 0.83, targetMin: 45, targetMax: 120, radius: 0.075 }],
    // Simplest level: single close field, one sea trip. Ideal ~3.1s.
    tiers: { easy: easy(), hard: hard({ starThresholds: stars(7000, 11000, 12, 30) }) },
    factCardKey: 'evaporation',
  },
  {
    id: 2,
    name: '两块田',
    seaWidthN: 0.26,
    fields: [
      { normX: 0.58, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.84, normY: 0.8, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    // Two fields, one sea trip. Ideal ~5.2s.
    tiers: { easy: easy(), hard: hard({ starThresholds: stars(10000, 16000, 15, 40) }) },
  },
  {
    id: 3,
    name: '云朵变重了',
    seaWidthN: 0.24,
    // Round 8: the first obstacle now shows up here instead of level 11, per
    // the user's "从第三关就可以开始加更多的障碍了". A small, gentle thermal
    // sits in open sky mid-transit — clear of the field (|0.82-0.5|=0.32 >
    // halfW 0.04 + radius 0.08), so it costs nothing to ignore on this level's
    // two required sea trips, but it's the player's first look at "warm air
    // rises" before any level asks them to route around one.
    thermals: [{ normX: 0.5, width: 0.08, height: 0.3, lift: 40 }],
    fields: [{ normX: 0.82, normY: 0.83, targetMin: 115, targetMax: 190, radius: 0.08 }],
    // Thirsty single field (needs 115) but the hard cloud only holds 80 → two sea
    // trips. Ideal ~7.3s.
    tiers: {
      easy: easy(),
      hard: hard({ cloudMaxWater: 80, starThresholds: stars(14000, 22000, 15, 40) }),
    },
    factCardKey: 'cloudForms',
    introKey: 'thermal',
  },
  {
    id: 4,
    name: '远方的旱地',
    seaWidthN: 0.2,
    fields: [
      { normX: 0.6, normY: 0.85, targetMin: 40, targetMax: 100, radius: 0.06 },
      { normX: 0.9, normY: 0.81, targetMin: 40, targetMax: 100, radius: 0.06 },
    ],
    // Two spread-out fields, one trip. Ideal ~5.2s.
    tiers: { easy: easy(), hard: hard({ starThresholds: stars(10000, 16000, 15, 40) }) },
    factCardKey: 'rainFalls',
  },
  {
    id: 5,
    name: '翻过山头',
    seaWidthN: 0.22,
    mountains: [{ normX: 0.5, normY: 0.82, width: 0.22, height: 0.26 }],
    fields: [
      { normX: 0.7, normY: 0.83, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.92, normY: 0.8, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    // First mountain: climbing over it to reach the far fields costs time, and
    // clipping the peak leaks water — hence the roomier waste gate. Ideal ~5.9s.
    tiers: { easy: easy(), hard: hard({ starThresholds: stars(12000, 19000, 22, 50) }) },
  },
  {
    id: 6,
    name: '三姐妹田',
    seaWidthN: 0.22,
    // Second obstacle in the ramp: a single slow flock at a natural transit
    // altitude (normY 0.4, between the sea-skim band and the fields). Gentle on
    // purpose — one flock, modest speed — since this level's own difficulty
    // already comes from three fields over one cloud.
    birds: [{ normY: 0.4, speed: 80, radius: 0.032, startN: 0.5 }],
    fields: [
      { normX: 0.5, normY: 0.85, targetMin: 30, targetMax: 80, radius: 0.05 },
      { normX: 0.72, normY: 0.82, targetMin: 50, targetMax: 120, radius: 0.07 },
      { normX: 0.92, normY: 0.79, targetMin: 40, targetMax: 100, radius: 0.06 },
    ],
    // Three fields (sum 120) over one hard cloud (90) → two trips. Ideal ~8.3s.
    tiers: { easy: easy(), hard: hard({ starThresholds: stars(16000, 26000, 18, 42) }) },
    introKey: 'birds',
  },
  {
    id: 7,
    name: '一点点风',
    seaWidthN: 0.24,
    fields: [
      { normX: 0.62, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.88, normY: 0.8, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    // Introduces wind, and as of round 7 it actually IS the mechanic again:
    // windBaseX is now a steady-state displacement in world units, so 34 means
    // the cloud parks 34u downwind of the finger — roughly a third of a field's
    // rain-catch radius (~86u), enough that you must aim upwind to water
    // accurately, but not enough to make transit a fight.
    tiers: {
      easy: easy({ windBaseX: 10 }),
      hard: hard({ windBaseX: 34, starThresholds: stars(11000, 17000, 16, 42) }),
    },
    introKey: 'wind',
  },
  {
    id: 8,
    name: '阵风来了',
    seaWidthN: 0.24,
    fields: [
      { normX: 0.6, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.86, normY: 0.8, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    // Adds gusts. Base 28 ± 26 swings the parking spot between ~2u and ~54u
    // downwind on a 3.2s cycle, so a held cloud visibly surges and eases — you
    // have to keep correcting rather than setting one offset and forgetting it.
    tiers: {
      easy: easy({ windBaseX: 12, gustAmp: 10, gustPeriodMs: 8600 }),
      hard: hard({ windBaseX: 28, gustAmp: 26, gustPeriodMs: 7200, starThresholds: stars(12000, 18000, 18, 44) }),
    },
    factCardKey: 'cycle',
    introKey: 'gust',
  },
  {
    id: 9,
    name: '省着点用',
    seaWidthN: 0.2,
    // Third obstacle in the ramp: a small, slow cold front parked off in a
    // corner (normX 0.35, well clear of all three fields' direct lines), so
    // routing around it costs a little planning rather than being unavoidable —
    // this level's real difficulty is still the water budget.
    coldFronts: [{ normX: 0.35, normY: 0.55, radius: 0.12, speed: 30 }],
    fields: [
      { normX: 0.5, normY: 0.85, targetMin: 40, targetMax: 95, radius: 0.055 },
      { normX: 0.72, normY: 0.82, targetMin: 40, targetMax: 95, radius: 0.055 },
      { normX: 0.92, normY: 0.79, targetMin: 40, targetMax: 95, radius: 0.055 },
    ],
    // Real water-budget challenge: three fields (sum 120), hard cloud holds 70 →
    // two carefully-rationed trips. Ideal ~8.3s. This level's difficulty comes from
    // the tight cloudMaxWater, which the new physics does NOT trivialise.
    tiers: {
      easy: easy({ windBaseX: 12, gustAmp: 8, gustPeriodMs: 8600 }),
      hard: hard({ windBaseX: 30, gustAmp: 22, gustPeriodMs: 7200, cloudMaxWater: 70, starThresholds: stars(17000, 26000, 20, 46) }),
    },
    factCardKey: 'saveWater',
    introKey: 'cold',
  },
  {
    id: 10,
    name: '牧羊人的挑战',
    seaWidthN: 0.2,
    mountains: [{ normX: 0.52, normY: 0.82, width: 0.2, height: 0.24 }],
    fields: [
      { normX: 0.42, normY: 0.85, targetMin: 35, targetMax: 90, radius: 0.05 },
      { normX: 0.66, normY: 0.82, targetMin: 45, targetMax: 100, radius: 0.06 },
      { normX: 0.86, normY: 0.79, targetMin: 40, targetMax: 95, radius: 0.055 },
    ],
    // Finale: mountain + three fields + the tightest cloud (65) → multiple trips,
    // each routed over the peak. The genuine challenge of the set, so the 3★ gate
    // is the least forgiving relative to its ideal time. Ideal ~10.4s.
    tiers: {
      easy: easy({ windBaseX: 14, gustAmp: 10, gustPeriodMs: 7800 }),
      hard: hard({ windBaseX: 36, gustAmp: 28, gustPeriodMs: 8000, cloudMaxWater: 65, starThresholds: stars(21000, 32000, 24, 54) }),
    },
  },

  // ————————————————————————————————————————————————————————————
  // Round 7: dynamic obstacles. Each of the three gets its own introduction
  // level before anything combines them.
  //
  // Obstacles are defined per LEVEL, not per tier, so easy and hard face the
  // same hazards. Easy stays gentle through its existing levers instead: a
  // 150-unit cloud (vs 90) makes a 9-unit bird strike ~6% rather than 10% of
  // the budget, faster evap/rain rates shorten every exposure window, and easy
  // never grades stars at all. Accepted deliberately — per-tier obstacle tables
  // would double the tuning surface for a tier that has no failure pressure.
  // ————————————————————————————————————————————————————————————
  {
    id: 11,
    name: '上升的暖气流',
    seaWidthN: 0.22,
    // The column sits between the sea and the fields and reaches from the
    // ground to y≈0.44·worldH, so the cheap route (fly over the top) costs real
    // altitude and time, while pushing through shoves the cloud up and out of
    // rain range. Deliberately NOT over a field: lift raises the settle point,
    // and over low ground that would push the required pointer position below
    // the bottom of the screen, making a field literally unwaterable.
    thermals: [{ normX: 0.52, width: 0.15, height: 0.46, lift: 95 }],
    fields: [
      { normX: 0.72, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.9, normY: 0.81, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    tiers: {
      easy: easy(),
      hard: hard({ starThresholds: stars(13000, 20000, 16, 42) }),
    },
    introKey: 'thermal',
  },
  {
    id: 12,
    name: '小心飞鸟',
    seaWidthN: 0.24,
    // Two flocks crossing the transit corridor in opposite directions at
    // different heights, so there is no single altitude that is always safe.
    birds: [
      { normY: 0.36, speed: 115, radius: 0.038, startN: 0.15 },
      { normY: 0.55, speed: -95, radius: 0.038, startN: 0.7 },
    ],
    fields: [
      { normX: 0.62, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.88, normY: 0.81, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    tiers: {
      easy: easy(),
      hard: hard({ starThresholds: stars(13000, 20000, 20, 48) }),
    },
    introKey: 'birds',
  },
  {
    id: 13,
    name: '冷空气来了',
    seaWidthN: 0.24,
    // One slow front bouncing across the middle of the playfield. It suspends
    // drinking AND raining, so the skill is timing a crossing rather than
    // out-running it — hence the roomy time gate relative to its field count.
    coldFronts: [{ normX: 0.55, normY: 0.6, radius: 0.17, speed: 46 }],
    fields: [
      { normX: 0.68, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.9, normY: 0.81, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    tiers: {
      easy: easy(),
      hard: hard({ starThresholds: stars(15000, 23000, 16, 42) }),
    },
    introKey: 'cold',
  },
  {
    id: 14,
    name: '乱流',
    seaWidthN: 0.22,
    thermals: [{ normX: 0.46, width: 0.13, height: 0.42, lift: 85 }],
    birds: [{ normY: 0.3, speed: -120, radius: 0.038, startN: 0.85 }],
    fields: [
      { normX: 0.64, normY: 0.85, targetMin: 40, targetMax: 100, radius: 0.06 },
      { normX: 0.86, normY: 0.81, targetMin: 45, targetMax: 110, radius: 0.065 },
    ],
    // Thermal + birds + a steady wind: the thermal pushes you up into the
    // flock's lane, which is the point.
    tiers: {
      easy: easy({ windBaseX: 10 }),
      hard: hard({ windBaseX: 28, cloudMaxWater: 80, starThresholds: stars(17000, 26000, 24, 54) }),
    },
    introKey: 'mixed',
  },
  {
    id: 15,
    name: '牧羊人的考验',
    seaWidthN: 0.2,
    mountains: [{ normX: 0.44, normY: 0.82, width: 0.16, height: 0.22 }],
    // 0.74/width 0.10 keeps clear of the fields at 0.6 and 0.88 — at 0.66 this
    // column overlapped the middle field and made it unwaterable (holding the
    // cloud low enough would have needed the finger ~8px below the screen).
    // The completability autopilot missed it because it can aim off-screen;
    // the thermal-over-field invariant test is what caught it.
    thermals: [{ normX: 0.74, width: 0.1, height: 0.4, lift: 80 }],
    birds: [
      { normY: 0.28, speed: 130, radius: 0.038, startN: 0.1 },
      { normY: 0.5, speed: -105, radius: 0.036, startN: 0.6 },
    ],
    coldFronts: [{ normX: 0.75, normY: 0.55, radius: 0.15, speed: -52 }],
    fields: [
      { normX: 0.34, normY: 0.86, targetMin: 35, targetMax: 90, radius: 0.05 },
      { normX: 0.6, normY: 0.83, targetMin: 45, targetMax: 100, radius: 0.06 },
      { normX: 0.88, normY: 0.8, targetMin: 40, targetMax: 95, radius: 0.055 },
    ],
    // Everything at once on the tightest cloud in the game. The mountain sits
    // between the sea and the first field, the thermal guards the far two, and
    // the cold front patrols the approach to the last one.
    tiers: {
      easy: easy({ windBaseX: 14, gustAmp: 10, gustPeriodMs: 7800 }),
      hard: hard({ windBaseX: 34, gustAmp: 24, gustPeriodMs: 8000, cloudMaxWater: 62, starThresholds: stars(26000, 40000, 30, 62) }),
    },
  },
  // —— Round 10: layout templates that break "sea always on the left" ——
  // Both levels keep the simplest path intact (drink → rain → bloom, no new
  // gesture). The only new idea is *where* the water lives, which a child
  // reads from the picture without a caption.
  {
    id: 16,
    name: '中间的湖',
    // seaWidthN is the total water-cover fraction for the "has water" sanity
    // check; geometry comes from `seas` (a centred lake, not a left strip).
    seaWidthN: 0.28,
    seas: [{ normX0: 0.36, normX1: 0.64 }],
    // Four fields around the lake — route is radial, not left→right. Each
    // field is a short hop from water so the level teaches "water is in the
    // middle" without demanding multi-trip economy.
    fields: [
      { normX: 0.18, normY: 0.84, targetMin: 38, targetMax: 100, radius: 0.06 },
      { normX: 0.82, normY: 0.84, targetMin: 38, targetMax: 100, radius: 0.06 },
      { normX: 0.28, normY: 0.78, targetMin: 36, targetMax: 95, radius: 0.055 },
      { normX: 0.72, normY: 0.78, targetMin: 36, targetMax: 95, radius: 0.055 },
    ],
    // Ideal ~ two full tank trips on hard (cloud 90 vs ~148 need). Gates leave
    // room for a first-time radial-route explorer.
    tiers: {
      easy: easy({ cloudMaxWater: 160 }),
      hard: hard({ starThresholds: stars(18000, 28000, 20, 48) }),
    },
    introKey: 'lake',
    factCardKey: 'cycle',
  },
  {
    id: 17,
    name: '两边都是海',
    seaWidthN: 0.36,
    // Dual coast: drink from either shore. Fields sit in the land between,
    // so the skill is "pick the nearer sea" — a pure spatial decision that
    // the nearest-sea autopilot already models.
    seas: [
      { normX0: 0.0, normX1: 0.18 },
      { normX0: 0.82, normX1: 1.0 },
    ],
    fields: [
      { normX: 0.34, normY: 0.84, targetMin: 42, targetMax: 110, radius: 0.06 },
      { normX: 0.5, normY: 0.82, targetMin: 40, targetMax: 105, radius: 0.06 },
      { normX: 0.66, normY: 0.84, targetMin: 42, targetMax: 110, radius: 0.06 },
    ],
    // A light thermal in open sky above the middle field — optional spice,
    // clear of rain footprints so it can't soft-lock a field.
    thermals: [{ normX: 0.5, width: 0.08, height: 0.28, lift: 45 }],
    tiers: {
      easy: easy(),
      hard: hard({ starThresholds: stars(16000, 25000, 18, 44) }),
    },
    introKey: 'twoSeas',
    factCardKey: 'evaporation',
  },
  // —— Round 12: snow line + melt ——
  {
    id: 18,
    name: '山顶的雪',
    seaWidthN: 0.24,
    // Tall mountain under a snow line at 0.32·h. Rain low on the slope still
    // runs off (round 11); rain high freezes into a pack that melts when the
    // sun is strong — the solid-precipitation lesson.
    mountains: [{ normX: 0.55, normY: 0.82, width: 0.22, height: 0.38 }],
    snowLineN: 0.32,
    season: 'winter',
    fields: [
      { normX: 0.78, normY: 0.84, targetMin: 50, targetMax: 120, radius: 0.07 },
      { normX: 0.34, normY: 0.84, targetMin: 40, targetMax: 100, radius: 0.06 },
    ],
    // Ideal path can still just rain on the fields (simplest path). Snow is
    // an alternate route: stock the peak, wait for noon melt. Gates leave
    // room for either strategy.
    tiers: {
      easy: easy({ cloudMaxWater: 160 }),
      hard: hard({ cloudMaxWater: 85, starThresholds: stars(20000, 32000, 22, 50) }),
    },
    introKey: 'snow',
    factCardKey: 'snowMelt',
  },
];
