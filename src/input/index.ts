import type { GameState, InputIntent, InputModule, Vec2, Viewport } from '../types.ts';

// Holding still over a field counts as "hold to rain" — a 6-year-old doesn't
// need to find a second button while already concentrating on dragging.
//
// Round-1's Sim retune (PULL_ACCEL 22→90, ζ≈0.84) made the cloud settle
// near-instantly under a held finger, so "hold still over a field" fires far
// more readily than before and the auto-rain window's edges need to match the
// wet mechanics they gate. Two constants, both sized in fractions of worldH:
const NEAR_STILL_SPEED = 45; // world units / sec
// Cloud reach beyond a field's own radius that allows auto-rain to arm. Kept
// a touch looser than Sim's *wet* reach (RAIN_REACH_FRAC = 0.055 in sim/) on
// purpose: auto-rain *arms* just outside the wet band so rain engages the
// instant the child's slow drag carries the cloud into wet range, instead of
// needing to overshoot the field center — but it never rains where the wet
// mechanics wouldn't also let it land (~0.09 still > 0.055, so the cloud is
// already "wetting" by the time it triggers). Without this the snappy physics
// exposed a window where auto-rain fired while the nearest-field lookup
// returned nothing, dumping water into `waterWasted` (~0.035·worldH of slack
// ≈ 25 units at worldH 720 ≈ one wasted particle-stream per approach).
const NEAR_FIELD_REACH_FRAC = 0.09;

// Hold-duration → rain pressure. A short hold is a light drizzle; after
// RAIN_PRESSURE_RAMP_MS of continuous rain intent the pressure tops out at 1
// (downpour). Uses wall-clock time (performance.now), not sim steps, so the
// ramp feels the same whether the device is at 30 or 60 fps. This is the
// device-universal way to get continuous rain expression — force-touch and
// second-finger only exist on some hardware and would break the 6yo simplest
// path if required.
const RAIN_PRESSURE_RAMP_MS = 900;
// Floor so even a brand-new hold is a real drizzle, not a silent no-op. At
// pressure 0.25 the Sim rate multiplier is 0.3 + 0.25*1.2 = 0.6, so a light
// touch is slower than the calibrated default but still waters a field.
const RAIN_PRESSURE_MIN = 0.25;

export function createInput(): InputModule {
  let pointerActive = false;
  let pointerWorld: Vec2 = { x: 0, y: 0 };
  let rainButtonHeld = false;
  let activePointerId: number | null = null;
  // Wall-clock ms when the current continuous rain hold began; null when not
  // raining. Resetting on every edge (not every frame) is what makes "hold
  // longer → rain harder" legible — a flicker would zero the ramp.
  let rainHoldStartedAt: number | null = null;

  function toWorld(canvas: HTMLCanvasElement, vp: Viewport, clientX: number, clientY: number): Vec2 {
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    return {
      x: (cssX - vp.offsetX) / vp.scale,
      y: (cssY - vp.offsetY) / vp.scale,
    };
  }

  function attach(canvas: HTMLCanvasElement, vp: () => Viewport): void {
    const onDown = (e: PointerEvent) => {
      if (activePointerId !== null) return;
      activePointerId = e.pointerId;
      pointerActive = true;
      pointerWorld = toWorld(canvas, vp(), e.clientX, e.clientY);
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      pointerWorld = toWorld(canvas, vp(), e.clientX, e.clientY);
      e.preventDefault();
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      pointerActive = false;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onUp);
  }

  function read(state: GameState): InputIntent {
    let auto = false;
    if (pointerActive) {
      const speed = Math.hypot(state.cloud.vel.x, state.cloud.vel.y);
      if (speed < NEAR_STILL_SPEED) {
        const reach = state.bounds.h * NEAR_FIELD_REACH_FRAC;
        auto = state.fields.some(
          (f) => f.state !== 'bloom' && Math.hypot(f.pos.x - state.cloud.pos.x, f.pos.y - state.cloud.pos.y) <= f.radius + reach,
        );
      }
    }

    const rainHeld = rainButtonHeld || auto;
    let rainPressure = 0;
    if (rainHeld) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (rainHoldStartedAt === null) rainHoldStartedAt = now;
      const t = Math.max(0, Math.min(1, (now - rainHoldStartedAt) / RAIN_PRESSURE_RAMP_MS));
      // Ease-in so the first ~0.3s stays a deliberate drizzle and the ramp
      // only really bites after the child has clearly held. Square ease keeps
      // the mid-hold (the autopilot-equivalent ~0.58) reachable before the
      // full second is up — about 550ms of hold lands on rate ×1.0.
      const eased = t * t;
      rainPressure = RAIN_PRESSURE_MIN + (1 - RAIN_PRESSURE_MIN) * eased;
    } else {
      rainHoldStartedAt = null;
    }

    return {
      pointerActive,
      pointer: pointerWorld,
      rainHeld,
      rainPressure,
    };
  }

  function setRainButton(held: boolean): void {
    rainButtonHeld = held;
  }

  return { attach, read, setRainButton };
}
