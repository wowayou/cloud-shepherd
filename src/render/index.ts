import type { Field, GameState, Mountain, RenderModule, Viewport } from '../types.ts';

// Flat, soft-pastel style. Every pixel is drawn with primitives — no images,
// no @font-face — so the game never depends on an asset finishing a network
// or disk load.

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, timeMs: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#8fd0ee');
  grad.addColorStop(0.6, '#bfe6f5');
  grad.addColorStop(1, '#e8f6ee');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

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
}

function drawMountain(ctx: CanvasRenderingContext2D, m: Mountain): void {
  const left = m.pos.x - m.width / 2;
  const right = m.pos.x + m.width / 2;
  const top = m.pos.y - m.height;
  const grad = ctx.createLinearGradient(0, top, 0, m.pos.y);
  grad.addColorStop(0, '#9fb0a3');
  grad.addColorStop(1, '#6f8a74');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(left, m.pos.y);
  ctx.lineTo(m.pos.x, top);
  ctx.lineTo(right, m.pos.y);
  ctx.closePath();
  ctx.fill();

  // snow-ish cap
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(m.pos.x, top);
  ctx.lineTo(m.pos.x - m.width * 0.12, top + m.height * 0.22);
  ctx.lineTo(m.pos.x + m.width * 0.12, top + m.height * 0.22);
  ctx.closePath();
  ctx.fill();
}

const DRY_COLOR: [number, number, number] = [193, 154, 107];
const GROWING_COLOR: [number, number, number] = [156, 190, 98];
const BLOOM_COLOR: [number, number, number] = [96, 168, 92];
const OVERWATER_COLOR: [number, number, number] = [90, 140, 150];

function drawField(ctx: CanvasRenderingContext2D, f: Field): void {
  const t = f.targetMin > 0 ? Math.min(1, f.moisture / f.targetMin) : f.moisture > 0 ? 1 : 0;
  let fill: string;
  if (f.state === 'bloom') fill = lerpColor(BLOOM_COLOR, BLOOM_COLOR, 0);
  else if (f.state === 'overwater') fill = lerpColor(GROWING_COLOR, OVERWATER_COLOR, 0.7);
  else fill = lerpColor(DRY_COLOR, GROWING_COLOR, t);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(f.pos.x, f.pos.y, f.radius, f.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  if (f.state === 'bloom') {
    const petalCount = 6;
    const scale = 0.4 + 0.6 * f.bloom01;
    for (let i = 0; i < petalCount; i++) {
      const a = (i / petalCount) * Math.PI * 2;
      const px = f.pos.x + Math.cos(a) * f.radius * 0.5 * scale;
      const py = f.pos.y - f.radius * 0.15 + Math.sin(a) * f.radius * 0.28 * scale;
      ctx.beginPath();
      ctx.fillStyle = i % 2 === 0 ? '#ffd166' : '#ff8fa3';
      ctx.arc(px, py, f.radius * 0.16 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = '#fff3b0';
    ctx.arc(f.pos.x, f.pos.y - f.radius * 0.15, f.radius * 0.14 * scale, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.state === 'overwater') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, f.radius * 0.06);
    ctx.beginPath();
    ctx.moveTo(f.pos.x - f.radius * 0.4, f.pos.y);
    ctx.quadraticCurveTo(f.pos.x, f.pos.y + f.radius * 0.35, f.pos.x + f.radius * 0.4, f.pos.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { cloud, bounds } = state;
  const wetness = cloud.maxWater > 0 ? cloud.water / cloud.maxWater : 0;
  const baseR = bounds.h * (0.05 + 0.035 * wetness);
  const color = lerpColor([255, 255, 255], [147, 165, 182], wetness);

  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(60,80,100,0.25)';
  ctx.shadowBlur = baseR * 0.4;
  drawPuff(ctx, cloud.pos.x, cloud.pos.y, baseR);
  ctx.shadowBlur = 0;

  if (cloud.raining) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#4a6fa5';
    ctx.beginPath();
    ctx.ellipse(cloud.pos.x, cloud.pos.y + baseR * 0.5, baseR * 0.9, baseR * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawRain(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.save();
  ctx.strokeStyle = '#4a6fa5';
  ctx.lineCap = 'round';
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.6);
    ctx.lineWidth = Math.max(1, state.bounds.h * 0.004);
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.lineTo(p.pos.x - p.vel.x * 0.02, p.pos.y - p.vel.y * 0.05);
    ctx.stroke();
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
    for (const f of state.fields) drawField(ctx, f);
    drawWindHint(ctx, state);
    drawCloud(ctx, state);
    drawRain(ctx, state);

    ctx.restore();
  }

  return { draw };
}
