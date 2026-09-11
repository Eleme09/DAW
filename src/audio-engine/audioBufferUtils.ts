/** Shared AudioBuffer helpers for offline analysis (vocal, beat, pitch). */

export function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mixed = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mixed[i] += data[i] / buffer.numberOfChannels;
  }
  return mixed;
}
