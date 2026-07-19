import type { AudioModule, SimEvent, UiSound } from '../types.ts';

// Everything here is synthesized with WebAudio oscillators/noise at call
// time — there is no <audio> tag and no network/disk asset to fail to load.

const THROTTLE_MS: Partial<Record<SimEvent['type'], number>> = {
  evaporate: 190,
  mountainLeak: 260,
};

// A small major-pentatonic-ish note set (Hz) reused across every event so
// nothing the child hears is ever dissonant, no matter how sounds overlap.
const NOTE = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
};

interface ToneOpts {
  type?: OscillatorType;
  /** Peak (post-attack) linear gain. */
  gain?: number;
  /** Seconds to ramp 0 -> peak. */
  attack?: number;
  /** Seconds to fall from peak -> sustain level. */
  decay?: number;
  /** 0..1 fraction of peak held for `hold` seconds (0 = pure percussive decay). */
  sustain?: number;
  hold?: number;
  /** Seconds to fade from the sustain level to silence. */
  release?: number;
  /** If set, the oscillator glides from `freq` to `freqEnd` (pitch envelope) —
   *  this is what makes a "gulp" or "pop" read as a gesture, not a flat beep. */
  freqEnd?: number;
  glideTime?: number;
  /** Subtle pitch wobble for sustained notes, so they feel alive not robotic. */
  vibratoHz?: number;
  vibratoCents?: number;
  /** Adds a quieter sine layer at freq*partial (e.g. 2 = octave) that decays
   *  faster than the fundamental, giving a bell/chime-like attack. */
  partial?: number;
  partialGain?: number;
  delayS?: number;
}

