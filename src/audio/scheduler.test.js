import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler } from './scheduler.js';

function fakeEngine() {
  return {
    ctx: { currentTime: 0 },
    play: vi.fn(),
    stopAll: vi.fn(),
  };
}

const EVENTS = [
  { time: 0, voice: 'lead' },
  { time: 0.5, voice: 'lead' },
  { time: 1.0, voice: 'lead' },
];

describe('createScheduler', () => {
  let engine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = fakeEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not start for an empty event list', () => {
    const scheduler = createScheduler(engine);
    scheduler.start([]);
    expect(scheduler.isPlaying()).toBe(false);
  });

  it('reports playing once started', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    expect(scheduler.isPlaying()).toBe(true);
  });

  it('releases existing voices before playing a new run', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.stopAll.mockClear();
    scheduler.start(EVENTS);
    expect(engine.stopAll).toHaveBeenCalledTimes(1);
  });

  it('schedules events into the audio clock, offset by the start time', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.stopAll.mockClear();

    engine.ctx.currentTime = 0.5;
    vi.advanceTimersByTime(25);

    expect(engine.play).toHaveBeenCalledTimes(2);
    expect(engine.play.mock.calls[0][0].time).toBeCloseTo(0.06, 5);
    expect(engine.play.mock.calls[1][0].time).toBeCloseTo(0.56, 5);
  });

  it('holds events beyond the look-ahead window until they are close', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.play.mockClear();

    engine.ctx.currentTime = 0.0;
    vi.advanceTimersByTime(25);

    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('releases voices and clears the timer on stop', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.stopAll.mockClear();
    engine.play.mockClear();

    scheduler.stop();

    expect(scheduler.isPlaying()).toBe(false);
    expect(engine.stopAll).toHaveBeenCalledTimes(1);

    engine.ctx.currentTime = 5;
    vi.advanceTimersByTime(250);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('reports the elapsed playhead position', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.ctx.currentTime = 1.0;
    expect(scheduler.position()).toBeCloseTo(0.94, 5);
  });

  it('reports position 0 when stopped', () => {
    const scheduler = createScheduler(engine);
    expect(scheduler.position()).toBe(0);
  });

  it('fires onEnd once playback passes the final event', () => {
    const onEnd = vi.fn();
    const scheduler = createScheduler(engine, { onEnd });
    scheduler.start(EVENTS);

    engine.ctx.currentTime = 2.0;
    vi.advanceTimersByTime(25);

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(scheduler.isPlaying()).toBe(false);
  });
});