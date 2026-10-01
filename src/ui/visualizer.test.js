import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createVisualizer } from './visualizer.js';

function fakeCanvas() {
  const noop = () => {};
  const ctx = new Proxy(
    {},
    {
      get: (t, k) => (k in t ? t[k] : noop),
      set: (t, k, v) => {
        t[k] = v;
        return true;
      },
    }
  );
  return {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 800, height: 400 }),
    width: 0,
    height: 0,
  };
}

describe('createVisualizer animation loop', () => {
  let queued;
  let cancelled;

  beforeEach(() => {
    queued = null;
    cancelled = [];
    globalThis.window = { devicePixelRatio: 1 };
    globalThis.requestAnimationFrame = (cb) => {
      queued = cb;
      return 1;
    };
    globalThis.cancelAnimationFrame = (id) => cancelled.push(id);
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });

  const EVENTS = [
    { time: 0, duration: 0.5, midi: 60, velocity: 0.6, voice: 'lead', drum: false, accent: false, char: 'a', charIndex: 0 },
    { time: 0.5, duration: 0.5, midi: 64, velocity: 0.5, voice: 'lead', drum: false, accent: false, char: 'b', charIndex: 1 },
    { time: 1.0, duration: 0.2, midi: null, velocity: 0.9, voice: 'kick', drum: true, accent: false, char: '', charIndex: -1 },
  ];

  it('keeps rendering past the first animation frame', () => {
    const viz = createVisualizer(fakeCanvas());
    viz.setEvents(EVENTS);

    const getPosition = vi.fn(() => 0.25);
    viz.start(getPosition);

    // Frame 1 schedules frame 2.
    expect(() => queued()).not.toThrow();

    // Frame 2 must also schedule frame 3, still calling getPosition.
    expect(() => queued()).not.toThrow();

    expect(getPosition).toHaveBeenCalledTimes(2);
  });

  it('cancels the pending frame on stop', () => {
    const viz = createVisualizer(fakeCanvas());
    viz.setEvents(EVENTS);
    viz.start(() => 0);
    viz.stop();
    expect(cancelled).toContain(1);
  });

  it('does not leave a frame pending after stop', () => {
    const viz = createVisualizer(fakeCanvas());
    viz.setEvents(EVENTS);
    viz.start(() => 0);
    queued();
    cancelled.length = 0;
    viz.stop();
    expect(cancelled).toHaveLength(1);
  });
});