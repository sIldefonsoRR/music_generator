import { playEvent, stopAllVoices } from './voices.js';

export function createEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const master = ctx.createGain();
  master.gain.value = 0.8;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  master.connect(compressor).connect(ctx.destination);

  return {
    ctx,
    master,
    setVolume(v) {
      master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    },
    resume() {
      if (ctx.state === 'suspended') return ctx.resume();
      return Promise.resolve();
    },
    play(ev) {
      playEvent(ctx, master, ev);
    },
    stopAll() {
      stopAllVoices(ctx);
    },
  };
}