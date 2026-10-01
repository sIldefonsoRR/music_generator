// Live audio graph. Owns the AudioContext and the master chain; the scheduler
// drives it and the voices render into it.

import { playEvent, stopAllVoices } from './voices.js';

/**
 * Builds the audio graph: every voice -> master gain -> compressor -> output.
 *
 * The compressor is what keeps dense pieces from clipping. With one note per
 * letter, long words stack far more simultaneous voices than a normal
 * instrument would, and a limiter is cheaper than tuning around the problem.
 */
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
    /** Ramps volume rather than setting it, so dragging the slider never clicks. */
    setVolume(v) {
      master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    },
    /**
     * Browsers start the context suspended until a user gesture. Every entry
     * point into playback must await this or the first notes are dropped.
     */
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