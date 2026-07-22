import type { Bird, ColdFront, Field, GameState, Mountain, RenderModule, Thermal, Viewport } from '../types.ts';

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

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, timeMs: number, sunIntensity: number): void {
  // A weak dawn/dusk sun tints the whole sky slightly warmer and dimmer, not
  // just its own disc — real skies do this, and it's a second, ambient channel
  // (independent of the sun's own glow) for "the sun's strength is changing"
  // to reach the player peripherally, without a caption.
  const dim = 1 - sunIntensity;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, toRgb(mixTuple([143, 208, 238], [232, 186, 150], dim * 0.35)));
  grad.addColorStop(0.6, toRgb(mixTuple([191, 230, 245], [237, 205, 176], dim * 0.35)));
  grad.addColorStop(1, '#e8f6ee');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  drawSun(ctx, w, h, timeMs, sunIntensity);

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
/**
 * `sunIntensity` (0..1, the same value that drives evaporation and thermal
 * lift in Sim) now visibly changes the sun itself: a weak sun is smaller,
 * paler and duskier-toned with short, sparse rays; a strong one is bigger,
 * whiter-hot and throws long, busy rays. Round 8 — this is the fix for
 * "太阳也要有强弱变化，完全模拟...通过游戏和画面看懂": before this the sun's
 * disc was purely time-animated (pulse/spin) and looked identical regardless
 * of what its intensity was actually doing to the rest of the simulation.
 */
