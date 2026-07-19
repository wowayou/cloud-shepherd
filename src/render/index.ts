import type { Field, GameState, Mountain, RenderModule, Viewport } from '../types.ts';

// Flat, soft-pastel style. Every pixel is drawn with primitives — no images,
// no @font-face — so the game never depends on an asset finishing a network
// or disk load.

type RgbTuple = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function mixTuple(c1: RgbTuple, c2: RgbTuple, t: number): RgbTuple {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function toRgb(c: RgbTuple): string {
  return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
}

// Classic "back out" ease — overshoots past 1 before settling, giving pops
// (like a flower blooming) a satisfying bounce instead of a flat glide.
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const t = clamp01(x);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Deterministic 0..1 pseudo-random from a number seed — used for stable
// per-instance variation (crack placement, tree scatter, …) that never
// flickers between frames, without touching Math.random()/Date.now().
function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, timeMs: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#8fd0ee');
  grad.addColorStop(0.6, '#bfe6f5');
  grad.addColorStop(1, '#e8f6ee');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  drawSun(ctx, w, h, timeMs);

  // a couple of slow, purely decorative background puffs
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    const speed = 6 + i * 3;
    const x = ((timeMs / 1000) * speed + i * w * 0.4) % (w + 200) - 100;
    const y = h * (0.12 + i * 0.07);
    drawPuff(ctx, x, y, h * 0.05);
  }
  ctx.restore();
}

// The sun sits over the sea side of the world — it's the engine of the whole
// water cycle (it drives the evaporation the child sees as rising vapor), so
// it deserves to be visibly present, gently pulsing, not just implied.
function drawSun(ctx: CanvasRenderingContext2D, w: number, h: number, timeMs: number): void {
  const cx = w * 0.1;
  const cy = h * 0.13;
  const r = h * 0.055;
  const pulse = 1 + Math.sin(timeMs / 1400) * 0.04;

  ctx.save();
  // halo
  const halo = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.6 * pulse);
  halo.addColorStop(0, 'rgba(255, 236, 160, 0.55)');
  halo.addColorStop(1, 'rgba(255, 236, 160, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.6 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // slowly turning rays
  ctx.strokeStyle = 'rgba(255, 210, 100, 0.7)';
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.lineCap = 'round';
  const spin = timeMs / 9000;
  for (let i = 0; i < 8; i++) {
    const a = spin + (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35);
    ctx.lineTo(cx + Math.cos(a) * r * (1.7 + 0.12 * Math.sin(timeMs / 700 + i)), cy + Math.sin(a) * r * (1.7 + 0.12 * Math.sin(timeMs / 700 + i)));
    ctx.stroke();
  }

  // body
  const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * pulse);
  body.addColorStop(0, '#fff6c9');
  body.addColorStop(1, '#ffd166');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Mirror of sim's absorb condition (over the sea band + flying low + not
// full) — display-only, so a drifted constant here can't break gameplay.
const VAPOR_ABSORB_BAND_FRAC = 0.11;

/**
 * Evaporation made visible. Ambient wisps rise gently off the sea the whole
 * time (the sun is always working); when the cloud is low over the sea and
 * drinking, a denser stream of wisps climbs from the surface into the cloud's
 * belly, so "the cloud fills with water" reads as "sea water becomes vapor
 * and rises into the cloud" — the actual first stage of the water cycle.
 */
