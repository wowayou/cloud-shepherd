/**
 * V2 prototype — "Valley Weather Toy" (direction 1+4).
 *
 * NOT the campaign loop (drag cloud A→B). You are the weather over one valley:
 *   - Slide on the sky to aim rain
 *   - Hold ☔ to pour (intensity grows with hold)
 *   - Sun strength slowly shifts; drought creeps if you ignore patches
 *   - Soft win: keep the valley alive until dusk; soft fail: too many dead patches
 *
 * Fun criteria (solo, from MODULES § Fun bar): after ~3 min, do YOU want another run?
 * This file is intentionally self-contained so v1 campaign stays frozen.
 */

export type V2Phase = 'playing' | 'won' | 'lost';

export interface V2Patch {
  id: number;
  /** 0..1 along valley floor. */
  x: number;
  /** Moisture 0..1. */
  wet: number;
  /** 0 healthy … 1 fully wilted/dead. */
  stress: number;
  dead: boolean;
  /** Bloom sparkle 0..1 once well-watered. */
  bloom: number;
}

export interface V2State {
  phase: V2Phase;
  /** 0..1 day arc (dawn→dusk). */
  day: number;
  sun: number;
  /** Rain aim 0..1. */
  aimX: number;
  raining: boolean;
  rainPressure: number;
  patches: V2Patch[];
  /** Soft score: seconds the valley stayed mostly green. */
  aliveSec: number;
  elapsedSec: number;
  message: string;
}

const DAY_LEN_SEC = 90; // one run ~1.5 min — short enough to "one more"
const PATCH_N = 7;
const RAIN_RADIUS = 0.14; // fraction of valley width
const DRY_RATE = 0.045; // wetness loss / sec at full sun
const STRESS_RATE = 0.08; // stress gain when wet < 0.18
const HEAL_RATE = 0.12;
const RAIN_RATE = 0.55; // wetness gain / sec under full pour at center
const WIN_DAY = 0.92;
const LOSE_DEAD = 3;

export function createV2State(): V2State {
  const patches: V2Patch[] = [];
  for (let i = 0; i < PATCH_N; i++) {
    patches.push({
      id: i,
      x: 0.12 + (i / (PATCH_N - 1)) * 0.76,
      wet: 0.45 + (i % 3) * 0.08,
      stress: 0,
      dead: false,
      bloom: 0,
    });
  }
  return {
    phase: 'playing',
    day: 0.08,
    sun: sunAt(0.08),
    aimX: 0.5,
    raining: false,
    rainPressure: 0,
    patches,
    aliveSec: 0,
    elapsedSec: 0,
    message: '拖动瞄准 · 按住 ☔ 下雨 · 别让田旱死',
  };
}

function sunAt(day: number): number {
  // Gentle arc, never fully dark so the player isn't soft-locked.
  const arc = Math.sin(Math.max(0, Math.min(1, day)) * Math.PI);
  return 0.35 + 0.65 * arc;
}

export function stepV2(state: V2State, dtSec: number): void {
  if (state.phase !== 'playing') return;
  const dt = Math.min(0.05, Math.max(0, dtSec));
  state.elapsedSec += dt;
  state.day = Math.min(1, state.day + dt / DAY_LEN_SEC);
  state.sun = sunAt(state.day);

  // Pressure eases toward 1 while held, decays fast when released.
  if (state.raining) {
    state.rainPressure = Math.min(1, state.rainPressure + dt * 1.2);
  } else {
    state.rainPressure = Math.max(0, state.rainPressure - dt * 2.5);
  }

  let healthy = 0;
  for (const p of state.patches) {
    if (p.dead) continue;

    // Evaporation scales with sun — noon is harsher (C3: same action, different time).
    const dry = DRY_RATE * state.sun * dt;
    p.wet = Math.max(0, p.wet - dry);

    // Rain contribution if aim is near this patch.
    if (state.raining && state.rainPressure > 0.02) {
      const d = Math.abs(p.x - state.aimX);
      if (d < RAIN_RADIUS) {
        const falloff = 1 - d / RAIN_RADIUS;
        p.wet = Math.min(1, p.wet + RAIN_RATE * state.rainPressure * falloff * falloff * dt);
      }
    }

    // Stress / heal
    if (p.wet < 0.18) {
      p.stress = Math.min(1, p.stress + STRESS_RATE * (0.5 + state.sun) * dt);
    } else {
      p.stress = Math.max(0, p.stress - HEAL_RATE * p.wet * dt);
    }
    if (p.wet > 0.55 && p.stress < 0.25) {
      p.bloom = Math.min(1, p.bloom + dt * 0.35);
    } else {
      p.bloom = Math.max(0, p.bloom - dt * 0.1);
    }
    if (p.stress >= 1) {
      p.dead = true;
      p.bloom = 0;
    } else {
      healthy += 1;
    }
  }

  const dead = state.patches.filter((p) => p.dead).length;
  if (dead >= LOSE_DEAD) {
    state.phase = 'lost';
    state.message = '太多田旱死了… 再试一次？';
    state.raining = false;
    return;
  }

  if (healthy >= PATCH_N - 1) state.aliveSec += dt;

  if (state.day >= WIN_DAY) {
    state.phase = 'won';
    state.raining = false;
    const score = Math.round(state.aliveSec);
    state.message = `黄昏到了 · 山谷撑过了今天（活力 ${score}s）`;
  } else if (dead === 1) {
    state.message = '有一块田快不行了，快去下雨！';
  } else if (state.sun > 0.85) {
    state.message = '正午很晒，水分跑得快';
  } else if (state.raining) {
    state.message = state.rainPressure > 0.7 ? '大雨！别浇过头的地方也行' : '细雨滋润中…';
  } else {
    state.message = '拖动瞄准 · 按住 ☔ 下雨';
  }
}

