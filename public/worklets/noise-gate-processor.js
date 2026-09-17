/**
 * Envelope-follower noise gate. Real per-sample gain automation, not a
 * control-rate approximation — this is what a gate needs to avoid zipper
 * noise on fast transients. Not spectral noise reduction (see
 * AUDIO_ENGINE.md) — it only attenuates when the signal drops below
 * threshold, it doesn't remove noise sitting under a loud signal.
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "thresholdDb", defaultValue: -45, minValue: -100, maxValue: 0 },
      { name: "attackMs", defaultValue: 2, minValue: 0.1, maxValue: 200 },
      { name: "releaseMs", defaultValue: 150, minValue: 1, maxValue: 2000 },
      { name: "holdMs", defaultValue: 50, minValue: 0, maxValue: 1000 },
    ];
  }

  constructor() {
    super();
    this.envelope = 0; // 0..1 gain currently applied
    this.holdSamplesRemaining = 0;
    this.samplesSincePost = 0;
    this.postIntervalSamples = Math.round(sampleRate * 0.05); // ~20 Hz to the main thread
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const thresholdDb = parameters.thresholdDb[0];
    const attackMs = parameters.attackMs[0];
    const releaseMs = parameters.releaseMs[0];
    const holdMs = parameters.holdMs[0];
    const thresholdLinear = Math.pow(10, thresholdDb / 20);

    const attackCoeff = Math.exp(-1 / ((attackMs / 1000) * sampleRate));
    const releaseCoeff = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
    const holdSamples = (holdMs / 1000) * sampleRate;

    // Detect once per sample (channel 0), then apply the same gain to every
    // channel — a stereo/mono signal gates as one linked unit, not per-channel.
    const blockSize = input[0].length;
    const envelopeAtSample = new Float32Array(blockSize);
    const detector = input[0];
    for (let i = 0; i < blockSize; i++) {
      const open = Math.abs(detector[i]) >= thresholdLinear;
      if (open) this.holdSamplesRemaining = holdSamples;
      const target = open || this.holdSamplesRemaining > 0 ? 1 : 0;
      const coeff = target > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope = target + coeff * (this.envelope - target);
      if (!open && this.holdSamplesRemaining > 0) this.holdSamplesRemaining--;
      envelopeAtSample[i] = this.envelope;
    }

    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      for (let i = 0; i < inCh.length; i++) {
        outCh[i] = inCh[i] * envelopeAtSample[i];
      }
    }

    // Real gate gain, not reconstructed on the main thread - throttled so
    // it doesn't flood the message port at audio-block rate (~375/s).
    this.samplesSincePost += blockSize;
    if (this.samplesSincePost >= this.postIntervalSamples) {
      this.samplesSincePost = 0;
      this.port.postMessage(this.envelope);
    }
    return true;
  }
}

registerProcessor("noise-gate-processor", NoiseGateProcessor);