function drawSun(ctx: CanvasRenderingContext2D, w: number, h: number, timeMs: number, sunIntensity: number): void {
  const cx = w * 0.1;
  const cy = h * 0.13;
  const strength = Math.max(0, Math.min(1, sunIntensity));
  const r = h * (0.042 + 0.02 * strength);
  const pulse = 1 + Math.sin(timeMs / 1400) * 0.04;

  // dawn/dusk skews toward orange-red; noon is near-white-gold
  const weakColor: RgbTuple = [255, 160, 96];
  const strongColor: RgbTuple = [255, 246, 201];
  const bodyInner = toRgb(mixTuple(weakColor, strongColor, strength));
  const bodyOuter = toRgb(mixTuple([230, 130, 70], [255, 209, 102], strength));
  const haloColor = mixTuple([255, 170, 110], [255, 236, 160], strength);

  ctx.save();
  // halo — brighter and wider at full strength
  const haloR = r * (2.1 + 0.7 * strength) * pulse;
  const halo = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, haloR);
  halo.addColorStop(0, `rgba(${haloColor[0]}, ${haloColor[1]}, ${haloColor[2]}, ${(0.3 + 0.35 * strength).toFixed(3)})`);
  halo.addColorStop(1, `rgba(${haloColor[0]}, ${haloColor[1]}, ${haloColor[2]}, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // slowly turning rays — more of them, and reaching further, at full strength
  ctx.strokeStyle = `rgba(255, ${Math.round(150 + 60 * strength)}, ${Math.round(70 + 40 * strength)}, ${(0.4 + 0.4 * strength).toFixed(3)})`;
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.lineCap = 'round';
  const spin = timeMs / 9000;
  const rayCount = 4 + Math.round(strength * 4);
  const rayReach = 1.55 + 0.35 * strength;
  for (let i = 0; i < rayCount; i++) {
    const a = spin + (i / rayCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35);
    ctx.lineTo(
      cx + Math.cos(a) * r * (rayReach + 0.12 * Math.sin(timeMs / 700 + i)),
      cy + Math.sin(a) * r * (rayReach + 0.12 * Math.sin(timeMs / 700 + i)),
    );
    ctx.stroke();
  }

  // body
  const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * pulse);
  body.addColorStop(0, bodyInner);
  body.addColorStop(1, bodyOuter);
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
  const { seas, cloud } = state;
  if (seas.length === 0) return;

  ctx.save();
  ctx.fillStyle = '#ffffff';

  // Ambient wisps over every water body, always on but scaled by the sun: a
  // weak dawn sun gives a couple of faint, slow puffs; a noon sun gives a
  // busier, more opaque rise. This is the same `sun.intensity` that sets the
  // actual evaporation rate in Sim, so the amount of visible vapor honestly
  // tracks how fast the cloud is really filling — not a separate decorative number.
  const sunFactor = 0.4 + 0.6 * state.sun.intensity;
  const ambientCount = 2 + Math.round(sunFactor * 3);
  for (let si = 0; si < seas.length; si++) {
    const sea = seas[si];
    for (let i = 0; i < ambientCount; i++) {
      const t = ((timeMs / (5200 - 2000 * sunFactor)) + i / ambientCount + si * 0.17) % 1;
      const x = sea.x0 + (sea.x1 - sea.x0) * (0.15 + 0.7 * hash1(i * 17.3 + si * 9.1));
      const sway = Math.sin(t * Math.PI * 3 + i) * h * 0.012;
      const y = sea.y - t * h * 0.17;
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.28 * sunFactor;
      ctx.beginPath();
      ctx.arc(x + sway, y, h * 0.011 * (1 + t), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // absorbing: a visible stream from the surface into the cloud
  let drinkingSea = seas.find((s) => cloud.pos.x >= s.x0 && cloud.pos.x <= s.x1);
  const lowOverSea = drinkingSea
    ? drinkingSea.y - cloud.pos.y <= h * VAPOR_ABSORB_BAND_FRAC
    : false;
  const drinking = !!drinkingSea && lowOverSea && cloud.water < cloud.maxWater;
  if (drinking && drinkingSea) {
    const streamCount = 6;
    for (let i = 0; i < streamCount; i++) {
      const t = ((timeMs / 1100) + i / streamCount) % 1;
      const srcX = cloud.pos.x + (hash1(i * 7.7) - 0.5) * h * 0.16;
      const dstX = cloud.pos.x + (hash1(i * 3.1) - 0.5) * h * 0.05;
      const x = lerp(srcX, dstX, t) + Math.sin(t * Math.PI * 2 + i) * h * 0.008;
      const y = lerp(drinkingSea.y, cloud.pos.y + h * 0.045, t);
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
  const seas = state.seas;
  // Ground line is the same for every sea (all sit on GROUND_Y_FRAC).
  const groundY = seas[0]?.y ?? h * 0.82;

  // Full land strip first, then punch water bodies on top. This is what lets
  // multi-sea layouts (centre lake, dual coast) work without special-casing
  // "land is everything to the right of the one sea".
  const landGrad = ctx.createLinearGradient(0, groundY, 0, h);
  landGrad.addColorStop(0, '#d9c398');
  landGrad.addColorStop(1, '#c2a877');
  ctx.fillStyle = landGrad;
  ctx.fillRect(0, groundY, w, h - groundY);

  for (const sea of seas) {
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

    // soft foam lines on both shores of this water body
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1.5, h * 0.006);
    ctx.lineCap = 'round';
    for (const edge of [sea.x0, sea.x1]) {
      ctx.beginPath();
      for (let y = sea.y; y <= h; y += 8) {
        const xx = edge + Math.sin(y * 0.15 + timeMs / 700) * h * 0.004 * (edge === sea.x0 ? -1 : 1);
        if (y === sea.y) ctx.moveTo(xx, y);
        else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
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

/**
 * Post-bloom life. Pure function of (field, timeMs) — no GameState mutation,
 * no Sim events, no new types. Butterflies orbit a bloomed field once
 * bloom01 has settled enough that the flowers are visibly open (~0.55+).
 * Deterministic via hash1(field.id) so two fields never twin-sync, and the
 * dual-run equality tests stay green (Render is never asserted on bytes
 * across runs, but this still avoids Math.random).
 *
 * Why not a Sim EcoEntity[]: round-9 design critique parked eco-dex / meta
 * collection; this is the "look, the world woke up" juice only. If we later
 * want a图鉴 that records species, that is when they become real entities.
 */
function drawButterfly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  flap: number,
  alpha: number,
  seed: number,
): void {
  if (alpha <= 0.02) return;
  const wingOpen = 0.55 + 0.45 * Math.abs(Math.sin(flap * 8));
  const bodyHue = hash1(seed + 3);
  // Two soft palettes so neighbouring fields don't clone each other.
  const wingA = bodyHue > 0.5 ? 'rgba(255, 170, 90, ' : 'rgba(160, 140, 255, ';
  const wingB = bodyHue > 0.5 ? 'rgba(255, 220, 140, ' : 'rgba(210, 190, 255, ';
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  // body
  ctx.fillStyle = 'rgba(55, 45, 40, 0.85)';
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.18, size * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // wings — mirrored ellipses that "flap" by scaling on X
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.scale(dir * wingOpen, 1);
    ctx.fillStyle = wingA + (0.75).toFixed(2) + ')';
    ctx.beginPath();
    ctx.ellipse(size * 0.55, -size * 0.15, size * 0.55, size * 0.42, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = wingB + (0.7).toFixed(2) + ')';
    ctx.beginPath();
    ctx.ellipse(size * 0.5, size * 0.28, size * 0.4, size * 0.32, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawBee(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  flap: number,
  alpha: number,
): void {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  // yellow body with two dark bands
  ctx.fillStyle = '#f0c84a';
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.55, size * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 30, 20, 0.85)';
  ctx.fillRect(-size * 0.12, -size * 0.32, size * 0.1, size * 0.64);
  ctx.fillRect(size * 0.1, -size * 0.32, size * 0.1, size * 0.64);
  // translucent wings
  const wingY = -size * 0.15 + Math.sin(flap * 14) * size * 0.08;
  ctx.fillStyle = 'rgba(220, 235, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-size * 0.15, wingY, size * 0.35, size * 0.22, -0.4, 0, Math.PI * 2);
  ctx.ellipse(size * 0.15, wingY, size * 0.35, size * 0.22, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFieldEco(ctx: CanvasRenderingContext2D, f: Field, timeMs: number): void {
  if (f.state !== 'bloom') return;
  // Wait until flowers have mostly popped (bloom01 eases 0→1 after lock).
  const appear = clamp01((f.bloom01 - 0.55) / 0.35);
  if (appear <= 0) return;

  const t = timeMs / 1000;
  const seed = f.id * 13.37 + 4;
  // One butterfly always; a bee joins on odd-id fields so multi-field levels
  // get a little variety without a species table.
  const butterflies = 1 + (f.id % 2 === 0 ? 1 : 0);
  for (let i = 0; i < butterflies; i++) {
    const s = seed + i * 19;
    const speed = 0.55 + hash1(s) * 0.55;
    const phase = t * speed + hash1(s + 1) * Math.PI * 2;
    const orbit = f.radius * (0.85 + hash1(s + 2) * 0.55);
    const x = f.pos.x + Math.cos(phase) * orbit;
    const y = f.pos.y - f.radius * (0.35 + 0.35 * hash1(s + 3)) + Math.sin(phase * 1.35) * f.radius * 0.4;
    drawButterfly(ctx, x, y, f.radius * (0.11 + hash1(s + 4) * 0.04), phase, appear, s);
  }
  if (f.id % 2 === 1) {
    const s = seed + 99;
    const phase = t * 1.1 + hash1(s) * 6;
    const x = f.pos.x + Math.cos(phase * 0.7) * f.radius * 0.55;
    const y = f.pos.y - f.radius * 0.7 + Math.sin(phase) * f.radius * 0.2;
    drawBee(ctx, x, y, f.radius * 0.09, phase, appear * 0.95);
  }
}

/**
 * `wind` is the signed wind strength normalized to roughly -1..1 (positive =
 * blowing right). Round 8: wind used to only move the cloud and draw sky
 * streaks — the scenery itself never reacted, which is a big part of why it
 * read as mechanical rather than like real weather. Grass blades now lean
 * with the wind and flutter faster the harder it blows, so a gust is visible
 * in the whole picture, not just as an arrow overlay.
 */
function drawField(ctx: CanvasRenderingContext2D, f: Field, timeMs: number, wind: number): void {
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
      // static per-blade personality + a shared directional bias from the wind
      // + a small per-blade flutter phase, so a gust reads as correlated but
      // not perfectly synchronized motion, like real grass.
      const flutter = Math.sin(timeMs / 1000 * 3.2 + seed + i) * Math.abs(wind) * 0.16;
      const lean = hash1(seed + i + 11) - 0.5 + wind * 0.55 + flutter;
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
      const flutter = Math.sin(timeMs / 1000 * 3.2 + seed + i) * Math.abs(wind) * 0.14;
      drawBlade(ctx, tx, ty, h, Math.cos(a) * 0.6 + wind * 0.4 + flutter, '#5a9a5c');
      drawBlade(ctx, tx + rx * 0.02, ty, h * 0.8, Math.cos(a) * 0.6 + 0.4 + wind * 0.4 + flutter, '#71b364');
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
    // Eco arrives after the flowers settle — pure render, no Sim state. Water
    // landed, life came: the design-doc's "生态涌现" at the lowest cost that
    // still reads as causality rather than a particle party.
    drawFieldEco(ctx, f, timeMs);
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

/**
 * Face states the cloud can wear. Driven purely from current GameState so
 * Render stays a pure function — no animation state lives here.
 *   idle     — smile + open eyes
 *   drinking — content squint (over the sea, water climbing)
 *   full     — cheeks puffed, brows up (water ≈ max)
 *   raining  — determined O-mouth (any pressure)
 *   chilled  — tight line mouth, tiny eyes (frozen / thawing)
 */
type CloudMood = 'idle' | 'drinking' | 'full' | 'raining' | 'chilled';

function cloudMood(state: GameState): CloudMood {
  const { cloud, seas } = state;
  if (cloud.chilled) return 'chilled';
  if (cloud.raining) return 'raining';
  const wetness = cloud.maxWater > 0 ? cloud.water / cloud.maxWater : 0;
  if (wetness > 0.92) return 'full';
  // "Drinking" only when actually over a water body with room to fill — matches
  // the vapor stream drawVapor already draws, so face and stream agree.
  const overSea = seas.some(
    (s) =>
      cloud.pos.x >= s.x0 &&
      cloud.pos.x <= s.x1 &&
      Math.abs(cloud.pos.y - s.y) < state.bounds.h * 0.18,
  );
  if (overSea && wetness < 0.98 && wetness > 0.02) return 'drinking';
  return 'idle';
}

function drawCloudFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  mood: CloudMood,
  pressure: number,
): void {
  const eyeDX = r * 0.24;
  const eyeY = cy - r * 0.04;
  const eyeR = r * 0.075;

  // Eyes — shape changes with mood; colour stays the same so the face still
  // reads as "the same cloud" across states.
  for (const dir of [-1, 1]) {
    const ex = cx + dir * eyeDX;
    if (mood === 'chilled') {
      // tiny tight eyes
      ctx.fillStyle = '#5c6b7a';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR * 0.7, eyeR * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'drinking' || mood === 'full') {
      // content squint: a short downward arc instead of a dot
      ctx.strokeStyle = '#5c6b7a';
      ctx.lineWidth = Math.max(1.5, r * 0.055);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, eyeY + eyeR * 0.15, eyeR * 0.9, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#5c6b7a';
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.32, eyeY - eyeR * 0.32, eyeR * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cheeks — redder when full (puffed), paler when chilled.
  const cheekA = mood === 'full' ? 0.55 : mood === 'chilled' ? 0.15 : 0.4;
  ctx.fillStyle = `rgba(255,150,162,${cheekA})`;
  for (const dir of [-1, 1]) {
    const cheekScale = mood === 'full' ? 1.25 : 1;
    ctx.beginPath();
    ctx.ellipse(
      cx + dir * r * 0.42,
      cy + r * 0.14,
      r * 0.11 * cheekScale,
      r * 0.07 * cheekScale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Mouth
  ctx.strokeStyle = '#5c6b7a';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.lineCap = 'round';
  if (mood === 'raining') {
    // O-mouth whose size tracks rain pressure: light drizzle = small, downpour = big effort.
    const mouthR = r * (0.07 + 0.06 * pressure);
    ctx.fillStyle = '#5c6b7a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.1, mouthR * 0.85, mouthR, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (mood === 'chilled') {
    // flat freeze line
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.14, cy + r * 0.12);
    ctx.lineTo(cx + r * 0.14, cy + r * 0.12);
    ctx.stroke();
  } else if (mood === 'full') {
    // small proud smile, slightly upturned
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.06, r * 0.16, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else {
    // idle / drinking: open smile
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
  const mood = cloudMood(state);
  const pressure = cloud.rainPressure;

  let bodyTuple = mixTuple([255, 255, 255], [162, 176, 191], wetness);
  let shadeTuple = mixTuple([210, 220, 228], [110, 126, 145], wetness);
  // Chilled clouds read cold: the body shifts toward pale ice-blue. This is the
  // only cue for a state that silently disables both drinking and raining, so
  // it is deliberately a whole-body colour change, not a small badge.
  if (cloud.chilled) {
    bodyTuple = mixTuple(bodyTuple, [198, 228, 246], 0.65);
    shadeTuple = mixTuple(shadeTuple, [150, 190, 220], 0.65);
  } else if (cloud.raining && pressure > 0.55) {
    // Heavy rain darkens the underside of the cloud — the sky cue that a real
    // downpour is coming, without needing a caption.
    const storm = (pressure - 0.55) / 0.45;
    bodyTuple = mixTuple(bodyTuple, [120, 132, 150], 0.35 * storm);
    shadeTuple = mixTuple(shadeTuple, [70, 84, 105], 0.45 * storm);
  }

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
    // so it never reads as a second row of eyes/mouths. Darkness and dip depth
    // both track pressure so a light hold and a long hold look different.
    const hemY = cy + r * 0.94;
    const halfW = r * (1.1 + 0.18 * pressure);
    const scallops = 5 + Math.round(pressure * 3);
    const alpha = 0.35 + 0.4 * pressure;
    ctx.fillStyle = `rgba(63, 92, 138, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, hemY - r * 0.12);
    ctx.lineTo(cx - halfW, hemY);
    for (let i = 0; i < scallops; i++) {
      const x1 = cx - halfW + ((i + 1) / scallops) * halfW * 2;
      const xm = cx - halfW + ((i + 0.5) / scallops) * halfW * 2;
      const wob = Math.sin(t * 3.2 + i * 1.4) * r * 0.03;
      const dip = hemY + r * (0.14 + 0.18 * pressure + wob);
      ctx.quadraticCurveTo(xm, dip, x1, hemY);
    }
    ctx.lineTo(cx + halfW, hemY - r * 0.12);
    ctx.closePath();
    ctx.fill();
  }

  drawCloudFace(ctx, cx, cy, r, mood, pressure);

  ctx.restore();
}

