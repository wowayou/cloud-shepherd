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
  /**
   * How hard the cloud is raining right now, 0..1. 0 when not raining.
   * Maps onto rate, particle density, rain-sound brightness and the drip-hem
   * darkness so a light hold and a long hold *look and sound* different.
   * See InputIntent.rainPressure for how the player drives this.
   */
  rainPressure: number;
  /** True while frozen — inside a ColdFront, or still thawing after leaving. */
  chilled: boolean;
  /** Milliseconds of thaw left after leaving a cold front. */
  thawMs: number;
}

/**
 * Wind is expressed as a *steady-state displacement in world units*, not as an
 * acceleration: `baseX: 45` means a held cloud settles 45 world-units downwind
 * of the player's finger. See sim/index.ts for why this axis is deliberately
 * independent of the pointer-follow spring constants.
 */
export interface WindState {
  baseX: number;
  gustX: number;
}

/** A rising column of warm air over hot ground: lifts the cloud while inside. */
export interface Thermal {
  /** Column centre x; `pos.y` is the ground line it rises from. */
  pos: Vec2;
  width: number;
  /** How far above the ground the column still lifts. */
  height: number;
  /** Upward settle-point offset in world units, same units as WindState. */
  lift: number;
}

/** A flock drifting horizontally; knocks water loose from a cloud it hits. */
export interface Bird {
  pos: Vec2;
  /** Signed horizontal speed in world units/sec; wraps at the world edges. */
  vx: number;
  radius: number;
  /** Wing-flap phase, advanced by the sim so Render stays a pure function. */
  flap: number;
}

/** A slow-drifting cold zone: inside it the cloud can neither drink nor rain. */
export interface ColdFront {
  pos: Vec2;
  radius: number;
  vx: number;
}

/**
 * The sun, simulated rather than decorative — it is the engine of the whole
 * water cycle and the game's core lesson. Its intensity drives how fast the sea
 * evaporates and how strongly thermals rise, so a child can *see* that the sun
 * is what lifts the water, without being told.
 */
export interface SunState {
  /** 0..1 through the simulated day: 0 = dawn, 0.5 = noon, 1 = dusk. */
  dayPhase: number;
  /** Current heating power, 0..1. Multiplies evaporation and thermal lift. */
  intensity: number;
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

/**
 * Delayed mountain-slope runoff. Pure sim data — Render may draw a trickle
 * from mountain → field while `delayMs` counts down. Deterministic: same
 * rain-on-slope sequence produces the same queue.
 */
export interface RunoffPacket {
  /** Index into GameState.mountains. */
  mountainId: number;
  /** Field that will receive the water, or -1 if it drains to sea (wasted). */
  fieldId: number;
  amount: number;
  /** Milliseconds remaining before delivery. */
  delayMs: number;
  /** World-space x where the rain hit the slope (for a short trickle draw). */
  hitX: number;
}

export interface GameState {
  phase: GamePhase;
  cloud: Cloud;
  wind: WindState;
  fields: Field[];
  mountains: Mountain[];
  thermals: Thermal[];
  birds: Bird[];
  coldFronts: ColdFront[];
  sun: SunState;
  /**
   * One or more evaporative water bodies. Legacy levels built with
   * `LevelDef.seaWidthN` become a single left-edge sea; newer levels can place
   * seas anywhere (centre lake, dual coast, …) via `LevelDef.seas`.
   */
  seas: SeaRegion[];
  /** In-flight mountain-slope runoff packets (round 11 light hydrology). */
  runoff: RunoffPacket[];
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
  /**
   * Continuous rain intensity, 0..1. Optional so existing call sites
   * (tests, autopilot) that only set `rainHeld` keep working: the Sim treats
   * a missing value as a mid-strength default (~0.58 → rate ×1.0) so calibrated
   * star gates and the "every level completes" autopilot do not silently
   * rescale. Player input ramps this with hold duration — a short hold is a
   * light drizzle (precise, slow), a long hold is a downpour (fast, easier to
   * overwater). Force-touch / second-finger is deliberately NOT required: those
   * only work on some devices and would break the 6-year-old "simplest path"
   * redline if they were the only way to rain hard.
   */
  rainPressure?: number;
}

// ————————————————————————————————————————————————————————————
// Sim → Audio / result screen
// ————————————————————————————————————————————————————————————

export type SimEvent =
  | { type: 'evaporate'; amount: number }
  | { type: 'rainStart' }
  | { type: 'rainStop' }
  /**
   * Emitted every sim step while raining (and once at the edge) so Audio can
   * continuous-modulate the rain loop's gain/brightness with pressure. Cheap
   * and throttled at the listener; not a gameplay event.
   */
  | { type: 'rainPressure'; pressure: number }
  | { type: 'fieldBloom'; fieldId: number }
  | { type: 'fieldOverwater'; fieldId: number }
  | { type: 'mountainLeak'; amount: number }
  /**
   * Rain landed on a mountain slope and is now running downhill toward a field
   * (or the sea). `amount` is the water queued for delayed delivery — not yet
   * on any field. Visual/audio cue for "runoff", the missing quarter of the
   * water-cycle lesson that used to just become waterWasted.
   */
  | { type: 'runoff'; amount: number; mountainId: number }
  | { type: 'birdHit'; amount: number }
  | { type: 'chillEnter' }
  | { type: 'chillExit' }
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
  /** Steady-state downwind displacement of a held cloud, in world units
   *  (world is 720 tall). Not an acceleration — see WindState. */
  windBaseX: number;
  /** Peak extra displacement of the oscillating gust, same units. */
  gustAmp: number;
  gustPeriodMs: number;
  /** Real milliseconds for one simulated dawn→dusk arc. Time is deliberately
   *  compressed; the HUD says so out loud rather than pretending otherwise. */
  dayLengthMs?: number;
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
  /** Dynamic obstacles. All positions/sizes are normalized like FieldDef;
   *  `lift`/`speed` are in world units (per second for speeds). */
  thermals?: { normX: number; width: number; height: number; lift: number }[];
  birds?: { normY: number; speed: number; radius: number; startN: number }[];
  coldFronts?: { normX: number; normY: number; radius: number; speed: number }[];
  /**
   * Legacy single-sea width as a fraction of worldW, always starting at x=0.
   * Used when `seas` is omitted. Kept so every pre-round-10 level stays a
   * one-line def; new templates that break "sea on the left" use `seas`.
   */
  seaWidthN: number;
  /**
   * Optional multi-sea layout. Each entry is a horizontal band at the ground
   * line (`normX0`..`normX1`, fractions of worldW). When present, `seaWidthN`
   * is ignored for geometry (still required for the "has a water source"
   * sanity check — set it to the total fraction of world covered by water).
   */
  seas?: { normX0: number; normX1: number }[];
  tiers: Record<Tier, TierParams>;
  factCardKey?: string;
  tutorial?: TutorialStep[];
  /** Key into STRINGS.levelIntro — a one-line "here's the new hazard" note
   *  shown for the opening seconds of a level that introduces a mechanic. */
  introKey?: string;
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

/** Everything the result screen needs to explain *why* the player got N stars. */
export interface StarBreakdown {
  tier: Tier;
  elapsedMs: number;
  waste: number;
  /** Absent on easy tier, which always awards 3. */
  thresholds?: { timeMs: [number, number]; waste: [number, number] };
}

export interface UiModule {
  mount(root: HTMLElement, cb: UiCallbacks): void;
  setScene(scene: Scene, data?: unknown): void;
  updateHud(state: GameState, tier: Tier): void;
  showResult(stars: number, factCardText?: string, breakdown?: StarBreakdown): void;
}
