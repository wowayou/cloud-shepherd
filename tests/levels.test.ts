import { describe, expect, it } from 'vitest';
import { LEVELS, createLevels, evalStars } from '../src/levels/index.ts';
import { idealRun } from '../tools/autopilot.ts';
import type { LevelDef, SimStats } from '../src/types.ts';

function makeStats(overrides: Partial<SimStats> = {}): SimStats {
  return { elapsedMs: 0, waterEvaporated: 0, waterRained: 0, waterWasted: 0, ...overrides };
}

describe('level data', () => {
  it('defines the tutorial level plus 18 levels, each with both tiers', () => {
    expect(LEVELS).toHaveLength(19);
    const ids = LEVELS.map((l) => l.id);
    expect(ids).toEqual([...Array(19).keys()]);
    for (const level of LEVELS) {
      expect(level.fields.length).toBeGreaterThan(0);
      expect(level.tiers.easy).toBeDefined();
      expect(level.tiers.hard).toBeDefined();
      expect(level.seaWidthN).toBeGreaterThan(0);
      expect(level.seaWidthN).toBeLessThan(1);
      // Multi-sea layouts must be well-formed bands; legacy levels omit `seas`
      // and resolve to a single left-edge sea via seaWidthN.
      if (level.seas) {
        expect(level.seas.length).toBeGreaterThan(0);
        for (const s of level.seas) {
          expect(s.normX0).toBeLessThan(s.normX1);
          expect(s.normX0).toBeGreaterThanOrEqual(0);
          expect(s.normX1).toBeLessThanOrEqual(1);
        }
      }
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

describe('level data: round-7 obstacle invariants', () => {
  // A thermal raises the point the cloud settles at. Over a field, the pointer
  // position needed to hold the cloud low enough to rain is
  //   field.y + POINTER_OFFSET (0.07·h) + lift
  // and once that exceeds the world height the field cannot be watered at all —
  // a level that looks fine in the data and is silently impossible to finish.
  it('never puts a thermal column over a field', () => {
    const WORLD_H = 720;
    const POINTER_OFFSET_FRAC = 0.07;
    for (const level of LEVELS) {
      for (const t of level.thermals ?? []) {
        for (const f of level.fields) {
          const halfW = t.width / 2;
          const overlapsX = Math.abs(f.normX - t.normX) < halfW + f.radius;
          if (!overlapsX) continue;
          const neededPointerY = f.normY * WORLD_H + POINTER_OFFSET_FRAC * WORLD_H + t.lift;
          expect(
            neededPointerY,
            `level ${level.id} (${level.name}): thermal at ${t.normX} overlaps field at ${f.normX}, ` +
              `needing pointer y=${neededPointerY.toFixed(0)} > world ${WORLD_H}`,
          ).toBeLessThan(WORLD_H);
        }
      }
    }
  });

  it('keeps bird lanes and cold fronts inside the sky', () => {
    for (const level of LEVELS) {
      for (const b of level.birds ?? []) {
        expect(b.normY).toBeGreaterThan(0.05);
        expect(b.normY).toBeLessThan(0.8); // above the ground line (0.82)
        expect(Math.abs(b.speed)).toBeGreaterThan(0);
      }
      for (const c of level.coldFronts ?? []) {
        expect(c.normY - c.radius).toBeGreaterThan(0);
        expect(c.normY).toBeLessThan(0.82);
      }
    }
  });
});

describe('every level is actually completable', () => {
  // Drives the real Sim with the calibration autopilot. This is the guard that
  // would have caught a thermal parked over a field, a water budget too small
  // for the fields, or a cold front that never lets go — none of which any
  // amount of static data validation can see.
  it('completes all 19 levels on both tiers, and an ideal run earns 3 stars', () => {
    for (const level of LEVELS) {
      for (const tier of ['easy', 'hard'] as const) {
        const r = idealRun(level, tier);
        expect(r.completed, `level ${level.id} (${level.name}) [${tier}] did not complete`).toBe(true);
        const stars = evalStars(level, tier, {
          elapsedMs: r.elapsedMs,
          waterEvaporated: 0,
          waterRained: 0,
          waterWasted: r.waste,
        });
        expect(stars, `level ${level.id} (${level.name}) [${tier}] ideal run scored ${stars}★`).toBe(3);
      }
    }
  }, 30_000);
});
