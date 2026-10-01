import { playEvent } from './voices.js';

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = buffer.getChannelData(c)[i];
      const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(arrayBuffer);
}

export async function renderWav(events, volume = 0.8) {
  if (typeof globalThis.OfflineAudioContext === 'undefined') {
    throw new Error('OfflineAudioContext is not available in this browser');
  }

  const end = events.length ? events[events.length - 1].time + events[events.length - 1].duration : 1;
  const tail = 0.5;
  const frames = Math.ceil((end + tail) * 44100);

  const ctx = new OfflineAudioContext(2, frames, 44100);

  const master = ctx.createGain();
  master.gain.value = volume;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  master.connect(compressor).connect(ctx.destination);

  for (const ev of events) {
    playEvent(ctx, master, ev);
  }

  const buffer = await ctx.startRendering();
  return encodeWav(buffer);
}

export function downloadWav(bytes, filename = 'piece.wav') {
  const blob = new Blob([bytes], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}