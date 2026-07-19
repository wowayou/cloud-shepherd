export interface LoopCallbacks {
  /** Called with a fixed dt (ms) zero or more times per frame — deterministic. */
  fixedUpdate(dtMs: number): void;
  /** Called once per animation frame. */
  render(): void;
}

const FIXED_DT_MS = 1000 / 60;
const MAX_FRAME_MS = 250; // clamp huge gaps (backgrounded tab) instead of spiraling

export function startLoop(cb: LoopCallbacks): () => void {
  let running = true;
  let last = performance.now();
  let acc = 0;

  function frame(now: number): void {
    if (!running) return;
    let frameMs = now - last;
    last = now;
    if (frameMs > MAX_FRAME_MS) frameMs = MAX_FRAME_MS;
    acc += frameMs;
    while (acc >= FIXED_DT_MS) {
      cb.fixedUpdate(FIXED_DT_MS);
      acc -= FIXED_DT_MS;
    }
    cb.render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return () => {
    running = false;
  };
}
