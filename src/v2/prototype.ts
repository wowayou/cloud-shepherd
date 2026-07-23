/**
 * V2 prototype — "Closed Water Cycle" (direction C).
 *
 * The pivot the campaign never made: WATER IS CONSERVED AND VISIBLE.
 *
 * There is exactly one pool of water in the world (TOTAL units). It only ever
 * MOVES between three places — the sea, the cloud, and the fields — it is never
 * created or destroyed. A permanent stacked bar at the top shows this: sea +
 * cloud + fields always fill the same width. That bar IS the lesson: "水没有变
 *多也没有变少，只是一直在转圈" — taught by watching it, not by reading it.
 *
 * The loop:
 *   ☀️ Sun evaporates sea → cloud (automatic, sun-driven). Sea level visibly drops.
 *   ☔ You aim + pour cloud → fields. Cloud empties; you must choose where.
 *   💧 Fields slowly drain back → sea (percolation). Sea refills; the cycle closes.
 *
 * The puzzle (why it's not "haul A→B"): water is FINITE and fields drain at
 * DIFFERENT speeds. You cannot fill one and walk away — by the time the far
 * field is green the near one has drained. And if you hoard water in the cloud,
 * the sea runs low and evaporation stalls. The skill is keeping ALL of it
 * flowing so every field sits in its happy band AT ONCE. Hold that balance a
 * few seconds → the valley blooms (win). Never-fail: dry fields wilt but always
 * recover; dusk without balance is a soft "try again", not a death.
 *
 * Fun bar (solo, see FUN.md): after ~3 min, do YOU want another run?
 */

export type V2Phase = 'playing' | 'won' | 'lost';

export interface V2Field {
  id: number;
  x: number; // 0..1 along valley
  moisture: number; // water units held
  thirst: number; // drain-rate multiplier (varied so balancing is real)
  bloom: number; // 0..1 sparkle when in-band
}

export interface V2State {
  phase: V2Phase;
  day: number; // 0..1 dawn→dusk
  sun: number;
  aimX: number;
  raining: boolean;
  rainPressure: number;
  sea: number; // water units in the sea
  cloud: number; // water units in the cloud
  fields: V2Field[];
  /** Continuous seconds all fields have been in their happy band. */
  balanceSec: number;
  elapsedSec: number;
  message: string;
  /** Conserved constant — sum of sea+cloud+fields, for the teaching bar + test. */
  total: number;
}

// —— Conserved-water tunables (all in the same abstract "unit") ——
const TOTAL = 100;
const FIELD_N = 5;
const CLOUD_CAP = 22;

const GREEN_LO = 7; // below → wilting (recoverable)
const GREEN_HI = 18; // above → flooded (drains back fast)
const FIELD_SOFT_CAP = 30;

const EVAP_K = 6; // sea→cloud units/sec at full sun, empty cloud
const RAIN_K = 15; // cloud→ground units/sec at full pour
const RAIN_RADIUS = 0.16; // fraction of valley width the rain covers
const DRAIN_HALFLIFE = 9; // sec for a field at thirst 1 to halve toward sea
const FLOOD_DRAIN_MULT = 4; // flooded fields shed the excess quickly

const DAY_LEN_SEC = 100;
const WIN_HOLD_SEC = 4; // hold all-green this long → bloom + win

export function createV2State(): V2State {
  const fields: V2Field[] = [];
  // Varied thirst so keeping every field green at once is a real juggling act,
  // not "water them once". Deterministic spread, no RNG (replays are the same
  // puzzle so the player can actually learn it).
  const thirsts = [0.6, 1.35, 0.85, 1.15, 0.7];
  for (let i = 0; i < FIELD_N; i++) {
    fields.push({
      id: i,
      x: 0.16 + (i / (FIELD_N - 1)) * 0.68,
      moisture: 5, // start a touch dry — you must get the cycle going
      thirst: thirsts[i % thirsts.length],
      bloom: 0,
    });
  }
  const fieldSum = fields.reduce((s, f) => s + f.moisture, 0);
  const cloud = 6;
  return {
    phase: 'playing',
    day: 0.1,
    sun: sunAt(0.1),
    aimX: 0.5,
    raining: false,
    rainPressure: 0,
    sea: TOTAL - cloud - fieldSum, // sea holds the rest — conservation exact
    cloud,
    fields,
    balanceSec: 0,
    elapsedSec: 0,
    total: TOTAL,
    message: '拖动瞄准 · 按住 ☔ 下雨 · 让每块田都变绿',
  };
}

