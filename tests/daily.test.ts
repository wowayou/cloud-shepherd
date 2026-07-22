import { describe, expect, it } from 'vitest';
import { buildDailyLevelFromSeed, dateSeed } from '../src/levels/daily.ts';
import { idealRun } from '../tools/autopilot.ts';
import { evalStars } from '../src/levels/index.ts';

describe('daily weather challenge', () => {
  it('dateSeed is stable YYYYMMDD in local time', () => {
    const d = new Date(2026, 6, 23); // month is 0-indexed
    expect(dateSeed(d)).toBe(20260723);
  });

  it('same seed → identical level geometry', () => {
    const a = buildDailyLevelFromSeed(20260723);
    const b = buildDailyLevelFromSeed(20260723);
    expect(a.fields).toEqual(b.fields);
    expect(a.season).toBe(b.season);
    expect(a.seaWidthN).toBe(b.seaWidthN);
    expect(a.mountains).toEqual(b.mountains);
  });

  it('different seeds usually differ', () => {
    const a = buildDailyLevelFromSeed(20260723);
    const b = buildDailyLevelFromSeed(20260724);
    // Not a hard guarantee on every bit, but fields or season should move.
    const sameFields = JSON.stringify(a.fields) === JSON.stringify(b.fields);
    const sameSeason = a.season === b.season;
    expect(sameFields && sameSeason).toBe(false);
  });

  it('uses reserved id 900 and has a left-edge sea + fields on land', () => {
    for (const seed of [20260101, 20260723, 20261231, 19990101]) {
      const level = buildDailyLevelFromSeed(seed);
      expect(level.id).toBe(900);
      expect(level.seaWidthN).toBeGreaterThan(0.15);
      expect(level.seaWidthN).toBeLessThan(0.4);
      expect(level.fields.length).toBeGreaterThanOrEqual(2);
      for (const f of level.fields) {
        expect(f.normX).toBeGreaterThan(level.seaWidthN);
        expect(f.targetMin).toBeLessThanOrEqual(f.targetMax);
      }
    }
  });

  it('completes on both tiers for several seeds with ideal 3★', () => {
    for (const seed of [20260723, 20260315, 20261101]) {
      const level = buildDailyLevelFromSeed(seed);
      for (const tier of ['easy', 'hard'] as const) {
        const r = idealRun(level, tier);
        expect(r.completed, `seed ${seed} [${tier}]`).toBe(true);
        const stars = evalStars(level, tier, {
          elapsedMs: r.elapsedMs,
          waterEvaporated: 0,
          waterRained: 0,
          waterWasted: r.waste,
        });
        expect(stars, `seed ${seed} [${tier}] stars`).toBe(3);
      }
    }
  }, 20_000);
});