export function drawV2(
  ctx: CanvasRenderingContext2D,
  state: V2State,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  const w = cssW;
  const h = cssH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Sky by day / sun
  const sun = state.sun;
  const top = mix(120, 180, 230, 255, 160, 100, 1 - sun);
  const bot = mix(190, 230, 245, 255, 200, 150, 1 - sun);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(bot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Sun disc
  const sx = w * (0.15 + 0.7 * state.day);
  const sy = h * (0.22 - 0.08 * sun);
  const sr = h * (0.05 + 0.03 * sun);
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.5);
  sg.addColorStop(0, `rgba(255,240,180,${0.55 + 0.35 * sun})`);
  sg.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sx, sy, sr * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgb(255,${Math.round(200 + 40 * sun)},${Math.round(100 + 40 * sun)})`;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  // Ground
  const groundY = h * 0.72;
  const gg = ctx.createLinearGradient(0, groundY, 0, h);
  gg.addColorStop(0, '#c4b07a');
  gg.addColorStop(1, '#9a8658');
  ctx.fillStyle = gg;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Patches
  for (const p of state.patches) {
    const px = p.x * w;
    const py = groundY + h * 0.02;
    const rw = w * 0.055;
    const rh = h * 0.045;
    let col: [number, number, number];
    if (p.dead) col = [110, 95, 70];
    else if (p.wet > 0.55) col = [90, 170, 90];
    else if (p.wet > 0.25) col = [150, 170, 90];
    else col = [170, 140, 80];
    // Stress tints brown
    if (!p.dead && p.stress > 0.3) {
      const t = Math.min(1, p.stress);
      col = [
        col[0] + (130 - col[0]) * t,
        col[1] + (100 - col[1]) * t,
        col[2] + (60 - col[2]) * t,
      ];
    }
    ctx.fillStyle = rgb(col);
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stress cracks
    if (!p.dead && p.stress > 0.4) {
      ctx.strokeStyle = `rgba(80,60,40,${0.35 + 0.4 * p.stress})`;
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + p.id;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * rw * 0.7, py + Math.sin(a) * rh * 0.7);
        ctx.stroke();
      }
    }

    // Bloom dots
    if (p.bloom > 0.2 && !p.dead) {
      ctx.globalAlpha = p.bloom;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + p.id * 0.7;
        ctx.fillStyle = k === 0 ? '#ff8fa3' : k === 1 ? '#ffd166' : '#c9a6ff';
        ctx.beginPath();
        ctx.arc(px + Math.cos(a) * rw * 0.45, py - rh * 0.6 + Math.sin(a) * rh * 0.2, 4 + p.bloom * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Rain curtain under aim
  if (state.raining || state.rainPressure > 0.05) {
    const ax = state.aimX * w;
    const dens = 8 + Math.round(state.rainPressure * 22);
    ctx.save();
    ctx.strokeStyle = `rgba(100,150,210,${0.25 + 0.45 * state.rainPressure})`;
    ctx.lineWidth = 1.5 + state.rainPressure;
    ctx.lineCap = 'round';
    for (let i = 0; i < dens; i++) {
      const ox = (hash(i * 3.1 + Math.floor(state.elapsedSec * 20)) - 0.5) * w * RAIN_RADIUS * 1.6;
      const top = h * 0.28 + hash(i) * h * 0.1;
      const len = h * (0.08 + 0.12 * state.rainPressure);
      const phase = (state.elapsedSec * (40 + i * 3) + i * 17) % (groundY - top);
      const y0 = top + phase;
      ctx.globalAlpha = 0.35 + 0.5 * state.rainPressure * (1 - Math.abs(ox) / (w * RAIN_RADIUS + 1));
      ctx.beginPath();
      ctx.moveTo(ax + ox, y0);
      ctx.lineTo(ax + ox - 2, Math.min(groundY - 4, y0 + len));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Cloud body at aim
  const cx = state.aimX * w;
  const cy = h * 0.26;
  const cr = h * (0.055 + 0.02 * state.rainPressure);
  ctx.save();
  ctx.fillStyle = state.raining
    ? `rgb(${Math.round(160 - 40 * state.rainPressure)},${Math.round(175 - 30 * state.rainPressure)},${Math.round(190 - 20 * state.rainPressure)})`
    : '#ffffff';
  ctx.shadowColor = 'rgba(40,60,90,0.25)';
  ctx.shadowBlur = 16;
  cloudBlob(ctx, cx, cy, cr);
  ctx.shadowBlur = 0;
  // Face
  ctx.fillStyle = '#5c6b7a';
  ctx.beginPath();
  ctx.arc(cx - cr * 0.22, cy, cr * 0.08, 0, Math.PI * 2);
  ctx.arc(cx + cr * 0.22, cy, cr * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5c6b7a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (state.raining) {
    ctx.ellipse(cx, cy + cr * 0.2, cr * 0.1, cr * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.arc(cx, cy + cr * 0.05, cr * 0.2, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  // HUD strip
  ctx.fillStyle = 'rgba(22,50,79,0.55)';
  roundRect(ctx, 12, 12, w - 24, 44, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.max(13, h * 0.022)}px system-ui,sans-serif`;
  ctx.textBaseline = 'middle';
  const dead = state.patches.filter((p) => p.dead).length;
  const live = state.patches.length - dead;
  const dayPct = Math.round(state.day * 100);
  ctx.fillText(`🌿 ${live}/${state.patches.length}   ☀️ ${Math.round(sun * 100)}%   ⏱ ${dayPct}%`, 28, 34);

  // Message
  ctx.fillStyle = 'rgba(22,50,79,0.5)';
  const mw = Math.min(w - 40, 420);
  roundRect(ctx, (w - mw) / 2, h - 56, mw, 36, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `500 ${Math.max(12, h * 0.02)}px system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(state.message, w / 2, h - 38);
  ctx.textAlign = 'left';

  // End overlay
  if (state.phase !== 'playing') {
    ctx.fillStyle = 'rgba(15,30,50,0.45)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, w * 0.2, h * 0.32, w * 0.6, h * 0.28, 16);
    ctx.fill();
    ctx.fillStyle = '#16324f';
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.max(18, h * 0.035)}px system-ui,sans-serif`;
    ctx.fillText(state.phase === 'won' ? '山谷撑过来了' : '田旱得太多了', w / 2, h * 0.42);
    ctx.font = `500 ${Math.max(13, h * 0.022)}px system-ui,sans-serif`;
    ctx.fillStyle = '#3a5a7a';
    ctx.fillText(state.message, w / 2, h * 0.5);
    ctx.fillText('点一下再来一把 · 或按返回', w / 2, h * 0.56);
    ctx.textAlign = 'left';
  }
}

function cloudBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  const bumps: [number, number, number][] = [
    [-0.7, 0.1, 0.55],
    [-0.25, -0.35, 0.6],
    [0.3, -0.3, 0.65],
    [0.75, 0.05, 0.5],
    [0.1, 0.25, 0.55],
    [-0.35, 0.25, 0.5],
  ];
  for (const [dx, dy, rr] of bumps) {
    ctx.moveTo(cx + dx * r + rr * r, cy + dy * r);
    ctx.arc(cx + dx * r, cy + dy * r, rr * r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mix(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [r1 + (r2 - r1) * u, g1 + (g2 - g1) * u, b1 + (b2 - b1) * u];
}
function rgb(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Hit-test helpers for UI buttons in end overlay — full screen tap = retry. */
export function v2WantsRetry(state: V2State): boolean {
  return state.phase !== 'playing';
}
