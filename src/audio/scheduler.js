const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

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

    while (index < events.length && events[index].time < elapsed + SCHEDULE_AHEAD_S) {
      const ev = events[index];
      engine.play({ ...ev, time: startTime + ev.time });
      index++;
    }

    if (onTick) onTick(elapsed);

    if (index >= events.length && elapsed > end + 0.2) {
      clearTimer();
      if (onEnd) onEnd();
    }
  }

  function start(next) {
    clearTimer();
    engine.stopAll();
    events = next;
    index = 0;
    if (events.length === 0) return;
    startTime = engine.ctx.currentTime + 0.06;
    timer = setInterval(tick, LOOKAHEAD_MS);
  }

  function stop() {
    clearTimer();
    engine.stopAll();
  }

  function position() {
    if (timer === null) return 0;
    return Math.max(0, engine.ctx.currentTime - startTime);
  }

  function isPlaying() {
    return timer !== null;
  }

  return { start, stop, position, isPlaying };
}