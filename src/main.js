// Composition root — the only module that knows about all three layers.
//
// Owns the mutable state (text, params, events, volume) and coordinates them:
// input or a control change re-composes, and the resulting Event[] is handed to
// both the audio scheduler and the visualizer, so what you see and what you
// hear always come from the same array.

import './style.css';
import { compose, defaultParams, countLetters, MAX_TEXT_LENGTH, TRUNCATE_TO } from './music/compose.js';
import { createEngine } from './audio/engine.js';
import { createScheduler } from './audio/scheduler.js';
import { renderWav, downloadWav } from './audio/wav.js';
import { createVisualizer } from './ui/visualizer.js';
import { createControls } from './ui/controls.js';

const textInput = document.getElementById('text-input');
const controlsRoot = document.getElementById('controls');
const notice = document.getElementById('text-notice');
const canvas = document.getElementById('piano-roll');

// Seeded on load so the app shows a populated roll instead of an empty canvas.
const SAMPLE_TEXT =
  'the quick brown fox jumps over the lazy dog. does it? yes! every letter is a note.';

textInput.value = SAMPLE_TEXT;

const engine = createEngine();
const visualizer = createVisualizer(canvas);

let params = defaultParams(textInput.value);
let events = compose(textInput.value, params);
let volume = 0.8;
// Last playhead position, retained so a window resize can repaint mid-playback.
let lastPosition = 0;

const scheduler = createScheduler(engine, {
  // onTick is the cheapest place to sample the playhead for later repaints.
  onTick: (elapsed) => {
    lastPosition = elapsed;
  },
  onEnd: () => {
    controls.setPlaying(false);
    visualizer.stop();
    visualizer.draw(0);
  },
});

const controls = createControls(controlsRoot, params, {
  // Play must resume the AudioContext first: browsers keep it suspended until
  // a user gesture, and without this the first notes are silently dropped.
  onPlay: async () => {
    if (events.length === 0) return;
    await engine.resume();
    visualizer.setEvents(events);
    visualizer.start(() => scheduler.position());
    scheduler.start(events);
    controls.setPlaying(true);
  },
  onStop: () => {
    scheduler.stop();
    visualizer.stop();
    visualizer.draw(0);
    controls.setPlaying(false);
  },
  onExport: async () => {
    try {
      notice.hidden = true;
      const bytes = await renderWav(events, volume);
      downloadWav(bytes);
    } catch (err) {
      notice.textContent = `Export failed: ${err.message}`;
      notice.hidden = false;
    }
  },
  onParam: (key, value) => {
    params = { ...params, [key]: value };
    recompose();
  },
  onSeed: (value) => {
    params = { ...params, seed: value };
    recompose();
  },
  onVolume: (value) => {
    volume = value;
    engine.setVolume(value);
  },
});

/**
 * Recomposes from the current text and params, then either restarts playback or
 * leaves it stopped. Called whenever text or a parameter changes.
 */
function recompose() {
  // Remembered so that adjusting a slider mid-playback keeps playing, rather
  // than silently stopping on every drag.
  const wasPlaying = scheduler.isPlaying();
  scheduler.stop();
  visualizer.stop();

  const text = textInput.value;
  const trimmed = text.length > MAX_TEXT_LENGTH;
  const letters = countLetters(trimmed ? text.slice(0, TRUNCATE_TO) : text);

  if (trimmed) {
    notice.textContent = `Text is long: using the first ${TRUNCATE_TO} of ${text.length} characters (${letters} notes).`;
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }

  events = compose(text, params);
  visualizer.setEvents(events);
  visualizer.draw(0);

  controls.setPlayEnabled(letters > 0);

  if (wasPlaying && letters > 0) {
    visualizer.start(() => scheduler.position());
    scheduler.start(events);
  } else {
    controls.setPlaying(false);
  }
}

// Editing the text re-derives every parameter from the new words, so tempo,
// mode, and seed all follow the content. Changing a slider instead preserves
// the rest of the parameters.
textInput.addEventListener('input', () => {
  params = { ...defaultParams(textInput.value) };
  controls.syncParams(params);
  recompose();
});

// The canvas has no size until it is laid out, so draw once after resize too.
window.addEventListener('resize', () => visualizer.draw(lastPosition));

visualizer.setEvents(events);
visualizer.draw(0);