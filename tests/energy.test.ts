import { beforeEach, describe, expect, it } from 'vitest';
import {
  ENERGY_MAX,
  canStartLevel,
  getEnergy,
  spendEnergy,
  shouldShowRestHint,
  noteSessionPlaying,
  resetSessionPlay,
  REST_HINT_MINUTES,
} from '../src/levels/energy.ts';

beforeEach(() => {
  localStorage.clear();
  resetSessionPlay();
});

describe('daily energy (non-IAA)', () => {
  it('starts full and spends one point per start', () => {
    expect(getEnergy().points).toBe(ENERGY_MAX);
    expect(canStartLevel()).toBe(true);
    expect(spendEnergy()).toBe(true);
    expect(getEnergy().points).toBe(ENERGY_MAX - 1);
  });

  it('refuses to spend when empty', () => {
    for (let i = 0; i < ENERGY_MAX; i++) expect(spendEnergy()).toBe(true);
    expect(canStartLevel()).toBe(false);
    expect(spendEnergy()).toBe(false);
    expect(getEnergy().points).toBe(0);
  });

  it('rest hint trips after long active play, not immediately', () => {
    expect(shouldShowRestHint()).toBe(false);
    // Simulate REST_HINT_MINUTES of play in one gulp.
    noteSessionPlaying(REST_HINT_MINUTES * 60_000 + 1000);
    expect(shouldShowRestHint()).toBe(true);
  });
});
