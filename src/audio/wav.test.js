import { describe, it, expect } from 'vitest';
import { encodeWav } from './wav.js';

function fakeBuffer(channels, frames, sampleRate) {
  const data = [];
  for (let c = 0; c < channels; c++) {
    const arr = new Float32Array(frames);
    for (let i = 0; i < frames; i++) arr[i] = Math.sin(i * 0.1) * 0.5;
    data.push(arr);
  }
  return { numberOfChannels: channels, length: frames, sampleRate, getChannelData: (c) => data[c] };
}

describe('encodeWav', () => {
  it('starts with a RIFF header', () => {
    const view = new DataView(encodeWav(fakeBuffer(1, 100, 44100)).buffer);
    const tag = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    expect(tag).toBe('RIFF');
  });

  it('declares WAVE and PCM format', () => {
    const bytes = new Uint8Array(encodeWav(fakeBuffer(1, 100, 44100)).buffer);
    const wave = String.fromCharCode(...bytes.slice(8, 12));
    // 'fmt ' sits at offset 12; offset 20 holds the audio-format field
    const audioFmt = String.fromCharCode(...bytes.slice(12, 16));
    expect(wave).toBe('WAVE');
    expect(audioFmt).toBe('fmt ');
  });

  it('declares the correct total size', () => {
    const buffer = fakeBuffer(1, 100, 44100);
    const bytes = encodeWav(buffer);
    const view = new DataView(bytes.buffer);
    const declared = view.getUint32(4, true);
    expect(declared).toBe(bytes.byteLength - 8);
  });

  it('declares 16-bit mono at the buffer sample rate', () => {
    const view = new DataView(encodeWav(fakeBuffer(1, 100, 44100)).buffer);
    expect(view.getUint16(20 + 2, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
  });

  it('sizes the data chunk for stereo', () => {
    const buffer = fakeBuffer(2, 100, 44100);
    const view = new DataView(encodeWav(buffer).buffer);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(100 * 2 * 2);
  });

  it('clamps samples beyond full scale instead of wrapping', () => {
    const buffer = fakeBuffer(1, 4, 44100);
    const data = buffer.getChannelData(0);
    data[0] = 2.0;
    data[1] = -2.0;
    data[2] = 0;
    data[3] = 1;
    const view = new DataView(encodeWav(buffer).buffer);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(0);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});

describe('renderWav', () => {
  it('rejects when OfflineAudioContext is unavailable', async () => {
    const { renderWav } = await import('./wav.js');
    const original = globalThis.OfflineAudioContext;
    delete globalThis.OfflineAudioContext;
    await expect(renderWav([], 1)).rejects.toThrow(/OfflineAudioContext/);
    globalThis.OfflineAudioContext = original;
  });
});