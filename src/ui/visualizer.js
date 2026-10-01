// Canvas piano-roll.
//
// Reads the same Event[] as playback, so notes cannot appear out of sync with
// what is heard. The roll occupies the upper area by pitch; percussion sits in
// fixed lanes along the bottom.

const COLORS = {
  lead: '#4fd1c5',
  pad: '#7c8cf8',
  bass: '#3b7dd8',
  kick: '#e0533f',
  snare: '#e6a23c',
  hat: '#8a94a8',
  tom: '#c96fd0',
  playhead: '#ffffff',
};

export function createVisualizer(canvas) {
  const ctx = canvas.getContext('2d');
  let events = [];
  let duration = 0;
  let minMidi = 127;
  let maxMidi = 0;
  let raf = null;

  /**
   * Matches the backing store to the CSS size and device pixel ratio.
   * Called from draw() rather than only on window resize, so the canvas is
   * also correct on first paint.
   */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return rect;
  }

  /**
 * Installs a new piece and recomputes the vertical range.
 *
 * The pitch window is derived from the notes actually present, with a one
 * octave floor so short or single-pitch pieces still fill the canvas instead
 * of collapsing to a flat line.
 */
  function setEvents(next) {
    events = next;
    duration = events.length
      ? events[events.length - 1].time + events[events.length - 1].duration
      : 0;

    const midis = events.filter((e) => !e.drum).map((e) => e.midi);
    if (midis.length) {
      minMidi = Math.min(...midis);
      maxMidi = Math.max(...midis);
    } else {
      minMidi = 48;
      maxMidi = 72;
    }
    if (maxMidi - minMidi < 12) maxMidi = minMidi + 12;
  }

  /**
 * Paints one frame. Redraws from scratch — at these event counts that is far
 * cheaper than tracking dirty regions.
 *
 * @param position playhead position in seconds, or 0 when stopped
 */
  function draw(position) {
    const rect = resize();
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#0d1017';
    ctx.fillRect(0, 0, w, h);

    // Percussion gets fixed lanes along the bottom; the roll takes the rest.
    const drumLanes = 5;
    const drumHeight = Math.min(28, h / (drumLanes + 2));
    const drumTop = h - drumLanes * drumHeight;
    const rollTop = 8;
    const rollHeight = drumTop - rollTop - 8;

    ctx.strokeStyle = '#1b2130';
    ctx.lineWidth = 1;

    const span = Math.max(1, maxMidi - minMidi);
    for (let i = 0; i <= span; i++) {
      const y = drumTop - (i / span) * rollHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (let i = 0; i <= duration; i += 0.5) {
      const x = (i / Math.max(0.001, duration)) * w;
      ctx.beginPath();
      ctx.moveTo(x, rollTop);
      ctx.lineTo(x, drumTop);
      ctx.stroke();
    }

    const laneIndex = { kick: 0, snare: 1, hat: 2, tom: 3 };

    for (const ev of events) {
      // duration is guarded against zero so an empty piece cannot divide by 0.
      const x = (ev.time / Math.max(0.001, duration)) * w;
      const color = COLORS[ev.voice] ?? '#666';

      if (ev.drum) {
        const lane = laneIndex[ev.voice];
        if (lane === undefined) continue;
        const cy = h - (lane + 0.5) * drumHeight;
        // Diamond size scales with velocity, so accents read louder on screen.
        const r = Math.min(4, drumHeight * 0.25) * (0.6 + ev.velocity * 0.6);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, cy - r);
        ctx.lineTo(x + r, cy);
        ctx.lineTo(x, cy + r);
        ctx.lineTo(x - r, cy);
        ctx.closePath();
        ctx.fill();
      } else {
        // Notes are horizontal bars: x is time, y is pitch, width is duration.
        const norm = (ev.midi - minMidi) / span;
        const y = drumTop - norm * rollHeight;
        const wpx = Math.max(2, (ev.duration / Math.max(0.001, duration)) * w);
        ctx.fillStyle = color;
        // Opacity doubles as velocity, so a loud uppercase letter shows brighter.
        ctx.globalAlpha = 0.35 + ev.velocity * 0.65;
        ctx.fillRect(x, y - 2, wpx, 4);
        ctx.globalAlpha = 1;
      }
    }

    const px = (position / Math.max(0.001, duration)) * w;
    ctx.strokeStyle = COLORS.playhead;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, rollTop);
    ctx.lineTo(px, drumTop);
    ctx.stroke();
  }

  function loop(getPosition) {
    draw(getPosition());
    // Re-arm through the closure, not as a bare `loop`: a bare reference would
    // drop getPosition, so the second frame would call undefined and the
    // animation loop would die after exactly one frame.
    raf = requestAnimationFrame(() => loop(getPosition));
  }

  /**
   * Starts the render loop. `getPosition` is called each frame to read the
   * playhead; it is a callback because the visualizer must not depend on the
   * audio scheduler.
   */
  function start(getPosition) {
    stop();
    raf = requestAnimationFrame(() => loop(getPosition));
  }

  /** Cancels the pending frame, if any. Safe to call when already stopped. */
  function stop() {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  return { setEvents, draw, start, stop, resize };
}