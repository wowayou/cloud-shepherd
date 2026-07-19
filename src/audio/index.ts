import type { AudioModule, SimEvent, UiSound } from '../types.ts';

// Everything here is synthesized with WebAudio oscillators/noise at call
// time — there is no <audio> tag and no network/disk asset to fail to load.

const THROTTLE_MS: Partial<Record<SimEvent['type'], number>> = {
  evaporate: 190,
  mountainLeak: 260,
};

export function createAudio(): AudioModule {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let rainSource: AudioBufferSourceNode | null = null;
  let rainGain: GainNode | null = null;
  const lastPlayedAt: Partial<Record<string, number>> = {};

  function ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function tone(freq: number, durationS: number, opts: { type?: OscillatorType; gain?: number; delayS?: number } = {}): void {
    const audioCtx = ensureCtx();
    if (!audioCtx || !master) return;
    const start = audioCtx.currentTime + (opts.delayS ?? 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(opts.gain ?? 0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + durationS);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + durationS + 0.02);
  }

  function noiseBuffer(audioCtx: AudioContext): AudioBuffer {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function throttled(key: string, minGapMs: number): boolean {
    const now = performance.now();
    const last = lastPlayedAt[key] ?? -Infinity;
    if (now - last < minGapMs) return false;
    lastPlayedAt[key] = now;
    return true;
  }

  function startRainLoop(): void {
    const audioCtx = ensureCtx();
    if (!audioCtx || !master || rainSource) return;
    const source = audioCtx.createBufferSource();
    source.buffer = noiseBuffer(audioCtx);
    source.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2200;
    filter.Q.value = 0.6;
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 0.15);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    rainSource = source;
    rainGain = gain;
  }

  function stopRainLoop(): void {
    if (!rainSource || !rainGain || !ctx) {
      rainSource = null;
      rainGain = null;
      return;
    }
    const stopAt = ctx.currentTime + 0.15;
    rainGain.gain.linearRampToValueAtTime(0, stopAt);
    rainSource.stop(stopAt + 0.02);
    rainSource = null;
    rainGain = null;
  }

  function play(e: SimEvent | UiSound): void {
    // Individual synth nodes always get created and routed through
    // `master`; muting just zeroes master's gain, so rain start/stop still
    // toggles the loop correctly and unmuting mid-rain sounds right away.
    const gap = THROTTLE_MS[e.type as SimEvent['type']];
    if (gap !== undefined && !throttled(e.type, gap)) return;

    switch (e.type) {
      case 'evaporate':
        tone(520, 0.14, { type: 'sine', gain: 0.18 });
        break;
      case 'rainStart':
        startRainLoop();
        break;
      case 'rainStop':
        stopRainLoop();
        break;
      case 'fieldBloom':
        tone(660, 0.16, { gain: 0.3 });
        tone(880, 0.2, { gain: 0.28, delayS: 0.08 });
        tone(1046, 0.28, { gain: 0.26, delayS: 0.16 });
        break;
      case 'fieldOverwater':
        tone(220, 0.3, { type: 'triangle', gain: 0.2 });
        break;
      case 'mountainLeak':
        tone(180, 0.18, { type: 'sawtooth', gain: 0.12 });
        break;
      case 'levelComplete':
        tone(523, 0.18, { gain: 0.3 });
        tone(659, 0.18, { gain: 0.3, delayS: 0.14 });
        tone(784, 0.18, { gain: 0.3, delayS: 0.28 });
        tone(1046, 0.4, { gain: 0.32, delayS: 0.42 });
        break;
      case 'uiTap':
        tone(880, 0.06, { type: 'square', gain: 0.12 });
        break;
      case 'star':
        tone(700 + e.index * 180, 0.22, { gain: 0.3, delayS: e.index * 0.12 });
        break;
    }
  }

  function setMuted(m: boolean): void {
    muted = m;
    if (master && ctx) {
      master.gain.linearRampToValueAtTime(muted ? 0 : 0.35, ctx.currentTime + 0.08);
    }
  }

  function isMuted(): boolean {
    return muted;
  }

  return { play, setMuted, isMuted };
}