function drawVapor(ctx: CanvasRenderingContext2D, state: GameState, timeMs: number): void {
  const { h } = state.bounds;
  const { sea, cloud } = state;

  ctx.save();
  ctx.fillStyle = '#ffffff';

  // ambient: always-on lazy wisps over the sea
  const ambientCount = 4;
  for (let i = 0; i < ambientCount; i++) {
    const t = ((timeMs / 4200) + i / ambientCount) % 1;
    const x = sea.x0 + (sea.x1 - sea.x0) * (0.15 + 0.7 * hash1(i * 17.3));
    const sway = Math.sin(t * Math.PI * 3 + i) * h * 0.012;
    const y = sea.y - t * h * 0.17;
    ctx.globalAlpha = Math.sin(t * Math.PI) * 0.28;
    ctx.beginPath();
    ctx.arc(x + sway, y, h * 0.011 * (1 + t), 0, Math.PI * 2);
    ctx.fill();
  }

  // absorbing: a visible stream from the surface into the cloud
  const overSea = cloud.pos.x >= sea.x0 && cloud.pos.x <= sea.x1;
  const lowOverSea = sea.y - cloud.pos.y <= h * VAPOR_ABSORB_BAND_FRAC;
  const drinking = overSea && lowOverSea && cloud.water < cloud.maxWater;
  if (drinking) {
    const streamCount = 6;
    for (let i = 0; i < streamCount; i++) {
      const t = ((timeMs / 1100) + i / streamCount) % 1;
      const srcX = cloud.pos.x + (hash1(i * 7.7) - 0.5) * h * 0.16;
      const dstX = cloud.pos.x + (hash1(i * 3.1) - 0.5) * h * 0.05;
      const x = lerp(srcX, dstX, t) + Math.sin(t * Math.PI * 2 + i) * h * 0.008;
      const y = lerp(sea.y, cloud.pos.y + h * 0.045, t);
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, h * 0.009 * (1.4 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x - r * 0.6, y, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 0.6, y, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x, y - r * 0.3, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
}

function drawGroundAndSea(ctx: CanvasRenderingContext2D, state: GameState, timeMs: number): void {
  const { w, h } = state.bounds;
  const { sea } = state;

  // land, from the sea's edge to the right side of the world
  const landGrad = ctx.createLinearGradient(0, sea.y, 0, h);
  landGrad.addColorStop(0, '#d9c398');
  landGrad.addColorStop(1, '#c2a877');
  ctx.fillStyle = landGrad;
  ctx.fillRect(sea.x1, sea.y, w - sea.x1, h - sea.y);

  // sea
  const seaGrad = ctx.createLinearGradient(0, sea.y, 0, h);
  seaGrad.addColorStop(0, '#57b8e0');
  seaGrad.addColorStop(1, '#2f7fb0');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(sea.x0, sea.y, sea.x1 - sea.x0, h - sea.y);

  // gentle shimmer lines
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, h * 0.004);
  const waveCount = 4;
  for (let i = 0; i < waveCount; i++) {
    const yy = sea.y + h * 0.03 + i * h * 0.045;
    const phase = timeMs / 900 + i;
    ctx.beginPath();
    for (let x = sea.x0; x <= sea.x1; x += 12) {
      const yy2 = yy + Math.sin(x * 0.02 + phase) * h * 0.006;
      if (x === sea.x0) ctx.moveTo(x, yy2);
      else ctx.lineTo(x, yy2);
    }
    ctx.stroke();
  }
  ctx.restore();

  // soft foam line at the shore
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1.5, h * 0.006);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = sea.y; y <= h; y += 8) {
    const xx = sea.x1 + Math.sin(y * 0.15 + timeMs / 700) * h * 0.004;
    if (y === sea.y) ctx.moveTo(xx, y);
    else ctx.lineTo(xx, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ————————————————————————————————————————————————————————————
// Mountains — a jagged multi-peak ridge with snow caps and a tiny treeline,
// derived deterministically from each mountain's own position/size so the
// silhouette is stable frame to frame without needing Math.random().
// ————————————————————————————————————————————————————————————

const RIDGE_PROFILE: { x: number; h: number }[] = [
  { x: -1, h: 0 },
  { x: -0.74, h: 0.4 },
  { x: -0.5, h: 0.2 },
  { x: -0.26, h: 0.64 },
  { x: -0.08, h: 0.3 },
  { x: 0.04, h: 1 },
  { x: 0.22, h: 0.44 },
  { x: 0.46, h: 0.7 },
  { x: 0.72, h: 0.26 },
  { x: 1, h: 0 },
];

function drawTinyTree(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  ctx.fillStyle = '#3f6b47';
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x - h * 0.42, y);
  ctx.lineTo(x + h * 0.42, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#345c3c';
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.55);
  ctx.lineTo(x - h * 0.3, y - h * 0.02);
  ctx.lineTo(x + h * 0.3, y - h * 0.02);
  ctx.closePath();
  ctx.fill();
}

function drawMountain(ctx: CanvasRenderingContext2D, m: Mountain): void {
  const left = m.pos.x - m.width / 2;
  const right = m.pos.x + m.width / 2;
  const baseY = m.pos.y;
  const H = m.height;
  const seed = m.pos.x * 0.7 + m.width * 0.37;

  const jitter = RIDGE_PROFILE.map((_p, i) => (i === 0 || i === RIDGE_PROFILE.length - 1 ? 0 : (hash1(seed + i) - 0.5) * 0.14));
  const ridge = RIDGE_PROFILE.map((p, i) => ({ x: p.x, h: Math.max(0, p.h + jitter[i]) }));
  const pts = ridge.map((p) => ({ x: m.pos.x + p.x * (m.width / 2), y: baseY - p.h * H }));

  // body
  const grad = ctx.createLinearGradient(0, baseY - H, 0, baseY);
  grad.addColorStop(0, '#bcc7c6');
  grad.addColorStop(0.42, '#8fa688');
  grad.addColorStop(1, '#5c7c5c');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(left, baseY);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(right, baseY);
  ctx.closePath();
  ctx.fill();

  // rocky crevice strokes on the taller slopes
  ctx.save();
  ctx.strokeStyle = 'rgba(65,85,75,0.28)';
  ctx.lineWidth = Math.max(1, H * 0.012);
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (baseY - p.y < H * 0.18) continue;
    const dir = hash1(seed + i + 50) > 0.5 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + H * 0.08);
    ctx.lineTo(p.x + dir * m.width * 0.035, baseY - (baseY - p.y) * 0.4);
    ctx.stroke();
  }
  ctx.restore();

  // snow caps on the local peaks that are tall enough
  const snowLine = 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  for (let i = 1; i < pts.length - 1; i++) {
    const hFrac = ridge[i].h;
    if (hFrac < snowLine || hFrac < ridge[i - 1].h || hFrac < ridge[i + 1].h) continue;
    const p = pts[i];
    const capH = H * (hFrac - snowLine) * 0.85 + H * 0.05;
    const capW = m.width * 0.1 * (0.6 + hFrac * 0.4);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - capW * 0.5, p.y + capH * 0.5);
    ctx.lineTo(p.x - capW * 0.2, p.y + capH * 0.3);
    ctx.lineTo(p.x, p.y + capH);
    ctx.lineTo(p.x + capW * 0.2, p.y + capH * 0.3);
    ctx.lineTo(p.x + capW * 0.5, p.y + capH * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // a little treeline scattered along the base
  const treeCount = Math.max(4, Math.round(m.width / 26));
  for (let i = 0; i < treeCount; i++) {
    const tx = left + ((i + 0.5) / treeCount) * m.width + (hash1(seed + i + 80) - 0.5) * (m.width / treeCount) * 0.6;
    const th = H * (0.05 + hash1(seed + i + 90) * 0.04);
    drawTinyTree(ctx, tx, baseY - H * 0.01, th);
  }
}

const DRY_COLOR: RgbTuple = [193, 154, 107];
const GROWING_COLOR: RgbTuple = [156, 190, 98];
const BLOOM_COLOR: RgbTuple = [96, 168, 92];
const OVERWATER_COLOR: RgbTuple = [90, 140, 150];

function drawCrack(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number): void {
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(angle) * len * 0.5, y - Math.sin(angle) * len * 0.5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + Math.cos(angle + 0.55) * len * 0.6, y + Math.sin(angle + 0.55) * len * 0.6);
  ctx.stroke();
}