export function createAudio(): AudioModule {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let rainSource: AudioBufferSourceNode | null = null;
  let rainGain: GainNode | null = null;
  let rainLfo: OscillatorNode | null = null;
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

  /**
   * A single oscillator voice with a true ADSR-style envelope (attack ->
   * decay -> optional sustain hold -> release), an optional pitch glide, an
   * optional vibrato LFO, and an optional quieter "partial" layer an octave
   * (or any ratio) above the fundamental for a bell/chime timbre.
   */
  function tone(freq: number, opts: ToneOpts = {}): void {
    const audioCtx = ensureCtx();
    if (!audioCtx || !master) return;
    const start = audioCtx.currentTime + (opts.delayS ?? 0);
    const peak = opts.gain ?? 0.3;
    const attack = opts.attack ?? 0.008;
    const decay = opts.decay ?? 0.09;
    const sustainLevel = (opts.sustain ?? 0) * peak;
    const hold = opts.hold ?? 0;
    const release = opts.release ?? 0.08;
    const total = attack + decay + hold + release;

    const osc = audioCtx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (opts.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), start + (opts.glideTime ?? attack + decay));
    }

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustainLevel), start + attack + decay);
    if (hold > 0) gain.gain.setValueAtTime(Math.max(0.0001, sustainLevel), start + attack + decay + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay + hold + release);
    gain.gain.linearRampToValueAtTime(0, start + total + 0.02);

    osc.connect(gain);
    gain.connect(master);

    if (opts.vibratoHz && opts.vibratoCents) {
      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = opts.vibratoHz;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = opts.vibratoCents;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start(start);
      lfo.stop(start + total + 0.05);
    }

    osc.start(start);
    osc.stop(start + total + 0.03);

    if (opts.partial) {
      const pOsc = audioCtx.createOscillator();
      pOsc.type = 'sine';
      pOsc.frequency.setValueAtTime(freq * opts.partial, start);
      const pPeak = peak * (opts.partialGain ?? 0.35);
      const pDecay = Math.max(0.02, decay * 0.6);
      const pGain = audioCtx.createGain();
      pGain.gain.setValueAtTime(0.0001, start);
      pGain.gain.linearRampToValueAtTime(pPeak, start + attack);
      pGain.gain.exponentialRampToValueAtTime(0.0001, start + attack + pDecay);
      pGain.gain.linearRampToValueAtTime(0, start + attack + pDecay + 0.02);
      pOsc.connect(pGain);
      pGain.connect(master);
      pOsc.start(start);
      pOsc.stop(start + attack + pDecay + 0.05);
    }
  }

  function noiseBuffer(audioCtx: AudioContext): AudioBuffer {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** A short filtered-noise one-shot — used for airy/hissy events, timbrally
   *  distinct from the pure-tone `tone()` voices so a child can tell them
   *  apart without needing to attend to pitch at all. */
  function noiseBurst(
    centerFreq: number,
    opts: { type?: BiquadFilterType; q?: number; gain?: number; attack?: number; decay?: number; delayS?: number } = {},
  ): void {
    const audioCtx = ensureCtx();
    if (!audioCtx || !master) return;
    const start = audioCtx.currentTime + (opts.delayS ?? 0);
    const peak = opts.gain ?? 0.15;
    const attack = opts.attack ?? 0.004;
    const decay = opts.decay ?? 0.14;

    const source = audioCtx.createBufferSource();
    source.buffer = noiseBuffer(audioCtx);
    const filter = audioCtx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.value = centerFreq;
    filter.Q.value = opts.q ?? 1.2;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    gain.gain.linearRampToValueAtTime(0, start + attack + decay + 0.02);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + attack + decay + 0.05);
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
    // A slow LFO breathes the filter's center frequency so the loop reads as
    // gentle organic pitter-patter instead of a static hiss.
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.35;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 0.15);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    rainSource = source;
    rainGain = gain;
    rainLfo = lfo;
  }

  function stopRainLoop(): void {
    if (!rainSource || !rainGain || !ctx) {
      rainSource = null;
      rainGain = null;
      rainLfo = null;
      return;
    }
    const stopAt = ctx.currentTime + 0.15;
    rainGain.gain.linearRampToValueAtTime(0, stopAt);
    rainSource.stop(stopAt + 0.02);
    rainLfo?.stop(stopAt + 0.02);
    rainSource = null;
    rainGain = null;
    rainLfo = null;
  }

  function play(e: SimEvent | UiSound): void {
    // Individual synth nodes always get created and routed through
    // `master`; muting just zeroes master's gain, so rain start/stop still
    // toggles the loop correctly and unmuting mid-rain sounds right away.
    const gap = THROTTLE_MS[e.type as SimEvent['type']];
    if (gap !== undefined && !throttled(e.type, gap)) return;

    switch (e.type) {
      case 'evaporate':
        // A bright rising "glug" — the cloud drinking up water. Throttled
        // repeats while flying low over the sea read as "gulp, gulp, gulp".
        // Note: freqEnd's glide must land well before the exponential decay
        // has faded to silence, or the pitch bend is inaudible — measured
        // empirically (see audio verification harness): with attack=6ms/
        // decay=70ms/target≈0.2 peak, amplitude is already down to ~1% of
        // peak by 60% into the decay, so glideTime is kept short (~30% of
        // decay) to land while the note is still clearly audible.
        tone(560, {
          type: 'sine',
          gain: 0.2,
          freqEnd: 760,
          glideTime: 0.03,
          attack: 0.006,
          decay: 0.07,
          release: 0.03,
          partial: 2,
          partialGain: 0.22,
        });
        break;
      case 'rainStart':
        startRainLoop();
        break;
      case 'rainStop':
        stopRainLoop();
        break;
      case 'fieldBloom': {
        // A four-note twinkling cascade with a bell timbre (fundamental +
        // fast-decaying octave partial); the last note lingers and wobbles
        // (vibrato) so the payoff feels bigger than the setup notes.
        const run = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
        run.forEach((f, i) => {
          const isLast = i === run.length - 1;
          tone(f, {
            type: 'sine',
            gain: isLast ? 0.32 : 0.24,
            attack: 0.006,
            decay: isLast ? 0.2 : 0.13,
            sustain: isLast ? 0.18 : 0,
            hold: isLast ? 0.08 : 0,
            release: isLast ? 0.22 : 0.06,
            partial: 2,
            partialGain: 0.3,
            vibratoHz: isLast ? 6 : undefined,
            vibratoCents: isLast ? 14 : undefined,
            delayS: i * 0.09,
          });
        });
        break;
      }
      case 'fieldOverwater':
        // A gentle, non-punishing two-note "oops, that's plenty" — fields
        // still bloom on overwater, so this must stay soft, not sad. (glide
        // shortened for the same audible-before-it-fades reason as evaporate.)
        tone(392, { type: 'triangle', gain: 0.16, freqEnd: 330, glideTime: 0.055, attack: 0.01, decay: 0.14, release: 0.08 });
        tone(311, { type: 'triangle', gain: 0.13, attack: 0.01, decay: 0.14, release: 0.12, delayS: 0.1 });
        break;
      case 'mountainLeak':
        // Filtered noise, not a tone — a literal airy "hiss/pfft" that is
        // timbrally unmistakable from the tonal "glug" of evaporate.
        noiseBurst(3400, { type: 'bandpass', q: 1.4, gain: 0.14, attack: 0.004, decay: 0.16 });
        break;
      case 'levelComplete': {
        // A short rising run into a held, vibrato'd major chord "ta-da",
        // plus a faint high shimmer on the landing — a real little reward.
        const run = [NOTE.C5, NOTE.E5, NOTE.G5];
        run.forEach((f, i) =>
          tone(f, { type: 'sine', gain: 0.26, attack: 0.006, decay: 0.12, release: 0.06, partial: 2, partialGain: 0.28, delayS: i * 0.13 }),
        );
        const chordDelay = run.length * 0.13 + 0.02;
        [NOTE.C6, NOTE.E6, NOTE.G6].forEach((f) =>
          tone(f, {
            type: 'sine',
            gain: 0.28,
            attack: 0.01,
            decay: 0.22,
            sustain: 0.3,
            hold: 0.14,
            release: 0.35,
            partial: 2,
            partialGain: 0.3,
            vibratoHz: 5,
            vibratoCents: 10,
            delayS: chordDelay,
          }),
        );
        noiseBurst(6500, { type: 'highpass', q: 0.7, gain: 0.05, attack: 0.01, decay: 0.4, delayS: chordDelay });
        break;
      }
      case 'uiTap':
        // A soft downward-pitched "pop" — friendlier for small ears than a
        // flat square-wave beep, but still snappy enough for instant tap
        // feedback.
        tone(880, { type: 'sine', gain: 0.14, freqEnd: 680, glideTime: 0.018, attack: 0.003, decay: 0.045, release: 0.02 });
        break;
      case 'star': {
        // Each star is a tiny "sparkle": a quiet grace note a perfect fifth
        // above, immediately followed by the main bell note with vibrato.
        const notes = [NOTE.G5, NOTE.A5, NOTE.C6];
        const f = notes[Math.min(e.index, notes.length - 1)];
        const base = e.index * 0.14;
        tone(f * 1.5, { type: 'sine', gain: 0.12, attack: 0.003, decay: 0.05, release: 0.03, delayS: base });
        tone(f, {
          type: 'sine',
          gain: 0.28,
          attack: 0.008,
          decay: 0.15,
          sustain: 0.22,
          hold: 0.05,
          release: 0.16,
          partial: 2,
          partialGain: 0.3,
          vibratoHz: 6,
          vibratoCents: 16,
          delayS: base + 0.05,
        });
        break;
      }
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
