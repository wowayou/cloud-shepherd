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
    fields: [{ normX: 0.82, normY: 0.83, targetMin: 115, targetMax: 190, radius: 0.08 }],
    // Thirsty single field (needs 115) but the hard cloud only holds 80 → two sea
    // trips. Ideal ~7.3s.
    tiers: {
      easy: easy(),
      hard: hard({ cloudMaxWater: 80, starThresholds: stars(14000, 22000, 15, 40) }),
    },
    factCardKey: 'cloudForms',
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
    fields: [
      { normX: 0.5, normY: 0.85, targetMin: 30, targetMax: 80, radius: 0.05 },
      { normX: 0.72, normY: 0.82, targetMin: 50, targetMax: 120, radius: 0.07 },
      { normX: 0.92, normY: 0.79, targetMin: 40, targetMax: 100, radius: 0.06 },
    ],
    // Three fields (sum 120) over one hard cloud (90) → two trips. Ideal ~8.3s.
    tiers: { easy: easy(), hard: hard({ starThresholds: stars(16000, 26000, 18, 42) }) },
  },
  {
    id: 7,
    name: '一点点风',
    seaWidthN: 0.24,
    fields: [
      { normX: 0.62, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.88, normY: 0.8, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    // Introduces wind. NOTE: under the retuned physics wind barely displaces a
    // held cloud (steady offset = windBaseX/90 ≈ 0.16u), so it now reads as a
    // visual/flavour mechanic, not a difficulty spike — the gate matches L4's
    // two-field pace rather than assuming wind adds time. Ideal ~5.2s.
    tiers: {
      easy: easy({ windBaseX: 4 }),
      hard: hard({ windBaseX: 14, starThresholds: stars(10000, 16000, 15, 40) }),
    },
  },
  {
    id: 8,
    name: '阵风来了',
    seaWidthN: 0.24,
    fields: [
      { normX: 0.6, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.86, normY: 0.8, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    // Adds gusts (again mostly visual sway under the new physics). Ideal ~5.2s.
    tiers: {
      easy: easy({ windBaseX: 5 }),
      hard: hard({ windBaseX: 16, gustAmp: 22, gustPeriodMs: 3200, starThresholds: stars(11000, 17000, 16, 40) }),
    },
    factCardKey: 'cycle',
  },
  {
    id: 9,
    name: '省着点用',
    seaWidthN: 0.2,
    fields: [
      { normX: 0.5, normY: 0.85, targetMin: 40, targetMax: 95, radius: 0.055 },
      { normX: 0.72, normY: 0.82, targetMin: 40, targetMax: 95, radius: 0.055 },
      { normX: 0.92, normY: 0.79, targetMin: 40, targetMax: 95, radius: 0.055 },
    ],
    // Real water-budget challenge: three fields (sum 120), hard cloud holds 70 →
    // two carefully-rationed trips. Ideal ~8.3s. This level's difficulty comes from
    // the tight cloudMaxWater, which the new physics does NOT trivialise.
    tiers: {
      easy: easy({ windBaseX: 5 }),
      hard: hard({ windBaseX: 16, gustAmp: 20, gustPeriodMs: 3200, cloudMaxWater: 70, starThresholds: stars(16000, 25000, 18, 42) }),
    },
    factCardKey: 'saveWater',
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
      easy: easy({ windBaseX: 6 }),
      hard: hard({ windBaseX: 18, gustAmp: 24, gustPeriodMs: 3000, cloudMaxWater: 65, starThresholds: stars(20000, 31000, 22, 50) }),
    },
  },
];
