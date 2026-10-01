// Look-ahead playback clock.
//
// setInterval is far too jittery to trigger notes directly, so the loop does
// not play anything "now". Every 25ms it schedules whatever falls inside the
// next 100ms straight onto the audio clock, which then plays them sample
// accurately. Jitter in the timer costs accuracy only in how early we commit,
// never in when a note is heard.

const LOOKAHEAD_MS = 25;

// How far ahead of the playhead we commit events. Larger gives more room
// against timer jitter; smaller means a param change is heard sooner.
const SCHEDULE_AHEAD_S = 0.1;

/**
 * Drives an event list through the engine.
 *
 * Events are translated from piece-relative times into absolute context times
 * by adding startTime, so playback begins on the beat rather than immediately.
 */
export function createScheduler(engine, { onTick, onEnd } = {}) {
  let timer = null;
  let events = [];
  let index = 0;
  let startTime = 0;

  function clearTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function tick() {
    const now = engine.ctx.currentTime;
    const elapsed = now - startTime;
    const end = events.length ? events[events.length - 1].time : 0;

    // Single forward pass: index only ever moves ahead, so a full piece costs
    // one traversal regardless of length.
    while (index < events.length && events[index].time < elapsed + SCHEDULE_AHEAD_S) {
      const ev = events[index];
      engine.play({ ...ev, time: startTime + ev.time });
      index++;
    }

    if (onTick) onTick(elapsed);

    // Wait past the final event's ring-out before declaring the piece over.
    if (index >= events.length && elapsed > end + 0.2) {
      clearTimer();
      if (onEnd) onEnd();
    }
  }

  /**
   * Begins playback of `next`. Stops any current run first, so pressing Play
   * mid-piece restarts cleanly instead of layering two performances.
   */
  function start(next) {
    clearTimer();
    engine.stopAll();
    events = next;
    index = 0;
    if (events.length === 0) return;
    // Small head start so the first batch can be committed ahead of now.
    startTime = engine.ctx.currentTime + 0.06;
    timer = setInterval(tick, LOOKAHEAD_MS);
  }

  function stop() {
    clearTimer();
    engine.stopAll();
  }

  /** Playhead position in piece-relative seconds; drives the visualizer. */
  function position() {
    if (timer === null) return 0;
    return Math.max(0, engine.ctx.currentTime - startTime);
  }

  function isPlaying() {
    return timer !== null;
  }

  return { start, stop, position, isPlaying };
}