function sunAt(day: number): number {
  const arc = Math.sin(Math.max(0, Math.min(1, day)) * Math.PI);
  return 0.3 + 0.7 * arc;
}

export function stepV2(state: V2State, dtSec: number): void {
  if (state.phase !== 'playing') return;
  const dt = Math.min(0.05, Math.max(0, dtSec));
  state.elapsedSec += dt;
  state.day = Math.min(1, state.day + dt / DAY_LEN_SEC);
  state.sun = sunAt(state.day);

  if (state.raining) {
    state.rainPressure = Math.min(1, state.rainPressure + dt * 1.6);
  } else {
    state.rainPressure = Math.max(0, state.rainPressure - dt * 3);
  }

  // ——— 1. Evaporation: sea → cloud (sun-driven, tapers as cloud fills) ———
  // This is the only inflow to the cloud, and it drains the sea visibly. When
  // the sea is low it slows (there's less to lift) — the scarcity that makes
  // hoarding water in the cloud a real cost.
  const cloudRoom = CLOUD_CAP - state.cloud;
  if (cloudRoom > 0 && state.sea > 0) {
    const seaFrac = Math.min(1, state.sea / 30); // slows as the sea runs low
    let e = EVAP_K * state.sun * (cloudRoom / CLOUD_CAP) * seaFrac * dt;
    e = Math.min(e, state.sea);
    state.sea -= e;
    state.cloud += e;
  }

  // ——— 2. Rain: cloud → fields (caught) + sea (runoff) ———
  // Water leaving the cloud is conserved: whatever isn't caught by a field runs
  // off back to the sea. Nothing evaporates into nothing.
  if (state.raining && state.rainPressure > 0.02 && state.cloud > 0) {
    let out = Math.min(RAIN_K * state.rainPressure * dt, state.cloud);
    state.cloud -= out;
    // Distribute across fields under the aim by falloff weight.
    const weights: number[] = [];
    let wSum = 0;
    for (const f of state.fields) {
      const d = Math.abs(f.x - state.aimX);
      const w = d < RAIN_RADIUS ? (1 - d / RAIN_RADIUS) ** 2 : 0;
      weights.push(w);
      wSum += w;
    }
    if (wSum > 0) {
      for (let i = 0; i < state.fields.length; i++) {
        if (weights[i] <= 0) continue;
        const give = out * (weights[i] / wSum);
        state.fields[i].moisture += give;
      }
    } else {
      // Aim hit bare ground → runoff straight back to the sea (still conserved).
      state.sea += out;
      out = 0;
    }
  }

  // ——— 3. Field drainage: fields → sea (percolation, closes the loop) ———
  const baseDecay = Math.log(2) / DRAIN_HALFLIFE; // per-sec toward 0
  let allGreen = true;
  for (const f of state.fields) {
    // Flooded fields shed their excess to the sea quickly.
    const flooded = f.moisture > GREEN_HI;
    const k = baseDecay * f.thirst * (flooded ? FLOOD_DRAIN_MULT : 1);
    const drained = f.moisture * (1 - Math.exp(-k * dt));
    f.moisture -= drained;
    state.sea += drained; // conserved: percolation returns to the sea
    if (f.moisture > FIELD_SOFT_CAP) {
      // hard clamp overflow also returns to sea (never destroyed)
      state.sea += f.moisture - FIELD_SOFT_CAP;
      f.moisture = FIELD_SOFT_CAP;
    }

    const inBand = f.moisture >= GREEN_LO && f.moisture <= GREEN_HI;
    if (inBand) {
      f.bloom = Math.min(1, f.bloom + dt * 0.8);
    } else {
      f.bloom = Math.max(0, f.bloom - dt * 0.6);
      allGreen = false;
    }
  }

  // Keep the conserved total honest against float drift.
  state.total = state.sea + state.cloud + state.fields.reduce((s, f) => s + f.moisture, 0);

  // ——— Win: hold the whole valley in balance for a few seconds ———
  if (allGreen) {
    state.balanceSec += dt;
    if (state.balanceSec >= WIN_HOLD_SEC) {
      state.phase = 'won';
      state.raining = false;
      state.message = '整个山谷一起绿了！水一直在转圈——它没变多也没变少 🌈';
      return;
    }
  } else {
    state.balanceSec = Math.max(0, state.balanceSec - dt * 0.5);
  }

  if (state.day >= 1) {
    state.phase = 'lost';
    state.raining = false;
    state.message = '天黑了，还没让每块田同时变绿 · 再试一次？';
    return;
  }

  // Coaching messages — nudge toward the balance idea, not just "rain more".
  const dryCount = state.fields.filter((f) => f.moisture < GREEN_LO).length;
  const wetCount = state.fields.filter((f) => f.moisture > GREEN_HI).length;
  if (allGreen) {
    state.message = `快成了！全绿保持住… ${Math.ceil(WIN_HOLD_SEC - state.balanceSec)}`;
  } else if (state.sea < 12) {
    state.message = '海快空了 · 停一会儿，让田里的水渗回大海再用';
  } else if (wetCount > 0 && dryCount > 0) {
    state.message = '有的太湿、有的太干 · 把雨匀给干的那几块';
  } else if (dryCount > 0) {
    state.message = state.raining ? '滋润干田中…' : '有田发黄了，浇浇它';
  } else {
    state.message = '拖动瞄准 · 按住 ☔ 下雨';
  }
}

