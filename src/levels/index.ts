import type { LevelDef, LevelsModule, SimStats, Tier } from '../types.ts';
import { LEVELS } from './data.ts';
import { createProgressStore } from './progress.ts';
import { buildDailyLevel } from './daily.ts';

export { LEVELS } from './data.ts';
export { buildDailyLevel, buildDailyLevelFromSeed, dateSeed } from './daily.ts';

/**
 * Easy tier never applies star pressure — finishing a level always awards
 * the full 3, so a 6-year-old is never staring at "only 1 star". Hard tier
 * grades against the level's starThresholds (elapsed time + water wasted).
 */
export function evalStars(level: LevelDef, tier: Tier, stats: SimStats): number {
  const params = level.tiers[tier];
  const thresholds = params.starThresholds;
  if (tier === 'easy' || !thresholds) return 3;

  const [t3, t2] = thresholds.timeMs;
  const [w3, w2] = thresholds.waste;
  if (stats.elapsedMs <= t3 && stats.waterWasted <= w3) return 3;
  if (stats.elapsedMs <= t2 && stats.waterWasted <= w2) return 2;
  return 1;
}

export function createLevels(): LevelsModule {
  const byIdMap = new Map(LEVELS.map((l) => [l.id, l]));
  // Daily is rebuilt on each byId(900) so midnight rollover is free without a timer.
  let dailyCache: { key: string; level: LevelDef } | null = null;

  function daily(): LevelDef {
    const key = new Date().toDateString();
    if (!dailyCache || dailyCache.key !== key) {
      dailyCache = { key, level: buildDailyLevel() };
    }
    return dailyCache.level;
  }

  return {
    all: () => LEVELS,
    byId: (id: number) => (id === 900 ? daily() : byIdMap.get(id)),
    evalStars,
    progress: createProgressStore(),
  };
}
