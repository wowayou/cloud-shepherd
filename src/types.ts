/**
 * Frozen module contract for Cloud Shepherd (云朵牧羊人).
 *
 * Every module (Sim / Render / Levels / Input / Audio / UI) depends ONLY on
 * the interfaces in this file — never on another module's implementation
 * file. Do not change signatures here without re-syncing all modules.
 */

// ————————————————————————————————————————————————————————————
// World & simulation state
// ————————————————————————————————————————————————————————————

export interface Vec2 {
  x: number;
  y: number;
}

export type FieldState = 'dry' | 'growing' | 'bloom' | 'overwater';

export interface Field {
  id: number;
  pos: Vec2;
  radius: number;
  /** Current water content, arbitrary units matching TierParams rates. */
  moisture: number;
  targetMin: number;
  targetMax: number;
  state: FieldState;
  /** 0..1 bloom animation progress, monotonically eases toward 1 once bloomed. */
  bloom01: number;
}

export interface Mountain {
  pos: Vec2;
  width: number;
  height: number;
}

export interface SeaRegion {
  x0: number;
  x1: number;
  y: number;
}

export interface Cloud {
  pos: Vec2;
  vel: Vec2;
  water: number;
  maxWater: number;
  raining: boolean;
}

export interface WindState {
  baseX: number;
  gustX: number;
}

export interface RainParticle {
  pos: Vec2;
  vel: Vec2;
  life: number;
}

export interface SimStats {
  elapsedMs: number;
  waterEvaporated: number;
  waterRained: number;
  waterWasted: number;
}

export type GamePhase = 'playing' | 'complete';

export interface GameState {
  phase: GamePhase;
  cloud: Cloud;
  wind: WindState;
  fields: Field[];
  mountains: Mountain[];
  sea: SeaRegion;
  particles: RainParticle[];
  stats: SimStats;
  bounds: { w: number; h: number };
}

// ————————————————————————————————————————————————————————————
// Input → Sim
// ————————————————————————————————————————————————————————————

export interface InputIntent {
  pointerActive: boolean;
  pointer: Vec2;
  rainHeld: boolean;
}

// ————————————————————————————————————————————————————————————
// Sim → Audio / result screen
// ————————————————————————————————————————————————————————————

export type SimEvent =
  | { type: 'evaporate'; amount: number }
  | { type: 'rainStart' }
  | { type: 'rainStop' }
  | { type: 'fieldBloom'; fieldId: number }
  | { type: 'fieldOverwater'; fieldId: number }
  | { type: 'mountainLeak'; amount: number }
  | { type: 'levelComplete'; stats: SimStats };

export type UiSound = { type: 'uiTap' } | { type: 'star'; index: number };

// ————————————————————————————————————————————————————————————
// Module ① Sim — pure logic, no DOM/Canvas, deterministic, unit-testable
// ————————————————————————————————————————————————————————————

export interface SimModule {
  init(level: LevelRuntime): GameState;
  /**
   * Advances state in place by dtMs (fixed step) and returns events emitted
   * this step. Must be deterministic: same (state, intent, dtMs) in →
   * same resulting state + events out.
   */
  step(state: GameState, intent: InputIntent, dtMs: number): SimEvent[];
}

// ————————————————————————————————————————————————————————————
// Module ② Render — pure function of state, never mutates it
// ————————————————————————————————————————————————————————————

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
}

export interface RenderModule {
  draw(ctx: CanvasRenderingContext2D, state: GameState, vp: Viewport): void;
}

// ————————————————————————————————————————————————————————————
// Module ⑤ Audio — Web Audio synthesis only, zero audio files
// ————————————————————————————————————————————————————————————

export interface AudioModule {
  play(e: SimEvent | UiSound): void;
  setMuted(m: boolean): void;
  isMuted(): boolean;
}

// ————————————————————————————————————————————————————————————
// Module ③ Levels / difficulty / stars / save data
// ————————————————————————————————————————————————————————————

export type Tier = 'easy' | 'hard';

export interface TierParams {
  windBaseX: number;
  gustAmp: number;
  gustPeriodMs: number;
  cloudMaxWater: number;
  evapRate: number;
  rainRate: number;
  starThresholds?: { timeMs: [number, number]; waste: [number, number] };
}

export interface FieldDef {
  normX: number;
  normY: number;
  targetMin: number;
  targetMax: number;
  radius: number;
}

export interface LevelDef {
  id: number;
  name: string;
  fields: FieldDef[];
  mountains?: { normX: number; normY: number; width: number; height: number }[];
  seaWidthN: number;
  tiers: Record<Tier, TierParams>;
  factCardKey?: string;
  tutorial?: TutorialStep[];
}

export interface LevelRuntime extends LevelDef {
  tier: Tier;
  worldW: number;
  worldH: number;
}

export interface TutorialStep {
  trigger: string;
  textKey: string;
  anchor?: Vec2;
}

export interface ProfileClear {
  stars: number;
  clearedEasy: boolean;
  clearedHard: boolean;
}

export interface Profile {
  id: string;
  name: string;
  colorId: number;
  clears: Record<number, ProfileClear>;
}

export interface ProgressStore {
  listProfiles(): Profile[];
  createProfile(name: string, colorId: number): Profile;
  getProfile(id: string): Profile | undefined;
  recordClear(profileId: string, levelId: number, tier: Tier, stars: number): void;
}

export interface LevelsModule {
  all(): LevelDef[];
  byId(id: number): LevelDef | undefined;
  evalStars(level: LevelDef, tier: Tier, stats: SimStats): number;
  progress: ProgressStore;
}

// ————————————————————————————————————————————————————————————
// Module ④ Input adapter
// ————————————————————————————————————————————————————————————

export interface InputModule {
  attach(canvas: HTMLCanvasElement, vp: () => Viewport): void;
  read(state: GameState): InputIntent;
  setRainButton(held: boolean): void;
}

// ————————————————————————————————————————————————————————————
// Module ⑥ UI shell (DOM overlay, lives in #ui-root)
// ————————————————————————————————————————————————————————————

export type Scene = 'profile' | 'menu' | 'levelselect' | 'playing' | 'result';

export interface UiCallbacks {
  onSelectProfile(id: string): void;
  onCreateProfile(name: string, colorId: number): void;
  onSelectLevel(id: number, tier: Tier): void;
  onPause(): void;
  onResume(): void;
  onRetry(): void;
  onNext(): void;
  onQuit(): void;
  onToggleMute(): void;
  /** The on-screen ☔ button was pressed/released (an alternate rain trigger
   *  alongside Input's own "hold still over a field" heuristic). */
  onRainHold(held: boolean): void;
}

export interface UiModule {
  mount(root: HTMLElement, cb: UiCallbacks): void;
  setScene(scene: Scene, data?: unknown): void;
  updateHud(state: GameState, tier: Tier): void;
  showResult(stars: number, factCardText?: string): void;
}
