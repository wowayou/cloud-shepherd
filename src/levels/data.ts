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

const HARD_BASE: TierParams = {
  windBaseX: 0,
  gustAmp: 0,
  gustPeriodMs: 5000,
  cloudMaxWater: 90,
  evapRate: 42,
  rainRate: 42,
  starThresholds: { timeMs: [22000, 34000], waste: [15, 40] },
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
    tiers: { easy: easy(), hard: hard() },
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
    tiers: { easy: easy(), hard: hard() },
  },
  {
    id: 3,
    name: '云朵变重了',
    seaWidthN: 0.24,
    fields: [{ normX: 0.82, normY: 0.83, targetMin: 115, targetMax: 190, radius: 0.08 }],
    tiers: { easy: easy(), hard: hard({ cloudMaxWater: 80 }) },
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
    tiers: { easy: easy(), hard: hard() },
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
    tiers: { easy: easy(), hard: hard() },
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
    tiers: { easy: easy(), hard: hard() },
  },
  {
    id: 7,
    name: '一点点风',
    seaWidthN: 0.24,
    fields: [
      { normX: 0.62, normY: 0.84, targetMin: 40, targetMax: 110, radius: 0.065 },
      { normX: 0.88, normY: 0.8, targetMin: 40, targetMax: 110, radius: 0.065 },
    ],
    tiers: {
      easy: easy({ windBaseX: 4 }),
      hard: hard({ windBaseX: 14 }),
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
    tiers: {
      easy: easy({ windBaseX: 5 }),
      hard: hard({ windBaseX: 16, gustAmp: 22, gustPeriodMs: 3200 }),
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
    tiers: {
      easy: easy({ windBaseX: 5 }),
      hard: hard({ windBaseX: 16, gustAmp: 20, gustPeriodMs: 3200, cloudMaxWater: 70 }),
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
    tiers: {
      easy: easy({ windBaseX: 6 }),
      hard: hard({ windBaseX: 18, gustAmp: 24, gustPeriodMs: 3000, cloudMaxWater: 65 }),
    },
  },
];
