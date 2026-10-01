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

export function createControls(root, params, handlers) {
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

  const tempo = slider(60, 180, 1, params.tempo);
  const tempoVal = value(`${params.tempo} bpm`);
  tempo.addEventListener('input', () => {
    tempoVal.textContent = `${tempo.value} bpm`;
    handlers.onParam('tempo', Number(tempo.value));
  });

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
    setPlaying(playing) {
      playBtn.textContent = playing ? 'Playing' : 'Play';
      playBtn.disabled = playing;
    },
    setPlayEnabled(enabled) {
      playBtn.disabled = !enabled || playBtn.textContent === 'Playing';
    },
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