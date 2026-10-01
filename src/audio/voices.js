let sharedNoise = null;
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

export function playLead(ctx, dest, ev) {
  tone(ctx, dest, ev.time, {
    freq: ev.freq,
    duration: ev.duration,
    velocity: ev.velocity * 0.5,
    type: 'triangle',
  });
}

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

export function playHat(ctx, dest, ev) {
  noiseHit(ctx, dest, ev.time, {
    duration: 0.05,
    velocity: ev.velocity * 0.35,
    filterType: 'highpass',
    freq: 7000,
  });
}

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

const VOICES = {
  lead: playLead,
  pad: playPad,
  bass: playBass,
  kick: playKick,
  snare: playSnare,
  hat: playHat,
  tom: playTom,
};

export function playEvent(ctx, dest, ev) {
  const voice = VOICES[ev.voice];
  if (voice) voice(ctx, dest, ev);
}