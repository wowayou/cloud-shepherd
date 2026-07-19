import type { Profile, ProfileClear, ProgressStore, Tier } from '../types.ts';

const STORAGE_KEY = 'cloud-shepherd:profiles:v1';

function loadAll(): Profile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(profiles: Profile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // storage unavailable (e.g. private mode quota) — progress just won't persist
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createProgressStore(): ProgressStore {
  function listProfiles(): Profile[] {
    return loadAll();
  }

  function createProfile(name: string, colorId: number): Profile {
    const profiles = loadAll();
    const profile: Profile = { id: makeId(), name, colorId, clears: {} };
    profiles.push(profile);
    saveAll(profiles);
    return profile;
  }

  function getProfile(id: string): Profile | undefined {
    return loadAll().find((p) => p.id === id);
  }

  function recordClear(profileId: string, levelId: number, tier: Tier, stars: number): void {
    const profiles = loadAll();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const existing: ProfileClear = profile.clears[levelId] ?? {
      stars: 0,
      clearedEasy: false,
      clearedHard: false,
    };
    profile.clears[levelId] = {
      stars: Math.max(existing.stars, stars),
      clearedEasy: existing.clearedEasy || tier === 'easy',
      clearedHard: existing.clearedHard || tier === 'hard',
    };
    saveAll(profiles);
  }

  return { listProfiles, createProfile, getProfile, recordClear };
}
