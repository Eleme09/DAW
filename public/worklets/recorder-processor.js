/**
 * Captures raw input audio and posts each 128-frame block straight to the
 * main thread. No encoding, no compression, no mixing — see
 * AUDIO_ENGINE.md's real-time/offline split. All WAV encoding happens
 * offline in wavEncoder.ts once recording stops.
 */
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0].length > 0) {
      const channels = input.map((channel) => channel.slice());
      this.port.postMessage(channels);
    }
    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);
