import { describe, expect, it } from 'vitest';
import { LEVELS, createLevels, evalStars } from '../src/levels/index.ts';
import type { LevelDef, SimStats } from '../src/types.ts';

function makeStats(overrides: Partial<SimStats> = {}): SimStats {
  return { elapsedMs: 0, waterEvaporated: 0, waterRained: 0, waterWasted: 0, ...overrides };
}

describe('level data', () => {
  it('defines the tutorial level plus 10 levels, each with both tiers', () => {
    expect(LEVELS).toHaveLength(11);
    const ids = LEVELS.map((l) => l.id);
    expect(ids).toEqual([...Array(11).keys()]);
    for (const level of LEVELS) {
      expect(level.fields.length).toBeGreaterThan(0);
      expect(level.tiers.easy).toBeDefined();
      expect(level.tiers.hard).toBeDefined();
      expect(level.seaWidthN).toBeGreaterThan(0);
      expect(level.seaWidthN).toBeLessThan(1);
      for (const f of level.fields) {
        expect(f.targetMin).toBeLessThanOrEqual(f.targetMax);
      }
    }
  });

  it('only the tutorial level ships tutorial steps', () => {
    expect(LEVELS[0].tutorial?.length).toBeGreaterThan(0);
    for (const level of LEVELS.slice(1)) {
      expect(level.tutorial).toBeUndefined();
    }
  });
});

describe('evalStars', () => {
  const level: LevelDef = {
    id: 1,
    name: 'star test',
    seaWidthN: 0.3,
    fields: [{ normX: 0.7, normY: 0.82, targetMin: 40, targetMax: 100, radius: 0.06 }],
    tiers: {
      easy: { windBaseX: 0, gustAmp: 0, gustPeriodMs: 4000, cloudMaxWater: 120, evapRate: 60, rainRate: 60 },
      hard: {
        windBaseX: 0,
        gustAmp: 0,
        gustPeriodMs: 4000,
        cloudMaxWater: 90,
        evapRate: 40,
        rainRate: 40,
        starThresholds: { timeMs: [20000, 30000], waste: [10, 25] },
      },
    },
  };

  it('easy tier is always full marks — no star pressure for a 6-year-old', () => {
    expect(evalStars(level, 'easy', makeStats({ elapsedMs: 999999, waterWasted: 999 }))).toBe(3);
    expect(evalStars(level, 'easy', makeStats())).toBe(3);
  });

  it('hard tier grades against time + waste thresholds', () => {
    expect(evalStars(level, 'hard', makeStats({ elapsedMs: 15000, waterWasted: 5 }))).toBe(3);
    expect(evalStars(level, 'hard', makeStats({ elapsedMs: 20000, waterWasted: 10 }))).toBe(3);
    expect(evalStars(level, 'hard', makeStats({ elapsedMs: 25000, waterWasted: 20 }))).toBe(2);
    expect(evalStars(level, 'hard', makeStats({ elapsedMs: 30000, waterWasted: 25 }))).toBe(2);
    expect(evalStars(level, 'hard', makeStats({ elapsedMs: 45000, waterWasted: 60 }))).toBe(1);
  });

  it('finishing always earns at least 1 star on hard — no failure state', () => {
    expect(evalStars(level, 'hard', makeStats({ elapsedMs: 10_000_000, waterWasted: 10_000 }))).toBeGreaterThanOrEqual(1);
  });
});

describe('createLevels()', () => {
  it('exposes all()/byId() consistent with the level data', () => {
    const levels = createLevels();
    expect(levels.all()).toBe(LEVELS);
    expect(levels.byId(0)?.name).toBe(LEVELS[0].name);
    expect(levels.byId(999)).toBeUndefined();
  });
});