function drawBlade(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, lean: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, h * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * h * 0.5, y - h * 0.6, x + lean * h * 0.8, y - h);
  ctx.stroke();
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.6, -len * 0.4, len, 0);
  ctx.quadraticCurveTo(len * 0.6, len * 0.4, 0, 0);
  ctx.fill();
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, rot: number): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff7cf';
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.18, -r * 0.18, r, 0);
  ctx.quadraticCurveTo(r * 0.18, r * 0.18, 0, r);
  ctx.quadraticCurveTo(-r * 0.18, r * 0.18, -r, 0);
  ctx.quadraticCurveTo(-r * 0.18, -r * 0.18, 0, -r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRipple(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha: number): void {
  ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFlower(ctx: CanvasRenderingContext2D, headX: number, headY: number, size: number, sway: number, palette: [string, string, string]): void {
  if (size <= 0.6) return;
  ctx.save();

  const baseX = headX - size * 0.12;
  const baseY = headY + size * 0.95;

  ctx.strokeStyle = '#4f8a52';
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(headX - size * sway * 2, headY + size * 0.5, headX, headY + size * 0.08);
  ctx.stroke();

  drawLeaf(ctx, headX - size * 0.26, headY + size * 0.7, -0.7 - sway, size * 0.85, '#5ea25f');
  drawLeaf(ctx, headX + size * 0.2, headY + size * 0.55, 0.6 + sway, size * 0.7, '#6bb06c');

  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(sway * 0.5);
  const petalCount = 5;
  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = i % 2 === 0 ? palette[0] : palette[1];
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.62, size * 0.34, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = palette[2];
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(-size * 0.12, -size * 0.12, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

const FLOWER_PALETTES: [string, string, string][] = [
  ['#ff8fa3', '#ffd166', '#fff3b0'],
  ['#f6a8cf', '#ffffff', '#ffe08a'],
  ['#c9a6ff', '#ffe066', '#fff7d6'],
];

function drawField(ctx: CanvasRenderingContext2D, f: Field, timeMs: number): void {
  const t = f.targetMin > 0 ? clamp01(f.moisture / f.targetMin) : f.moisture > 0 ? 1 : 0;
  const rx = f.radius;
  const ry = f.radius * 0.55;
  const fx = f.pos.x;
  const fy = f.pos.y;
  const seed = f.id * 13.37 + 4;

  let baseTuple: RgbTuple;
  if (f.state === 'bloom') baseTuple = BLOOM_COLOR;
  else if (f.state === 'overwater') baseTuple = mixTuple(GROWING_COLOR, OVERWATER_COLOR, 0.7);
  else baseTuple = mixTuple(DRY_COLOR, GROWING_COLOR, t);

  const lightTuple = mixTuple(baseTuple, [255, 255, 255], 0.32);
  const darkTuple = mixTuple(baseTuple, [30, 22, 14], 0.26);

  ctx.save();

  // soft contact shadow, grounding the patch
  ctx.beginPath();
  ctx.ellipse(fx, fy + ry * 0.22, rx * 1.02, ry * 0.95, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(60,45,30,0.14)';
  ctx.fill();

  // patch body, gently shaded like a small mound
  const patchGrad = ctx.createRadialGradient(fx - rx * 0.22, fy - ry * 0.4, rx * 0.08, fx, fy, rx * 1.1);
  patchGrad.addColorStop(0, toRgb(lightTuple));
  patchGrad.addColorStop(1, toRgb(darkTuple));
  ctx.beginPath();
  ctx.ellipse(fx, fy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = patchGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,20,0.16)';
  ctx.lineWidth = Math.max(1, rx * 0.02);
  ctx.stroke();

  if (f.state === 'dry') {
    ctx.strokeStyle = 'rgba(110,80,50,0.4)';
    ctx.lineWidth = Math.max(1, rx * 0.014);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = hash1(seed + i) * Math.PI * 2;
      const cx = fx + Math.cos(a) * rx * 0.4;
      const cy = fy + Math.sin(a) * ry * 0.4;
      drawCrack(ctx, cx, cy, rx * (0.14 + hash1(seed + i + 9) * 0.08), a);
    }
  } else if (f.state === 'growing') {
    const bladeCount = 3;
    for (let i = 0; i < bladeCount; i++) {
      const bx = fx + (hash1(seed + i) - 0.5) * rx * 1.3;
      const by = fy + (hash1(seed + i + 5) - 0.5) * ry * 0.9;
      const lean = hash1(seed + i + 11) - 0.5;
      const h = rx * (0.16 + 0.5 * t) * (0.7 + hash1(seed + i + 20) * 0.5);
      drawBlade(ctx, bx, by, h, lean, '#6ea35f');
      drawBlade(ctx, bx + rx * 0.03, by, h * 0.85, lean + 0.3, '#7fb56d');
    }
    if (t > 0.5) {
      const bt = clamp01((t - 0.5) / 0.5);
      const budTuple = mixTuple([110, 165, 100], [255, 170, 190], bt);
      ctx.fillStyle = toRgb(budTuple);
      ctx.beginPath();
      ctx.ellipse(fx, fy - ry * 0.45, rx * (0.05 + 0.06 * bt), rx * (0.08 + 0.09 * bt), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (f.state === 'bloom') {
    const tuftCount = 7;
    for (let i = 0; i < tuftCount; i++) {
      const a = (i / tuftCount) * Math.PI * 2 + hash1(seed + i) * 0.3;
      const tx = fx + Math.cos(a) * rx * 0.88;
      const ty = fy + Math.sin(a) * ry * 0.88;
      const h = rx * (0.1 + hash1(seed + i + 40) * 0.06);
      drawBlade(ctx, tx, ty, h, Math.cos(a) * 0.6, '#5a9a5c');
      drawBlade(ctx, tx + rx * 0.02, ty, h * 0.8, Math.cos(a) * 0.6 + 0.4, '#71b364');
    }

    const popT = easeOutBack(f.bloom01);
    const flowers = [
      { dx: 0, dy: -ry * 0.28, s: rx * 0.36, phase: 0 },
      { dx: -rx * 0.4, dy: ry * 0.02, s: rx * 0.22, phase: 1.1 },
      { dx: rx * 0.4, dy: -ry * 0.02, s: rx * 0.24, phase: 2.2 },
    ];
    flowers.forEach((fl, i) => {
      const localSway = Math.sin((timeMs / 1000) * 1.3 + seed + fl.phase) * 0.12;
      drawFlower(ctx, fx + fl.dx, fy + fl.dy, fl.s * popT, localSway, FLOWER_PALETTES[i % FLOWER_PALETTES.length]);
    });

    if (f.bloom01 > 0.85) {
      const sparkleAlpha = (f.bloom01 - 0.85) / 0.15;
      for (let i = 0; i < 2; i++) {
        const a = (timeMs / 1000) * 1.5 + i * 3.1 + seed;
        const pulse = (Math.sin(a) + 1) / 2;
        const sx = fx + (i === 0 ? -rx * 0.55 : rx * 0.5);
        const sy = fy - ry * (i === 0 ? 0.5 : 0.15);
        drawSparkle(ctx, sx, sy, rx * 0.05, sparkleAlpha * pulse * 0.7, a);
      }
    }
  } else if (f.state === 'overwater') {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(fx - rx * 0.2, fy - ry * 0.3, rx * 0.42, ry * 0.24, -0.3, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const period = 1600;
      const phase = ((timeMs + i * period * 0.33) % period) / period;
      const grow = phase * 0.95;
      drawRipple(ctx, fx, fy, rx * (0.15 + grow * 0.85), ry * (0.15 + grow * 0.85), (1 - phase) * 0.6);
    }

    ctx.strokeStyle = '#4f7a52';
    ctx.lineWidth = Math.max(1, rx * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, fy + ry * 0.1);
    ctx.quadraticCurveTo(fx + rx * 0.18, fy - ry * 0.1, fx + rx * 0.32, fy + ry * 0.05);
    ctx.stroke();
    drawLeaf(ctx, fx + rx * 0.3, fy + ry * 0.04, 0.9, rx * 0.14, '#4f7a52');
  }

  ctx.restore();
}

// ————————————————————————————————————————————————————————————
// Cloud — a rounder puff cluster with a small friendly face; wetness (fill
// level) drives both size and tint, and it gains a rippling blue underside
// while raining.
// ————————————————————————————————————————————————————————————

const CLOUD_BUMPS: [number, number, number][] = [
  [-1.28, 0.34, 0.5],
  [-0.8, -0.02, 0.6],
  [-0.32, -0.48, 0.66],
  [0.24, -0.54, 0.72],
  [0.76, -0.14, 0.62],
  [1.26, 0.32, 0.5],
  [0.5, 0.4, 0.56],
  [-0.5, 0.4, 0.56],
  [0, 0.46, 0.62],
];

function drawCloudBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (const [dx, dy, rr] of CLOUD_BUMPS) {
    ctx.moveTo(cx + dx * r + rr * r, cy + dy * r);
    ctx.arc(cx + dx * r, cy + dy * r, rr * r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawCloudFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, raining: boolean): void {
  const eyeDX = r * 0.24;
  const eyeY = cy - r * 0.04;
  const eyeR = r * 0.075;

  for (const dir of [-1, 1]) {
    ctx.fillStyle = '#5c6b7a';
    ctx.beginPath();
    ctx.arc(cx + dir * eyeDX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx + dir * eyeDX - eyeR * 0.32, eyeY - eyeR * 0.32, eyeR * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,150,162,0.4)';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + dir * r * 0.42, cy + r * 0.14, r * 0.11, r * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#5c6b7a';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.lineCap = 'round';
  if (raining) {
    ctx.fillStyle = '#5c6b7a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.08, r * 0.08, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.02, r * 0.22, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { cloud, bounds } = state;
  const wetness = cloud.maxWater > 0 ? cloud.water / cloud.maxWater : 0;
  const t = state.stats.elapsedMs / 1000;
  const baseR = bounds.h * (0.052 + 0.034 * wetness);
  const bob = Math.sin(t * 1.6) * bounds.h * 0.006;
  const breathe = 1 + Math.sin(t * 1.3) * 0.02;
  const cx = cloud.pos.x;
  const cy = cloud.pos.y + bob;
  const r = baseR * breathe;

  const bodyTuple = mixTuple([255, 255, 255], [162, 176, 191], wetness);
  const shadeTuple = mixTuple([210, 220, 228], [110, 126, 145], wetness);

  ctx.save();
  ctx.shadowColor = 'rgba(45,65,90,0.3)';
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.14;

  const grad = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.42, r * 0.12, cx, cy, r * 1.5);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, toRgb(bodyTuple));
  grad.addColorStop(1, toRgb(shadeTuple));
  ctx.fillStyle = grad;
  drawCloudBlob(ctx, cx, cy, r);

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (cloud.raining) {
    // a soft, wavy drip-hem well below the face — clearly separate from it,
    // so it never reads as a second row of eyes/mouths
    const hemY = cy + r * 0.94;
    const halfW = r * 1.16;
    const scallops = 6;
    ctx.fillStyle = 'rgba(63, 92, 138, 0.55)';
    ctx.beginPath();
    ctx.moveTo(cx - halfW, hemY - r * 0.12);
    ctx.lineTo(cx - halfW, hemY);
    for (let i = 0; i < scallops; i++) {
      const x1 = cx - halfW + ((i + 1) / scallops) * halfW * 2;
      const xm = cx - halfW + ((i + 0.5) / scallops) * halfW * 2;
      const wob = Math.sin(t * 3.2 + i * 1.4) * r * 0.03;
      const dip = hemY + r * (0.22 + wob);
      ctx.quadraticCurveTo(xm, dip, x1, hemY);
    }
    ctx.lineTo(cx + halfW, hemY - r * 0.12);
    ctx.closePath();
    ctx.fill();
  }

  drawCloudFace(ctx, cx, cy, r, cloud.raining);

  ctx.restore();
}

function drawRain(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.save();
  ctx.lineCap = 'round';
  const dotR = Math.max(1, state.bounds.h * 0.0028);
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.6);
    ctx.strokeStyle = '#5b86c2';
    ctx.lineWidth = Math.max(1.4, state.bounds.h * 0.0045);
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.lineTo(p.pos.x - p.vel.x * 0.02, p.pos.y - p.vel.y * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#bcd6f2';
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWindHint(ctx: CanvasRenderingContext2D, state: GameState): void {
  const windX = state.wind.baseX + state.wind.gustX;
  if (Math.abs(windX) < 1) return;
  const { w, h } = state.bounds;
  const y = h * 0.08;
  const dir = Math.sign(windX);
  const strength = Math.min(1, Math.abs(windX) / 40);
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.35 * strength;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, h * 0.006);
  ctx.lineCap = 'round';
  const count = 3;
  for (let i = 0; i < count; i++) {
    const cx = w * (0.25 + i * 0.18);
    ctx.beginPath();
    ctx.moveTo(cx - dir * h * 0.02, y);
    ctx.lineTo(cx + dir * h * 0.02, y);
    ctx.lineTo(cx + dir * h * 0.01, y - h * 0.012);
    ctx.moveTo(cx + dir * h * 0.02, y);
    ctx.lineTo(cx + dir * h * 0.01, y + h * 0.012);
    ctx.stroke();
  }
  ctx.restore();
}

export function createRender(): RenderModule {
  function draw(ctx: CanvasRenderingContext2D, state: GameState, vp: Viewport): void {
    const { w, h } = state.bounds;
    ctx.save();
    ctx.translate(vp.offsetX, vp.offsetY);
    ctx.scale(vp.scale, vp.scale);

    drawSky(ctx, w, h, state.stats.elapsedMs);
    drawGroundAndSea(ctx, state, state.stats.elapsedMs);
    for (const m of state.mountains) drawMountain(ctx, m);
    for (const f of state.fields) drawField(ctx, f, state.stats.elapsedMs);
    drawWindHint(ctx, state);
    drawVapor(ctx, state, state.stats.elapsedMs);
    drawCloud(ctx, state);
    drawRain(ctx, state);

    ctx.restore();
  }

  return { draw };
}
