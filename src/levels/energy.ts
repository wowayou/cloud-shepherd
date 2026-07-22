/**
 * Daily energy (round 16) — non-monetized session pacing for a kids education game.
 *
 * Inspired by the "short sessions + limit" feel of viral mini-games like
 * 《赵云与阿斗》, but deliberately NOT an IAA stamina gate:
 *   - no ads, no purchases, no multi-account bait
 *   - 5 starts per day, 1 recovers every REGEN_MS
 *   - soft: when empty, the player waits; we never sell a refill
 *
 * Stored in localStorage, independent of profiles (one device budget).
 */

const STORAGE_KEY = 'cloud-shepherd:energy:v1';
const MAX_ENERGY = 5;
const REGEN_MS = 20 * 60 * 1000; // 20 minutes per point

export interface EnergyState {
  /** Current points, 0..MAX_ENERGY. */
  points: number;
  /** Epoch ms when the next point will regenerate (only meaningful if points < MAX). */
  nextRegenAt: number;
  /** Calendar day key YYYY-MM-DD for the last full refresh. */
  dayKey: string;
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function load(): EnergyState {
  const today = dayKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EnergyState;
      if (parsed && typeof parsed.points === 'number') {
        // New calendar day → full refill (kids get a fresh morning, not a debt).
        if (parsed.dayKey !== today) {
          return { points: MAX_ENERGY, nextRegenAt: 0, dayKey: today };
        }
        return applyRegen(parsed);
      }
    }
  } catch {
    /* ignore */
  }
  return { points: MAX_ENERGY, nextRegenAt: 0, dayKey: today };
}

function save(s: EnergyState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}

/** Apply any pending passive regen based on wall clock. */
function applyRegen(s: EnergyState, now = Date.now()): EnergyState {
  if (s.points >= MAX_ENERGY) {
    return { ...s, points: MAX_ENERGY, nextRegenAt: 0 };
  }
  if (!s.nextRegenAt || s.nextRegenAt <= 0) {
    return { ...s, nextRegenAt: now + REGEN_MS };
  }
  let points = s.points;
  let next = s.nextRegenAt;
  while (points < MAX_ENERGY && now >= next) {
    points += 1;
    next += REGEN_MS;
  }
  if (points >= MAX_ENERGY) next = 0;
  return { ...s, points, nextRegenAt: next };
}

export function getEnergy(): EnergyState {
  const s = applyRegen(load());
  save(s);
  return s;
}

/** True if a level start can be paid for. Does not spend. */
export function canStartLevel(): boolean {
  return getEnergy().points > 0;
}

/**
 * Spend 1 energy to start a level. Returns false if empty.
 * Sets nextRegenAt when dropping below max.
 */
export function spendEnergy(): boolean {
  let s = applyRegen(load());
  if (s.points <= 0) return false;
  s = {
    ...s,
    points: s.points - 1,
    nextRegenAt: s.points - 1 >= MAX_ENERGY ? 0 : s.nextRegenAt || Date.now() + REGEN_MS,
    dayKey: dayKey(),
  };
  if (s.points < MAX_ENERGY && !s.nextRegenAt) s.nextRegenAt = Date.now() + REGEN_MS;
  save(s);
  return true;
}

export function energyLabel(s: EnergyState = getEnergy()): string {
  return `⚡ ${s.points}/${MAX_ENERGY}`;
}

export const ENERGY_MAX = MAX_ENERGY;
export const ENERGY_REGEN_MS = REGEN_MS;

/** Session playtime tracker (in-memory only) for the gentle rest hint. */
let sessionPlayMs = 0;

export function noteSessionPlaying(dtMs: number): void {
  sessionPlayMs += dtMs;
}

export function sessionPlayMinutes(): number {
  return sessionPlayMs / 60_000;
}

/** Soft threshold: after this many minutes of active play, show a rest hint. */
export const REST_HINT_MINUTES = 12;

export function shouldShowRestHint(): boolean {
  return sessionPlayMinutes() >= REST_HINT_MINUTES;
}

export function resetSessionPlay(): void {
  sessionPlayMs = 0;
}