// ————————————————————————————————————————————————————————————
// Render
// ————————————————————————————————————————————————————————————

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

  const sun = state.sun;
  // Sky
  const top = mix(120, 180, 230, 255, 165, 105, 1 - sun);
  const bot = mix(195, 232, 246, 255, 205, 155, 1 - sun);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(bot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Sun disc tracks the day
  const sx = w * (0.12 + 0.76 * state.day);
  const sy = h * (0.2 - 0.06 * sun);
  const sr = h * (0.045 + 0.03 * sun);
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.6);
  sg.addColorStop(0, `rgba(255,240,180,${0.5 + 0.4 * sun})`);
  sg.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sx, sy, sr * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgb(255,${Math.round(205 + 35 * sun)},${Math.round(105 + 40 * sun)})`;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  // —— The sea: a reservoir on the right whose LEVEL moves with state.sea ——
  const groundY = h * 0.6;
  const seaX = w * 0.78;
  // land
  const gg = ctx.createLinearGradient(0, groundY, 0, h);
  gg.addColorStop(0, '#c4b07a');
  gg.addColorStop(1, '#9a8658');
  ctx.fillStyle = gg;
  ctx.fillRect(0, groundY, seaX, h - groundY);
  // sea basin
  ctx.fillStyle = '#6a5a3c';
  ctx.fillRect(seaX, groundY, w - seaX, h - groundY);
  // sea water level — SEA maps to basin height; this is the visible "how much
  // water is left in the world's reservoir right now".
  const seaMax = TOTAL; // sea can in principle hold everything
  const seaFillFrac = Math.max(0, Math.min(1, state.sea / (seaMax * 0.9)));
  const seaTopY = h - (h - groundY) * seaFillFrac;
  const seaGrad = ctx.createLinearGradient(0, seaTopY, 0, h);
  seaGrad.addColorStop(0, '#57b8e0');
  seaGrad.addColorStop(1, '#2f7fb0');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(seaX, seaTopY, w - seaX, h - seaTopY);
  // shimmer line
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = seaX; x <= w; x += 8) {
    const yy = seaTopY + Math.sin(x * 0.05 + state.elapsedSec * 2) * 3;
    if (x === seaX) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(22,50,79,0.55)';
  ctx.font = `600 ${Math.max(11, h * 0.02)}px system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('大海', (seaX + w) / 2, groundY - 8);
  ctx.textAlign = 'left';

  // —— Fields ——
  for (const f of state.fields) {
    const px = f.x * seaX;
    const py = groundY + h * 0.03;
    const rw = seaX * 0.07;
    const rh = h * 0.05;
    let col: [number, number, number];
    if (f.moisture > GREEN_HI) col = [70, 130, 170]; // flooded → bluish
    else if (f.moisture >= GREEN_LO) col = [90, 175, 90]; // happy green
    else if (f.moisture >= GREEN_LO * 0.5) col = [165, 175, 90];
    else col = [175, 145, 85]; // parched
    ctx.fillStyle = rgb(col);
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();

    // moisture mini-gauge above each field so "which is dry" is readable
    const bw = rw * 1.6;
    const bx = px - bw / 2;
    const by = py - rh - 14;
    ctx.fillStyle = 'rgba(22,50,79,0.25)';
    roundRect(ctx, bx, by, bw, 6, 3);
    ctx.fill();
    const band = (GREEN_HI - GREEN_LO) / FIELD_SOFT_CAP;
    // green band marker
    ctx.fillStyle = 'rgba(90,200,120,0.5)';
    ctx.fillRect(bx + bw * (GREEN_LO / FIELD_SOFT_CAP), by, bw * band, 6);
    const mf = Math.max(0, Math.min(1, f.moisture / FIELD_SOFT_CAP));
    ctx.fillStyle = f.moisture > GREEN_HI ? '#4aa0d0' : f.moisture >= GREEN_LO ? '#5ac878' : '#d0a24a';
    roundRect(ctx, bx, by, bw * mf, 6, 3);
    ctx.fill();

    if (f.bloom > 0.15 && f.moisture >= GREEN_LO && f.moisture <= GREEN_HI) {
      ctx.globalAlpha = f.bloom;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + f.id * 0.7;
        ctx.fillStyle = k === 0 ? '#ff8fa3' : k === 1 ? '#ffd166' : '#c9a6ff';
        ctx.beginPath();
        ctx.arc(px + Math.cos(a) * rw * 0.5, py - rh * 0.7 + Math.sin(a) * rh * 0.2, 3 + f.bloom * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // —— Rain curtain + cloud at aim (aim is over land only) ——
  const ax = Math.min(state.aimX, seaX / w) * seaX / (seaX / w === 0 ? 1 : 1);
  const aimPx = state.aimX * w;
  if (state.raining || state.rainPressure > 0.05) {
    ctx.save();
    ctx.strokeStyle = `rgba(100,150,210,${0.25 + 0.45 * state.rainPressure})`;
    ctx.lineWidth = 1.5 + state.rainPressure;
    ctx.lineCap = 'round';
    const dens = 8 + Math.round(state.rainPressure * 20);
    for (let i = 0; i < dens; i++) {
      const ox = (hash(i * 3.1) - 0.5) * w * RAIN_RADIUS * 1.6;
      const t0 = h * 0.3 + hash(i) * h * 0.08;
      const len = h * (0.06 + 0.1 * state.rainPressure);
      const phase = (state.elapsedSec * (40 + i * 3) + i * 17) % (groundY - t0);
      const y0 = t0 + phase;
      ctx.globalAlpha = 0.35 + 0.5 * state.rainPressure * (1 - Math.abs(ox) / (w * RAIN_RADIUS + 1));
      ctx.beginPath();
      ctx.moveTo(aimPx + ox, y0);
      ctx.lineTo(aimPx + ox - 2, Math.min(groundY - 4, y0 + len));
      ctx.stroke();
    }
    ctx.restore();
  }
  void ax;

  const cx = aimPx;
  const cy = h * 0.24;
  const cloudFrac = state.cloud / CLOUD_CAP;
  const cr = h * (0.05 + 0.03 * cloudFrac);
  ctx.save();
  ctx.fillStyle = state.raining
    ? `rgb(${Math.round(165 - 45 * state.rainPressure)},${Math.round(178 - 33 * state.rainPressure)},${Math.round(192 - 22 * state.rainPressure)})`
    : rgb(mix(255, 255, 255, 175, 188, 200, 1 - cloudFrac));
  ctx.shadowColor = 'rgba(40,60,90,0.25)';
  ctx.shadowBlur = 16;
  cloudBlob(ctx, cx, cy, cr);
  ctx.shadowBlur = 0;
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

  // —— The teaching bar: sea + cloud + fields = constant width, always ——
  drawConservationBar(ctx, state, w, h);

  // —— Message ——
  ctx.fillStyle = 'rgba(22,50,79,0.5)';
  const mw = Math.min(w - 40, 460);
  roundRect(ctx, (w - mw) / 2, h - 52, mw, 34, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `500 ${Math.max(12, h * 0.02)}px system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(state.message, w / 2, h - 35);
  ctx.textAlign = 'left';

  if (state.phase !== 'playing') {
    ctx.fillStyle = 'rgba(15,30,50,0.45)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(ctx, w * 0.18, h * 0.3, w * 0.64, h * 0.34, 16);
    ctx.fill();
    ctx.fillStyle = '#16324f';
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.max(18, h * 0.036)}px system-ui,sans-serif`;
    ctx.fillText(state.phase === 'won' ? '🌈 山谷平衡了！' : '天黑了', w / 2, h * 0.4);
    ctx.font = `500 ${Math.max(12, h * 0.02)}px system-ui,sans-serif`;
    ctx.fillStyle = '#3a5a7a';
    wrapText(ctx, state.message, w / 2, h * 0.48, w * 0.56, h * 0.03);
    ctx.fillText('点一下再来一把 · 或按返回', w / 2, h * 0.6);
    ctx.textAlign = 'left';
  }
}

/** The stacked conservation bar — the whole point of this prototype. Sea (blue)
 *  + cloud (grey) + fields (green) always sum to the same full width, so a child
 *  watches the total never change while the pieces trade back and forth. */
function drawConservationBar(ctx: CanvasRenderingContext2D, state: V2State, w: number, h: number): void {
  const barW = Math.min(w - 32, 520);
  const bx = (w - barW) / 2;
  const by = 16;
  const bh = 30;
  ctx.fillStyle = 'rgba(22,50,79,0.35)';
  roundRect(ctx, bx - 4, by - 4, barW + 8, bh + 8, 12);
  ctx.fill();

  const fieldSum = state.fields.reduce((s, f) => s + f.moisture, 0);
  const total = Math.max(1, state.total);
  const segs: [number, string, string][] = [
    [state.sea, '#57b8e0', '海'],
    [state.cloud, '#c3ccd6', '云'],
    [fieldSum, '#7bc86a', '田'],
  ];
  let x = bx;
  ctx.font = `600 ${Math.max(11, h * 0.018)}px system-ui,sans-serif`;
  ctx.textBaseline = 'middle';
  for (const [amt, color, label] of segs) {
    const segW = (amt / total) * barW;
    ctx.fillStyle = color;
    ctx.fillRect(x, by, segW, bh);
    if (segW > 34) {
      ctx.fillStyle = 'rgba(22,50,79,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + segW / 2, by + bh / 2);
    }
    x += segW;
  }
  // constant-total caption
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'left';
  ctx.font = `500 ${Math.max(10, h * 0.016)}px system-ui,sans-serif`;
  ctx.fillText('水的总量一直不变', bx, by + bh + 14);
  ctx.textBaseline = 'alphabetic';
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lh: number): void {
  // CJK-friendly greedy wrap by character.
  let line = '';
  let yy = y;
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = ch;
      yy += lh + 6;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
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

export function v2WantsRetry(state: V2State): boolean {
  return state.phase !== 'playing';
}
