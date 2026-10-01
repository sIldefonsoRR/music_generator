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

const SAMPLE_TEXT =
  'the quick brown fox jumps over the lazy dog. does it? yes! every letter is a note.';

textInput.value = SAMPLE_TEXT;

const engine = createEngine();
const visualizer = createVisualizer(canvas);

let params = defaultParams(textInput.value);
let events = compose(textInput.value, params);
let volume = 0.8;
let lastPosition = 0;

const scheduler = createScheduler(engine, {
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

function recompose() {
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

textInput.addEventListener('input', () => {
  params = { ...defaultParams(textInput.value) };
  controls.syncParams(params);
  recompose();
});

window.addEventListener('resize', () => visualizer.draw(lastPosition));

visualizer.setEvents(events);
visualizer.draw(0);