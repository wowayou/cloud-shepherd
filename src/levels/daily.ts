/**
 * Daily weather challenge — a deterministic LevelDef seeded by the local date.
 * Same day → same layout for every player on that device; no server, no leaderboard.
 * Round 15 of the ceiling-raise roadmap.
 */
import type { FieldDef, LevelDef, Season, TierParams } from '../types.ts';

/** Mulberry32 — same PRNG family as sim particles, independent stream. */
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

/** YYYYMMDD integer in local time — the whole seed. */
export function dateSeed(d: Date = new Date()): number {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return y * 10000 + m * 100 + day;
}

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

function stars(t3: number, t2: number, w3: number, w2: number): NonNullable<TierParams['starThresholds']> {
  return { timeMs: [t3, t2], waste: [w3, w2] };
}

/**
 * Build today's challenge. Always completable on the simplest path (left sea +
 * 2–3 fields on land). Optional mountain / thermal / light wind for variety.
 * id is fixed at 900 so progress clears don't collide with campaign 0–20.
 */
export function buildDailyLevel(d: Date = new Date()): LevelDef {
  return buildDailyLevelFromSeed(dateSeed(d));
}

export function buildDailyLevelFromSeed(seed: number): LevelDef {
  const rnd = mulberry32(seed ^ 0xc10a1d);
  const season = SEASONS[Math.floor(rnd() * SEASONS.length)];
  const fieldCount = 2 + Math.floor(rnd() * 2); // 2 or 3
  const fields: FieldDef[] = [];
  for (let i = 0; i < fieldCount; i++) {
    const t = (i + 1) / (fieldCount + 1);
    fields.push({
      normX: 0.45 + t * 0.45 + (rnd() - 0.5) * 0.06,
      normY: 0.8 + (rnd() - 0.5) * 0.06,
      targetMin: 36 + Math.floor(rnd() * 20),
      targetMax: 95 + Math.floor(rnd() * 30),
      radius: 0.055 + rnd() * 0.02,
    });
  }
  // Clamp fields into land (right of sea ~0.26)
  for (const f of fields) {
    f.normX = Math.min(0.92, Math.max(0.4, f.normX));
    f.normY = Math.min(0.88, Math.max(0.76, f.normY));
    f.targetMax = Math.max(f.targetMax, f.targetMin + 40);
  }

  const hasMountain = rnd() > 0.45;
  const hasThermal = rnd() > 0.55;
  const hasWind = rnd() > 0.5;
  const hasSnow = season === 'winter' && rnd() > 0.4;

  const seaWidthN = 0.22 + rnd() * 0.08;
  const windBase = hasWind ? 10 + rnd() * 24 : 0;
  const gustAmp = hasWind && rnd() > 0.5 ? 8 + rnd() * 16 : 0;

  // Ideal ~ 5–12s; generous gates so daily never feels punitive.
  const t3 = 16000 + fieldCount * 3000;
  const t2 = t3 + 10000;

  const level: LevelDef = {
    id: 900,
    name: `今日天气 · ${seed}`,
    seaWidthN,
    fields,
    season,
    tiers: {
      easy: {
        windBaseX: windBase * 0.4,
        gustAmp: gustAmp * 0.4,
        gustPeriodMs: 7000 + rnd() * 2000,
        cloudMaxWater: 150,
        evapRate: 55,
        rainRate: 55,
      },
      hard: {
        windBaseX: windBase,
        gustAmp,
        gustPeriodMs: 7000 + rnd() * 2000,
        cloudMaxWater: 90,
        evapRate: 42,
        rainRate: 42,
        starThresholds: stars(t3, t2, 20, 48),
      },
    },
    introKey: 'daily',
    factCardKey: 'cycle',
  };

  if (hasMountain) {
    level.mountains = [
      {
        normX: 0.38 + rnd() * 0.12,
        normY: 0.82,
        width: 0.12 + rnd() * 0.08,
        height: 0.18 + rnd() * 0.14,
      },
    ];
  }
  if (hasThermal) {
    // Park clear of fields (left-mid sky).
    level.thermals = [
      {
        normX: 0.32 + rnd() * 0.1,
        width: 0.08,
        height: 0.28 + rnd() * 0.1,
        lift: 40 + rnd() * 30,
      },
    ];
  }
  if (hasSnow && level.mountains) {
    level.snowLineN = 0.28 + rnd() * 0.1;
  }

  return level;
}
