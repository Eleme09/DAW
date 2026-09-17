/**
 * Extracts a clip's actually-audible region (`[sourceOffset, sourceOffset +
 * duration]`) out of the full decoded sample into its own AudioBuffer - the
 * `AudioBuffer` constructor isn't tied to any context (see bounce.ts's own
 * comment on this), so this needs no live/offline context to exist. Used
 * where "the take" means what you'll actually hear, not the whole original
 * recording including any trimmed-away parts (e.g. VozPanel's waveform/
 * pitch analysis) - drawing/analyzing the untrimmed buffer stretched to the
 * clip's width would be a real, if minor, dishonesty about what the take is.
 */
export function sliceAudioBuffer(source: AudioBuffer, offsetSec: number, durationSec: number): AudioBuffer {
  const sampleRate = source.sampleRate;
  const startSample = Math.max(0, Math.floor(offsetSec * sampleRate));
  const length = Math.max(1, Math.floor(durationSec * sampleRate));
  const out = new AudioBuffer({ numberOfChannels: source.numberOfChannels, length, sampleRate });
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const srcData = source.getChannelData(ch);
    const outData = out.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const srcIndex = startSample + i;
      outData[i] = srcIndex < srcData.length ? srcData[srcIndex] : 0;
    }
  }
  return out;
}
