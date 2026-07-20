import type {
  GameState,
  InputIntent,
  LevelDef,
  LevelRuntime,
  Profile,
  Scene,
  SimEvent,
  Tier,
  UiCallbacks,
  Viewport,
} from '../types.ts';
import type { FactCardKey } from '../strings.ts';
import { createSim } from '../sim/index.ts';
import { createRender } from '../render/index.ts';
import { createLevels } from '../levels/index.ts';
import { createInput } from '../input/index.ts';
import { createAudio } from '../audio/index.ts';
import { createUi, factCardText } from '../ui/index.ts';
import { startLoop } from './loop.ts';

const WORLD_H = 720;
const MIN_ASPECT = 4 / 3;
const MAX_ASPECT = 2.2;

export function bootGame(canvas: HTMLCanvasElement, uiRoot: HTMLElement): () => void {
  const ctx = canvas.getContext('2d');

  const sim = createSim();
  const render = createRender();
  const levels = createLevels();
  const input = createInput();
  const audio = createAudio();
  const ui = createUi();

  let scene: Scene = 'profile';
  let currentProfile: Profile | null = null;
  let currentLevelDef: LevelDef | null = null;
  let currentTier: Tier = 'easy';
  let gameState: GameState | null = null;
  let worldW = WORLD_H * MIN_ASPECT;
  let worldH = WORLD_H;
  let paused = false;
  let pendingResize = false;

  function computeViewport(): Viewport {
    const cssW = canvas.clientWidth || window.innerWidth || worldW;
    const cssH = canvas.clientHeight || window.innerHeight || worldH;
    const scale = Math.min(cssW / worldW, cssH / worldH);
    return {
      scale,
      offsetX: (cssW - worldW * scale) / 2,
      offsetY: (cssH - worldH * scale) / 2,
      dpr: window.devicePixelRatio || 1,
    };
  }

  function resizeCanvasBackingStore(): void {
    const dpr = window.devicePixelRatio || 1;
    const pixelW = Math.round((canvas.clientWidth || worldW) * dpr);
    const pixelH = Math.round((canvas.clientHeight || worldH) * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
  }

  function aspectForCanvas(): number {
    const cw = canvas.clientWidth || worldW;
    const ch = canvas.clientHeight || worldH;
    return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, cw / ch));
  }

  /**
   * Re-fit the live world to a new canvas aspect. The world is defined by
   * normalized level coordinates, so on resize we recompute worldW and re-derive
   * every position from the level def (preserving moisture/bloom/water state);
   * only the cloud carries free position, which is scaled proportionally.
   * Without this, a level started in a small window keeps its old aspect after
   * maximizing and the sea/land end abruptly at dead letterbox bars.
   */
  function applyWorldResize(): void {
    if (!gameState || !currentLevelDef) return;
    const newW = WORLD_H * aspectForCanvas();
    if (Math.abs(newW - gameState.bounds.w) < 1) return;
    const oldW = gameState.bounds.w;
    worldW = newW;
    worldH = WORLD_H;

    gameState.bounds.w = newW;
    gameState.sea.x1 = currentLevelDef.seaWidthN * newW;
    currentLevelDef.fields.forEach((fd, i) => {
      const f = gameState!.fields[i];
      if (f) {
        f.pos.x = fd.normX * newW;
        f.pos.y = fd.normY * WORLD_H;
      }
    });
    (currentLevelDef.mountains ?? []).forEach((md, i) => {
      const m = gameState!.mountains[i];
      if (m) m.pos.x = md.normX * newW;
    });
    gameState.cloud.pos.x = (gameState.cloud.pos.x / oldW) * newW;
    gameState.particles = []; // ephemeral; stale positions would rain in the wrong spot
  }

  /** Idempotent: stops the looping rain sound if it is playing. The sim also
   *  emits rainStop on level completion, but every path that leaves active
   *  play (pause/quit/retry/next/tab-hidden) must close the loop too — the
   *  audio graph keeps playing even when rAF stops ticking. */
  function stopRainSound(): void {
    audio.play({ type: 'rainStop' });
  }

  function goToProfileScene(): void {
    scene = 'profile';
    ui.setScene('profile', { profiles: levels.progress.listProfiles() });
  }

  function goToLevelSelect(profile: Profile): void {
    // Always re-read from the store: `profile` may be a stale snapshot from
    // when the player entered the level, and recordClear() writes to storage,
    // not into that object — using it as-is shows cleared levels as locked.
    const fresh = levels.progress.getProfile(profile.id) ?? profile;
    currentProfile = fresh;
    scene = 'levelselect';
    ui.setScene('levelselect', { profile: fresh, levels: levels.all() });
  }

  function startLevel(levelId: number, tier: Tier): void {
    const def = levels.byId(levelId);
    if (!def) return;
    currentLevelDef = def;
    currentTier = tier;

    worldH = WORLD_H;
    worldW = WORLD_H * aspectForCanvas();

    stopRainSound();
    input.setRainButton(false); // a held ☔ from the previous level must not carry over

    const runtime: LevelRuntime = { ...def, tier, worldW, worldH };
    gameState = sim.init(runtime);
    paused = false;
    scene = 'playing';
    ui.setScene('playing', { level: def, tier });
  }

  function handleSimEvents(events: SimEvent[]): void {
    for (const e of events) {
      audio.play(e);
      if (e.type === 'levelComplete' && currentProfile && currentLevelDef) {
        const stars = levels.evalStars(currentLevelDef, currentTier, e.stats);
        levels.progress.recordClear(currentProfile.id, currentLevelDef.id, currentTier, stars);
        for (let i = 0; i < stars; i++) audio.play({ type: 'star', index: i });

        const factKey = currentLevelDef.factCardKey as FactCardKey | undefined;
        scene = 'result';
        ui.setScene('result');
        ui.showResult(stars, factKey ? factCardText(factKey) : undefined, {
          tier: currentTier,
          elapsedMs: e.stats.elapsedMs,
          waste: e.stats.waterWasted,
          thresholds: currentLevelDef.tiers[currentTier].starThresholds,
        });
      }
    }
  }

  const callbacks: UiCallbacks = {
    onSelectProfile(id) {
      audio.play({ type: 'uiTap' });
      const profile = levels.progress.getProfile(id);
      if (profile) goToLevelSelect(profile);
    },
    onCreateProfile(name, colorId) {
      audio.play({ type: 'uiTap' });
      const profile = levels.progress.createProfile(name, colorId);
      goToLevelSelect(profile);
    },
    onSelectLevel(id, tier) {
      audio.play({ type: 'uiTap' });
      startLevel(id, tier);
    },
    onPause() {
      paused = true;
      stopRainSound();
    },
    onResume() {
      paused = false;
      // If the cloud is still marked raining, clear it so the next sim step
      // re-emits rainStart and the sound resumes in sync with the visuals.
      if (gameState?.cloud.raining) gameState.cloud.raining = false;
    },
    onRetry() {
      audio.play({ type: 'uiTap' });
      if (currentLevelDef) startLevel(currentLevelDef.id, currentTier);
    },
    onNext() {
      audio.play({ type: 'uiTap' });
      if (!currentLevelDef) return;
      const nextDef = levels.byId(currentLevelDef.id + 1);
      if (nextDef) startLevel(nextDef.id, currentTier);
      else if (currentProfile) goToLevelSelect(currentProfile);
    },
    onQuit() {
      audio.play({ type: 'uiTap' });
      stopRainSound();
      if (currentProfile) goToLevelSelect(currentProfile);
    },
    onToggleMute() {
      audio.setMuted(!audio.isMuted());
    },
    onRainHold(held) {
      input.setRainButton(held);
    },
  };

  ui.mount(uiRoot, callbacks);
  input.attach(canvas, computeViewport);
  goToProfileScene();

  const onWindowResize = () => {
    pendingResize = true;
  };
  window.addEventListener('resize', onWindowResize);

  // rAF stops ticking in a hidden tab but the Web Audio graph keeps playing —
  // without this, switching apps mid-rain leaves the rain sound running
  // against a frozen game.
  const onVisibility = () => {
    if (document.hidden) {
      stopRainSound();
      if (gameState?.cloud.raining) gameState.cloud.raining = false;
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const stopLoop = startLoop({
    fixedUpdate(dtMs) {
      if (scene !== 'playing' || paused || !gameState) return;
      const intent: InputIntent = input.read(gameState);
      const events = sim.step(gameState, intent, dtMs);
      if (events.length) handleSimEvents(events);
    },
    render() {
      if (!ctx) return; // no 2D canvas support (e.g. a non-browser test env)
      resizeCanvasBackingStore();
      if (pendingResize) {
        pendingResize = false;
        applyWorldResize();
      }
      const vp = computeViewport();
      const cssW = canvas.clientWidth || worldW;
      const cssH = canvas.clientHeight || worldH;
      ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
      // Paint the full canvas first so any letterbox gutters (aspect clamped
      // to [MIN_ASPECT, MAX_ASPECT]) read as sky, not dead bars.
      ctx.fillStyle = '#bfe6f5';
      ctx.fillRect(0, 0, cssW, cssH);
      if (gameState) {
        render.draw(ctx, gameState, vp);
        ui.updateHud(gameState, currentTier);
      }
    },
  });

  return () => {
    window.removeEventListener('resize', onWindowResize);
    document.removeEventListener('visibilitychange', onVisibility);
    stopLoop();
  };
}
