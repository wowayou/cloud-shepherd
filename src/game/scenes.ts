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

  function goToProfileScene(): void {
    scene = 'profile';
    ui.setScene('profile', { profiles: levels.progress.listProfiles() });
  }

  function goToLevelSelect(profile: Profile): void {
    currentProfile = profile;
    scene = 'levelselect';
    ui.setScene('levelselect', { profile, levels: levels.all() });
  }

  function startLevel(levelId: number, tier: Tier): void {
    const def = levels.byId(levelId);
    if (!def) return;
    currentLevelDef = def;
    currentTier = tier;

    const cw = canvas.clientWidth || worldW;
    const ch = canvas.clientHeight || worldH;
    const aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, cw / ch));
    worldH = WORLD_H;
    worldW = WORLD_H * aspect;

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
        ui.showResult(stars, factKey ? factCardText(factKey) : undefined);
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
    },
    onResume() {
      paused = false;
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

  return startLoop({
    fixedUpdate(dtMs) {
      if (scene !== 'playing' || paused || !gameState) return;
      const intent: InputIntent = input.read(gameState);
      const events = sim.step(gameState, intent, dtMs);
      if (events.length) handleSimEvents(events);
    },
    render() {
      if (!ctx) return; // no 2D canvas support (e.g. a non-browser test env)
      resizeCanvasBackingStore();
      const vp = computeViewport();
      const cssW = canvas.clientWidth || worldW;
      const cssH = canvas.clientHeight || worldH;
      ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      if (gameState) {
        render.draw(ctx, gameState, vp);
        ui.updateHud(gameState, currentTier);
      } else {
        ctx.fillStyle = '#bfe6f5';
        ctx.fillRect(0, 0, cssW, cssH);
      }
    },
  });
}
