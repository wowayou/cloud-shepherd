/**
 * Boots the V2 valley prototype onto the shared canvas, with a minimal DOM HUD
 * (rain button + back). Does not touch v1 modules. Call stop() to tear down
 * and return control to the campaign UI.
 */
import { createV2State, drawV2, stepV2, v2WantsRetry, type V2State } from './prototype.ts';

export function bootV2(
  canvas: HTMLCanvasElement,
  uiRoot: HTMLElement,
  onExit?: () => void,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    onExit?.();
    return () => {};
  }

  let state: V2State = createV2State();
  let running = true;
  let last = performance.now();
  let pointerId: number | null = null;

  // Hide campaign UI while v2 is up.
  const prevDisplay = uiRoot.style.display;
  uiRoot.style.display = 'none';

  const hud = document.createElement('div');
  hud.id = 'v2-hud';
  Object.assign(hud.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '20',
    fontFamily: 'system-ui,sans-serif',
  } as CSSStyleDeclaration);
  // Back button only when there's somewhere to go back TO (v1 embed). As the
  // main entry (round 17) v2 is the whole game, so no "← 返回旧版" chrome.
  let back: HTMLButtonElement | null = null;
  if (onExit) {
    back = document.createElement('button');
    back.textContent = '← 返回旧版';
    Object.assign(back.style, {
      position: 'absolute',
      top: '64px',
      left: '16px',
      pointerEvents: 'auto',
      border: 'none',
      borderRadius: '999px',
      padding: '10px 16px',
      background: 'rgba(22,50,79,0.75)',
      color: '#fff',
      fontWeight: '600',
      fontSize: '14px',
      cursor: 'pointer',
    } as CSSStyleDeclaration);
    back.addEventListener('click', () => {
      stop();
      onExit();
    });
  }

  const rain = document.createElement('button');
  rain.textContent = '☔';
  Object.assign(rain.style, {
    position: 'absolute',
    right: '20px',
    bottom: '28px',
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    border: '3px solid rgba(255,255,255,0.7)',
    background: 'linear-gradient(160deg,#6eb6e8,#3a7eb0)',
    color: '#fff',
    fontSize: '32px',
    pointerEvents: 'auto',
    cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(30,60,90,0.35)',
    touchAction: 'none',
  } as CSSStyleDeclaration);

  const setRain = (on: boolean) => {
    state.raining = on && state.phase === 'playing';
    rain.style.transform = on ? 'scale(0.94)' : 'scale(1)';
    rain.style.background = on
      ? 'linear-gradient(160deg,#4a90c0,#2a5a80)'
      : 'linear-gradient(160deg,#6eb6e8,#3a7eb0)';
  };
  rain.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    rain.setPointerCapture(e.pointerId);
    setRain(true);
  });
  rain.addEventListener('pointerup', () => setRain(false));
  rain.addEventListener('pointercancel', () => setRain(false));
  rain.addEventListener('pointerleave', () => {
    /* keep rain if capture held */
  });

  const tag = document.createElement('div');
  tag.textContent = '让水一直转圈圈 · 山谷天气';
  Object.assign(tag.style, {
    position: 'absolute',
    // Sits beside the back button when embedded; drops to the top edge when
    // standalone (no back button to clear).
    top: onExit ? '64px' : '16px',
    right: '16px',
    pointerEvents: 'none',
    background: 'rgba(255,209,102,0.9)',
    color: '#16324f',
    fontWeight: '700',
    fontSize: '12px',
    padding: '6px 12px',
    borderRadius: '999px',
  } as CSSStyleDeclaration);

  if (back) hud.append(back);
  hud.append(rain, tag);
  document.body.append(hud);

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  const toAim = (clientX: number) => {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / Math.max(1, rect.width);
    return Math.max(0.05, Math.min(0.95, x));
  };

  const onDown = (e: PointerEvent) => {
    if (e.target === rain || e.target === back) return;
    if (v2WantsRetry(state)) {
      state = createV2State();
      setRain(false);
      return;
    }
    pointerId = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    state.aimX = toAim(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    state.aimX = toAim(e.clientX);
  };
  const onUp = (e: PointerEvent) => {
    if (pointerId === e.pointerId) pointerId = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepV2(state, dt);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    drawV2(ctx, state, cssW, cssH, dpr);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function stop(): void {
    if (!running) return;
    running = false;
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    hud.remove();
    uiRoot.style.display = prevDisplay;
  }

  return stop;
}
