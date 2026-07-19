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

export function createInput(): InputModule {
  let pointerActive = false;
  let pointerWorld: Vec2 = { x: 0, y: 0 };
  let rainButtonHeld = false;
  let activePointerId: number | null = null;

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

    return {
      pointerActive,
      pointer: pointerWorld,
      rainHeld: rainButtonHeld || auto,
    };
  }

  function setRainButton(held: boolean): void {
    rainButtonHeld = held;
  }

  return { attach, read, setRainButton };
}
