// Synth voices. Everything is generated from oscillators and a noise buffer —
// there are no audio assets and no audio dependencies.
//
// Each function takes (ctx, dest, ev) and schedules itself at ev.time on the
// given context's clock, which is why the same code serves live playback and
// offline WAV rendering unchanged.

// Cached across contexts: generating two seconds of noise per hat hit would be
// wasteful, and the content is never listened to, only filtered.
let sharedNoise = null;

// Every live source per context, so Stop can release the whole graph at once.
// A WeakMap keyed on ctx avoids keeping a closed context alive.
const sourcesByCtx = new WeakMap();

function track(ctx, node) {
  let set = sourcesByCtx.get(ctx);
  if (!set) {
    set = new Set();
    sourcesByCtx.set(ctx, set);
  }
  set.add(node);
  node.onended = () => set.delete(node);
  return node;
}

/**
 * Stops every tracked source on a context. Called on Stop and at the start of
 * each playback run, so restarting mid-piece never stacks two performances.
 *
 * Sources are stopped 30ms in the future rather than immediately: long enough
 * to avoid an audible click, short enough that Stop feels instant.
 */
export function stopAllVoices(ctx) {
  const set = sourcesByCtx.get(ctx);
  if (!set) return;
  const at = ctx.currentTime + 0.03;
  for (const node of set) {
    try {
      node.stop(at);
    } catch {
      set.delete(node);
    }
  }
  set.clear();
}

/**
 * Two seconds of white noise, shared by every percussion voice.
 */
export function noiseBuffer(ctx) {
  if (sharedNoise && sharedNoise.sampleRate === ctx.sampleRate) {
    return sharedNoise;
  }
  const length = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  sharedNoise = buffer;
  return buffer;
}

/**
 * One oscillator plus an exponential decay envelope. The classic subtractive
 * synth shape; `type` selects the waveform and `detune` detunes in cents.
 *
 * The envelope never reaches zero — exponential ramps cannot target 0, so it
 * parks just above it. Reaching literal silence would click on every note.
 */
function tone(ctx, dest, at, opts) {
  const { freq, duration, velocity, type, detune = 0 } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (detune) osc.detune.setValueAtTime(detune, at);

  const peak = Math.max(0.0002, velocity);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(gain).connect(dest);
  track(ctx, osc);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/**
 * A burst of filtered noise — the basis of every drum voice. The biquad filter
 * is what separates the kit: highpass for hats, bandpass for the snare body.
 */
function noiseHit(ctx, dest, at, opts) {
  const { duration, velocity, filterType, freq, q = 1 } = opts;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freq, at);
  filter.Q.setValueAtTime(q, at);

  const gain = ctx.createGain();
  const peak = Math.max(0.0002, velocity);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  src.connect(filter).connect(gain).connect(dest);
  track(ctx, src);
  src.start(at);
  src.stop(at + duration + 0.02);
}

/** Lead: a triangle, cutting through the mix so the melody stays legible. */
export function playLead(ctx, dest, ev) {
  tone(ctx, dest, ev.time, {
    freq: ev.freq,
    duration: ev.duration,
    velocity: ev.velocity * 0.5,
    type: 'triangle',
  });
}

/**
 * Pad: two sawtooths detuned +/-7 cents. The beating between them widens the
 * tone, so a single letter sustains as a chord rather than a plain pitch.
 */
export function playPad(ctx, dest, ev) {
  tone(ctx, dest, ev.time, {
    freq: ev.freq,
    duration: ev.duration * 1.6,
    velocity: ev.velocity * 0.18,
    type: 'sawtooth',
    detune: 7,
  });
  tone(ctx, dest, ev.time, {
    freq: ev.freq,
    duration: ev.duration * 1.6,
    velocity: ev.velocity * 0.14,
    type: 'sawtooth',
    detune: -7,
  });
}

/**
 * Bass: a sawtooth an octave down, run through a resonant lowpass so it reads
 * as weight at the bottom rather than as a thin low note.
 */
export function playBass(ctx, dest, ev) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(ev.freq * 4, 2200), ev.time);
  filter.Q.setValueAtTime(6, ev.time);
  filter.connect(dest);

  tone(ctx, filter, ev.time, {
    freq: ev.freq / 2,
    duration: ev.duration * 1.2,
    velocity: ev.velocity * 0.45,
    type: 'sawtooth',
  });
}

/** Kick: a sine swept 110Hz down to 45Hz, which is what produces the thump. */
export function playKick(ctx, dest, ev) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, ev.time);
  osc.frequency.exponentialRampToValueAtTime(45, ev.time + 0.12);

  gain.gain.setValueAtTime(Math.max(0.0002, ev.velocity), ev.time);
  gain.gain.exponentialRampToValueAtTime(0.0001, ev.time + 0.28);

  osc.connect(gain).connect(dest);
  track(ctx, osc);
  osc.start(ev.time);
  osc.stop(ev.time + 0.32);
}

/** Snare: bandpassed noise for the rattle plus a tuned triangle for the body. */
export function playSnare(ctx, dest, ev) {
  noiseHit(ctx, dest, ev.time, {
    duration: 0.16,
    velocity: ev.velocity * 0.5,
    filterType: 'bandpass',
    freq: 1900,
    q: 0.9,
  });
  tone(ctx, dest, ev.time, {
    freq: 190,
    duration: 0.09,
    velocity: ev.velocity * 0.25,
    type: 'triangle',
  });
}

/** Hat: highpassed noise, very short, sitting above everything else. */
export function playHat(ctx, dest, ev) {
  noiseHit(ctx, dest, ev.time, {
    duration: 0.05,
    velocity: ev.velocity * 0.35,
    filterType: 'highpass',
    freq: 7000,
  });
}

/** Tom: like the kick but higher and shorter, used to fill end-of-bar rolls. */
export function playTom(ctx, dest, ev) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ev.time);
  osc.frequency.exponentialRampToValueAtTime(120, ev.time + 0.16);

  gain.gain.setValueAtTime(Math.max(0.0002, ev.velocity * 0.6), ev.time);
  gain.gain.exponentialRampToValueAtTime(0.0001, ev.time + 0.22);

  osc.connect(gain).connect(dest);
  track(ctx, osc);
  osc.start(ev.time);
  osc.stop(ev.time + 0.26);
}

// The voice name carried on each composed event selects the synth here. An
// unknown name is ignored rather than throwing, so a malformed event degrades
// to silence instead of breaking a whole performance.
const VOICES = {
  lead: playLead,
  pad: playPad,
  bass: playBass,
  kick: playKick,
  snare: playSnare,
  hat: playHat,
  tom: playTom,
};

/**
 * Dispatches one event to its voice. This is the only entry point the engine
 * and the offline renderer both use.
 */
export function playEvent(ctx, dest, ev) {
  const voice = VOICES[ev.voice];
  if (voice) voice(ctx, dest, ev);
}