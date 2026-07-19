import { beforeEach, describe, expect, it } from 'vitest';
import { createProgressStore } from '../src/levels/progress.ts';

beforeEach(() => {
  localStorage.clear();
});

describe('progress store: double profiles', () => {
  it('starts with no profiles', () => {
    const store = createProgressStore();
    expect(store.listProfiles()).toEqual([]);
  });

  it('creates two independent profiles that do not overwrite each other', () => {
    const store = createProgressStore();
    const fox = store.createProfile('小狐狸', 0);
    const rabbit = store.createProfile('小兔子', 1);

    expect(fox.id).not.toBe(rabbit.id);
    expect(store.listProfiles()).toHaveLength(2);

    store.recordClear(fox.id, 1, 'easy', 3);

    expect(store.getProfile(fox.id)?.clears[1]).toBeDefined();
    expect(store.getProfile(rabbit.id)?.clears[1]).toBeUndefined();
  });

  it('keeps the best star count ever earned and accumulates tier clears', () => {
    const store = createProgressStore();
    const profile = store.createProfile('小狐狸', 0);

    store.recordClear(profile.id, 2, 'hard', 2);
    store.recordClear(profile.id, 2, 'hard', 1); // a worse retry must not erase the earlier 2 stars
    store.recordClear(profile.id, 2, 'easy', 3);

    const clear = store.getProfile(profile.id)?.clears[2];
    expect(clear?.stars).toBe(3);
    expect(clear?.clearedEasy).toBe(true);
    expect(clear?.clearedHard).toBe(true);
  });

  it('persists across store instances (simulating a page reload)', () => {
    const store1 = createProgressStore();
    const profile = store1.createProfile('小狐狸', 0);
    store1.recordClear(profile.id, 0, 'easy', 3);

    const store2 = createProgressStore();
    const reloaded = store2.getProfile(profile.id);
    expect(reloaded?.name).toBe('小狐狸');
    expect(reloaded?.clears[0]?.clearedEasy).toBe(true);
  });
});
