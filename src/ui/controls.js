// Builds the control strip and wires it to the handlers the composition root
// passes in. The UI layer owns no musical state: it reads params and reports
// changes, and the root decides what that means.

const MODE_OPTIONS = [
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'majorPentatonic',
  'minorPentatonic',
  'blues',
];

/**
 * Wraps a control with a label and an optional readout, returning the column.
 * Each control gets a derived id so the label is properly associated rather
 * than sitting next to the input unlinked.
 */
function field(label, control, valueEl) {
  const wrap = document.createElement('div');
  wrap.className = 'control';
  const id = `ctl-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  control.id = id;
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.textContent = label;
  wrap.append(lab, control);
  if (valueEl) {
    valueEl.className = 'control--value';
    wrap.append(valueEl);
  }
  return wrap;
}

function slider(min, max, step, value) {
  const el = document.createElement('input');
  el.type = 'range';
  el.min = min;
  el.max = max;
  el.step = step;
  el.value = value;
  return el;
}

/**
 * Renders the control strip into `root` and returns the small imperative API
 * the root uses to push state back into the UI.
 *
 * @param params initial musical parameters, used to seed control values
 * @param handlers onPlay, onStop, onExport, onParam(key, value), onSeed, onVolume
 */
export function createControls(root, params, handlers) {
  /** Creates a plain text readout for a slider's current value. */
  const value = (v) => {
    const el = document.createElement('span');
    el.textContent = v;
    return el;
  };

  const playBtn = document.createElement('button');
  playBtn.className = 'btn';
  playBtn.textContent = 'Play';
  playBtn.addEventListener('click', handlers.onPlay);

  const stopBtn = document.createElement('button');
  stopBtn.className = 'btn btn--secondary';
  stopBtn.textContent = 'Stop';
  stopBtn.addEventListener('click', handlers.onStop);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--secondary';
  exportBtn.textContent = 'Export WAV';
  exportBtn.addEventListener('click', handlers.onExport);

  const playWrap = document.createElement('div');
  playWrap.className = 'control';
  playWrap.append(playBtn, stopBtn, exportBtn);

  // Sliders use 'input' rather than 'change' so the piece updates live while
  // dragging, not only on release.
  const tempo = slider(60, 180, 1, params.tempo);
  const tempoVal = value(`${params.tempo} bpm`);
  tempo.addEventListener('input', () => {
    tempoVal.textContent = `${tempo.value} bpm`;
    handlers.onParam('tempo', Number(tempo.value));
  });

  // Modes come from an explicit list so the dropdown order stays stable and
  // readable rather than following object key order.
  const mode = document.createElement('select');
  for (const name of MODE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    mode.append(opt);
  }
  mode.value = params.mode;
  mode.addEventListener('change', () => handlers.onParam('mode', mode.value));

  const density = slider(0, 1, 0.01, params.drumDensity);
  const densityVal = value(params.drumDensity.toFixed(2));
  density.addEventListener('input', () => {
    densityVal.textContent = Number(density.value).toFixed(2);
    handlers.onParam('drumDensity', Number(density.value));
  });

  const volume = slider(0, 1, 0.01, 0.8);
  const volumeVal = value('0.80');
  volume.addEventListener('input', () => {
    volumeVal.textContent = Number(volume.value).toFixed(2);
    handlers.onVolume(Number(volume.value));
  });

  // Seed uses 'change' so typing does not re-compose per keystroke. A
  // non-numeric entry falls back to the current seed rather than becoming NaN.
  const seed = document.createElement('input');
  seed.type = 'text';
  seed.value = String(params.seed);
  seed.addEventListener('change', () => {
    const parsed = Number(seed.value);
    handlers.onSeed(Number.isFinite(parsed) ? parsed >>> 0 : params.seed);
  });

  root.replaceChildren(
    playWrap,
    field('Tempo', tempo, tempoVal),
    field('Mode', mode),
    field('Drums', density, densityVal),
    field('Volume', volume, volumeVal),
    field('Seed', seed)
  );

  return {
    /** Reflects playback state on the Play button. */
    setPlaying(playing) {
      playBtn.textContent = playing ? 'Playing' : 'Play';
      playBtn.disabled = playing;
    },
    /**
     * Enables Play only when there is something to play, without cancelling an
     * in-progress run — hence the label check.
     */
    setPlayEnabled(enabled) {
      playBtn.disabled = !enabled || playBtn.textContent === 'Playing';
    },
    /** Pushes externally-changed parameters (e.g. after editing the text) back in. */
    syncParams(next) {
      tempo.value = String(next.tempo);
      tempoVal.textContent = `${next.tempo} bpm`;
      mode.value = next.mode;
      density.value = String(next.drumDensity);
      densityVal.textContent = next.drumDensity.toFixed(2);
      seed.value = String(next.seed);
    },
  };
}