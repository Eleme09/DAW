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
    // Level detector: instant peak with a 10 ms decay, so the gate reads the
    // voice's level, not each waveform cycle. It opens at the threshold and
    // only closes 3 dB below it (hysteresis): near the threshold it used to
    // flutter open/closed on every cycle - a rattle.
    this.level = 0;
    this.levelDecay = Math.exp(-1 / (0.01 * sampleRate));
    this.isOpen = false;
    this.thresholdSmoothed = null;
    this.samplesSincePost = 0;
    this.postIntervalSamples = Math.round(sampleRate * 0.05); // ~20 Hz to the main thread
    // per-sample gain of the current block, reused (no allocation on the
    // audio thread: its garbage collection is heard as dropouts)
    this.envelopeAtSample = new Float32Array(128);
  }

  post(blockSize) {
    // Real gate gain, not reconstructed on the main thread - throttled so
    // it doesn't flood the message port at audio-block rate (~375/s).
    this.samplesSincePost += blockSize;
    if (this.samplesSincePost >= this.postIntervalSamples) {
      this.samplesSincePost = 0;
      this.port.postMessage(this.envelope);
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    // the threshold glides (a knob move is not a jump)
    const thresholdTarget = parameters.thresholdDb[0];
    if (this.thresholdSmoothed === null) this.thresholdSmoothed = thresholdTarget;
    this.thresholdSmoothed += (thresholdTarget - this.thresholdSmoothed) * 0.25;
    const thresholdDb = this.thresholdSmoothed;
    const attackMs = parameters.attackMs[0];
    const releaseMs = parameters.releaseMs[0];
    const holdMs = parameters.holdMs[0];
    const thresholdLinear = Math.pow(10, thresholdDb / 20);
    const closeLinear = thresholdLinear * 0.7079; // -3 dB

    const attackCoeff = Math.exp(-1 / ((attackMs / 1000) * sampleRate));
    const releaseCoeff = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
    const holdSamples = (holdMs / 1000) * sampleRate;

    const blockSize = input[0].length;
    const detector = input[0];

    // Silence in with the gate already shut: silence out. Advance the
    // detector and the release exactly as the sample loop would.
    if (!this.isOpen && this.holdSamplesRemaining <= 0 && this.level < closeLinear) {
      let silent = true;
      for (let ch = 0; ch < input.length && silent; ch++) {
        const inCh = input[ch];
        for (let i = 0; i < inCh.length; i++) {
          if (inCh[i] !== 0) {
            silent = false;
            break;
          }
        }
      }
      if (silent) {
        this.level *= Math.pow(this.levelDecay, blockSize);
        this.envelope *= Math.pow(releaseCoeff, blockSize);
        for (let ch = 0; ch < output.length; ch++) output[ch].fill(0);
        this.post(blockSize);
        return true;
      }
    }

    // Detect once per sample (channel 0), then apply the same gain to every
    // channel — a stereo/mono signal gates as one linked unit, not per-channel.
    if (this.envelopeAtSample.length < blockSize) this.envelopeAtSample = new Float32Array(blockSize);
    const envelopeAtSample = this.envelopeAtSample;
    for (let i = 0; i < blockSize; i++) {
      const a = Math.abs(detector[i]);
      this.level = a > this.level ? a : this.level * this.levelDecay;
      if (this.level >= thresholdLinear) this.isOpen = true;
      else if (this.level < closeLinear) this.isOpen = false;
      const open = this.isOpen;
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

    this.post(blockSize);
    return true;
  }
}

registerProcessor("noise-gate-processor", NoiseGateProcessor);