function drawRain(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.save();
  ctx.lineCap = 'round';
  // Stroke weight tracks pressure so a downpour's streaks are thicker, not just denser.
  const pressure = state.cloud.rainPressure;
  const baseLife = 0.6;
  const dotR = Math.max(1, state.bounds.h * (0.0024 + 0.0012 * pressure));
  const lineW = Math.max(1.2, state.bounds.h * (0.0036 + 0.0024 * pressure));
  for (const p of state.particles) {
    const life01 = Math.max(0, p.life / baseLife);
    ctx.globalAlpha = life01 * (0.7 + 0.3 * pressure);
    ctx.strokeStyle = pressure > 0.7 ? '#4a74b0' : '#5b86c2';
    ctx.lineWidth = lineW;
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

/**
 * Rainbow — pure optical causality, no caption. Drawn only when:
 *   - every field has bloomed (the level just resolved or is resolving), AND
 *   - the sun is up (intensity high enough to cast colour), AND
 *   - there are still residual rain particles in the air (or rain just ended).
 * That is the real-world recipe: sun + raindrops in the air → rainbow. Sitting
 * it behind the cloud / in front of the sky keeps it a reward, not a UI badge.
 */
function drawRainbow(ctx: CanvasRenderingContext2D, state: GameState): void {
  const allBloomed = state.fields.length > 0 && state.fields.every((f) => f.state === 'bloom');
  if (!allBloomed) return;
  if (state.sun.intensity < 0.45) return;
  // Residual rain in the air, OR the level just completed while it was raining
  // (particles may already have expired by the result frame). Either way the
  // optical story holds: you just made it rain under a bright sun.
  const hasRainAir = state.particles.length > 4 || state.phase === 'complete';
  if (!hasRainAir) return;

  const { h } = state.bounds;
  // Arc sits over the fields, not the sea — that's where the water landed.
  let fx = 0;
  for (const f of state.fields) fx += f.pos.x;
  fx /= state.fields.length;
  const cy = h * 0.62;
  const r0 = h * 0.42;
  const bands: [string, number][] = [
    ['rgba(255, 80, 80, 0.22)', 0],
    ['rgba(255, 170, 50, 0.2)', 1],
    ['rgba(255, 230, 60, 0.18)', 2],
    ['rgba(90, 210, 100, 0.16)', 3],
    ['rgba(70, 160, 255, 0.15)', 4],
    ['rgba(150, 100, 230, 0.13)', 5],
  ];
  ctx.save();
  ctx.lineCap = 'butt';
  // Fade in over the first ~1.2s of bloom so it arrives as a reward, not a flash.
  const minBloom = Math.min(...state.fields.map((f) => f.bloom01));
  const appear = Math.max(0, Math.min(1, (minBloom - 0.15) / 0.55));
  ctx.globalAlpha = 0.85 * appear * (0.55 + 0.45 * state.sun.intensity);
  for (const [color, i] of bands) {
    const rr = r0 - i * h * 0.012;
    ctx.strokeStyle = color;
    ctx.lineWidth = h * 0.011;
    ctx.beginPath();
    // Upper semicircle, gently biased toward the field cluster.
    ctx.arc(fx, cy, rr, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Wind is a real mechanic as of round 7 (it displaces the cloud from the
 * player's finger), so the hint has to actually communicate direction AND
 * strength — the old three static chevrons in one corner did neither. These are
 * drifting streaks spread over the sky whose count, length, opacity and travel
 * speed all scale with the wind, so a gust visibly surges.
 */
function drawWindHint(ctx: CanvasRenderingContext2D, state: GameState): void {
  const windX = state.wind.baseX + state.wind.gustX;
  if (Math.abs(windX) < 4) return;
  const { w, h } = state.bounds;
  const t = state.stats.elapsedMs / 1000;
  const dir = Math.sign(windX);
  const strength = Math.min(1, Math.abs(windX) / 60);
  const count = 3 + Math.round(strength * 5);

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const seed = hash1(i * 7.13);
    const y = h * (0.1 + seed * 0.42);
    const len = h * (0.05 + 0.11 * strength) * (0.6 + seed * 0.8);
    // Streaks used to run at 90–350 u/s, which the player read as "the wind
    // looks too fast to be real" — air moving visibly faster than the cloud it
    // is supposed to be pushing. Roughly a third of that tracks the cloud's own
    // drift and reads as moving air rather than a fan.
    const speed = (34 + 92 * strength) * (0.7 + seed * 0.6);
    // wrap across a span wider than the world so streaks enter from off-screen
    const span = w + len * 2;
    const x = (((t * speed * dir + seed * span) % span) + span) % span - len;
    ctx.globalAlpha = (0.16 + 0.3 * strength) * (0.5 + seed * 0.5);
    ctx.lineWidth = Math.max(1.5, h * 0.004 * (0.7 + strength));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * dir, y);
    ctx.stroke();
    // a small arrowhead on the leading end so direction is unambiguous
    ctx.beginPath();
    ctx.moveTo(x + len * dir, y);
    ctx.lineTo(x + (len - h * 0.016) * dir, y - h * 0.009);
    ctx.moveTo(x + len * dir, y);
    ctx.lineTo(x + (len - h * 0.016) * dir, y + h * 0.009);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Rising warm air: a wavering column with upward chevrons climbing it.
 *
 * `sunIntensity` (0..1, the same value that drives the actual lift force in
 * Sim) modulates how strong the column LOOKS — glow, rise speed, and wobble
 * amplitude all scale with it. This is the round-8 fix for "optimize the
 * thermal too": before this the column was purely time-animated and looked
 * identical at dawn and at noon even though the force it exerts on the cloud
 * literally is not. A hazard whose picture doesn't change when its underlying
 * physics does is exactly the "needs a caption" failure this round set out to
 * remove — the point is that a child can see the weak-morning/strong-noon
 * story without anyone telling them.
 */
function drawThermal(ctx: CanvasRenderingContext2D, t: Thermal, timeMs: number, sunIntensity: number): void {
  const time = timeMs / 1000;
  const topY = t.pos.y - t.height;
  const halfW = t.width / 2;
  // SUN_MIN_INTENSITY in sim/index.ts floors at 0.28; remap so the column is
  // still faintly visible at its weakest rather than fully invisible (a
  // thermal a child can't see at all isn't a thermal, it's a trap).
  const strength = 0.35 + 0.65 * Math.max(0, Math.min(1, (sunIntensity - 0.28) / 0.72));

  ctx.save();
  const grad = ctx.createLinearGradient(0, t.pos.y, 0, topY);
  grad.addColorStop(0, `rgba(255, 178, 92, ${(0.5 * strength).toFixed(3)})`);
  grad.addColorStop(0.6, `rgba(255, 203, 136, ${(0.26 * strength).toFixed(3)})`);
  grad.addColorStop(1, 'rgba(255, 226, 186, 0)');
  ctx.fillStyle = grad;
  // wavy sides, so it shimmers like heat haze instead of reading as a solid box.
  // Wobble amplitude scales with strength: a weak dawn thermal barely shimmers,
  // a noon one visibly boils.
  const wobAmp = halfW * (0.04 + 0.1 * strength);
  ctx.beginPath();
  ctx.moveTo(t.pos.x - halfW, t.pos.y);
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    const y = t.pos.y - t.height * f;
    const wob = Math.sin(time * 2.1 + f * 5) * wobAmp;
    ctx.lineTo(t.pos.x - halfW * (1 - f * 0.25) + wob, y);
  }
  for (let i = 10; i >= 0; i--) {
    const f = i / 10;
    const y = t.pos.y - t.height * f;
    const wob = Math.sin(time * 2.1 + f * 5 + 1.7) * wobAmp;
    ctx.lineTo(t.pos.x + halfW * (1 - f * 0.25) + wob, y);
  }
  ctx.closePath();
  ctx.fill();

  // Chevrons rising up the column on a loop. Both their rise SPEED and how many
  // are in flight at once track strength, so a strong noon thermal reads as a
  // faster, busier updraft rather than the same three arrows moving the same
  // speed regardless of how hard the sun is actually pulling.
  ctx.strokeStyle = `rgba(255, 170, 90, ${(0.55 * strength).toFixed(3)})`;
  ctx.lineWidth = Math.max(2, t.width * 0.035);
  ctx.lineCap = 'round';
  const arrows = strength > 0.7 ? 4 : strength > 0.45 ? 3 : 2;
  const riseSpeed = 0.3 + 0.35 * strength;
  for (let i = 0; i < arrows; i++) {
    const f = (time * riseSpeed + i / arrows) % 1;
    const y = t.pos.y - t.height * f;
    const wing = halfW * 0.3 * (1 - f * 0.4);
    ctx.globalAlpha = Math.sin(f * Math.PI) * 0.9;
    ctx.beginPath();
    ctx.moveTo(t.pos.x - wing, y + wing * 0.7);
    ctx.lineTo(t.pos.x, y);
    ctx.lineTo(t.pos.x + wing, y + wing * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/** One flapping V silhouette at an arbitrary offset/scale/phase — the building
 *  block drawBird composes into a flock. */
function drawOneBirdMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  dir: number,
  flapPhase: number,
  alpha: number,
): void {
  const lift = Math.sin(flapPhase) * r * 0.55;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(38, 56, 76, 0.95)';
    ctx.lineWidth = pass === 0 ? Math.max(5, r * 0.52) : Math.max(3, r * 0.3);
    ctx.beginPath();
    ctx.moveTo(-r, lift * 0.5);
    ctx.quadraticCurveTo(-r * 0.45, -lift, 0, r * 0.14);
    ctx.quadraticCurveTo(r * 0.45, -lift, r, lift * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A little flock, not a lone bird. `flap` is advanced by the Sim so this stays
 * pure. Round 8 upgrade: a single V-mark read as a "prop" rather than an
 * animal — real flocks are loose clusters of several birds at slightly
 * different sizes, phases and trailing offsets. Only the lead mark's position
 * is the actual hitbox (it IS `b.pos`/`b.radius` from Sim); the two companions
 * are purely decorative and trail behind at fixed offsets scaled by direction,
 * so the whole cluster reads as one flock moving together without changing
 * what the player can collide with.
 */
function drawBird(ctx: CanvasRenderingContext2D, b: Bird): void {
  const r = b.radius;
  const dir = b.vx >= 0 ? 1 : -1;
  const companions = [
    { dx: -2.6, dy: -0.7, scale: 0.72, phase: 0.6 },
    { dx: -4.4, dy: 0.9, scale: 0.58, phase: 1.3 },
  ];
  for (const c of companions) {
    drawOneBirdMark(ctx, b.pos.x - c.dx * r * dir, b.pos.y + c.dy * r, r * c.scale, dir, b.flap + c.phase, 0.75);
  }
  drawOneBirdMark(ctx, b.pos.x, b.pos.y, r, dir, b.flap, 1);
}

/** A drifting pale-blue cold zone with slow frost sparkles. */
function drawColdFront(ctx: CanvasRenderingContext2D, c: ColdFront, timeMs: number): void {
  const time = timeMs / 1000;
  ctx.save();
  // Opacities are up from the first pass: a zone that silently disables both
  // drinking and raining has to be obvious, and against this sky a pale blue
  // wash at 0.26 alpha was nearly invisible.
  const grad = ctx.createRadialGradient(c.pos.x, c.pos.y, c.radius * 0.15, c.pos.x, c.pos.y, c.radius);
  grad.addColorStop(0, 'rgba(186, 224, 248, 0.72)');
  grad.addColorStop(0.6, 'rgba(150, 198, 234, 0.5)');
  grad.addColorStop(1, 'rgba(150, 198, 234, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
  ctx.fill();

  // a soft rim so the boundary you must stay outside of is actually locatable
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(2, c.radius * 0.035);
  ctx.beginPath();
  ctx.arc(c.pos.x, c.pos.y, c.radius * 0.94, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = Math.max(1.5, c.radius * 0.018);
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const seed = hash1(i * 3.7);
    const ang = seed * Math.PI * 2 + time * 0.25;
    const dist = c.radius * (0.25 + seed * 0.6);
    const x = c.pos.x + Math.cos(ang) * dist;
    const y = c.pos.y + Math.sin(ang * 1.3) * dist * 0.7;
    const s = c.radius * 0.06 * (0.6 + seed * 0.8);
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 1.6 + seed * 6);
    // a tiny six-point frost star
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s);
      ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function createRender(): RenderModule {
  function draw(ctx: CanvasRenderingContext2D, state: GameState, vp: Viewport): void {
    const { w, h } = state.bounds;
    ctx.save();
    ctx.translate(vp.offsetX, vp.offsetY);
    ctx.scale(vp.scale, vp.scale);

    drawSky(ctx, w, h, state.stats.elapsedMs, state.sun.intensity);
    drawGroundAndSea(ctx, state, state.stats.elapsedMs);
    for (const m of state.mountains) drawMountain(ctx, m);
    const windStrength = Math.max(-1, Math.min(1, (state.wind.baseX + state.wind.gustX) / 60));
    for (const f of state.fields) drawField(ctx, f, state.stats.elapsedMs, windStrength);
    // Rainbow sits behind obstacles/cloud but in front of the land — a sky
    // phenomenon, not a UI badge on top of everything.
    drawRainbow(ctx, state);
    drawWindHint(ctx, state);
    for (const t of state.thermals) drawThermal(ctx, t, state.stats.elapsedMs, state.sun.intensity);
    for (const c of state.coldFronts) drawColdFront(ctx, c, state.stats.elapsedMs);
    drawVapor(ctx, state, state.stats.elapsedMs);
    drawCloud(ctx, state);
    drawRain(ctx, state);
    // birds fly in front of the cloud so an incoming flock is never hidden
    // behind it — the player has to be able to see what they're dodging
    for (const b of state.birds) drawBird(ctx, b);

    ctx.restore();
  }

  return { draw };
}
