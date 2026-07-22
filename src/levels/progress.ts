import type { EcoSpecies, Profile, ProfileClear, ProgressStore, Tier } from '../types.ts';

// v2 adds optional ecoDex[]; old v1 blobs still load (ecoDex defaults empty).
const STORAGE_KEY = 'cloud-shepherd:profiles:v2';
const LEGACY_KEY = 'cloud-shepherd:profiles:v1';

function loadAll(): Profile[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // One-time migrate from v1 so existing stars aren't wiped by the eco-dex bump.
      raw = localStorage.getItem(LEGACY_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p: Profile) => ({
      ...p,
      ecoDex: Array.isArray(p.ecoDex) ? p.ecoDex : [],
    }));
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
    const profile: Profile = { id: makeId(), name, colorId, clears: {}, ecoDex: [] };
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

  function unlockEco(profileId: string, species: EcoSpecies[]): void {
    if (species.length === 0) return;
    const profiles = loadAll();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const have = new Set(profile.ecoDex ?? []);
    let changed = false;
    for (const s of species) {
      if (!have.has(s)) {
        have.add(s);
        changed = true;
      }
    }
    if (!changed) return;
    // Stable display order for the three known species.
    const order: EcoSpecies[] = ['flower', 'butterfly', 'bee'];
    profile.ecoDex = order.filter((s) => have.has(s));
    saveAll(profiles);
  }

  return { listProfiles, createProfile, getProfile, recordClear, unlockEco };
}
