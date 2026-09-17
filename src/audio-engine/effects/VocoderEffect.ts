import type { Effect } from "./Effect";
import type { VocoderParams } from "@/types/effects";

/**
 * Brief mode 9, "Vocoder / robot" - a real channel vocoder, not a preset
 * on top of pitch correction (which is what "Corrección dura"/mode 2
 * already covers for the T-Pain-style snap sound; this is the different,
 * classic-synth-talking-through-a-robot timbre).
 *
 * Textbook analysis/synthesis vocoder, built entirely from native Web
 * Audio nodes (no worklet needed):
 *  - The voice (modulator) is split into `BAND_COUNT` bandpass filters.
 *  - Each band's amplitude envelope is extracted with a full-wave
 *    rectifier (a WaveShaperNode whose curve is `abs(x)`) followed by a
 *    low-pass filter (~25Hz) that smooths the rectified signal into a
 *    slowly-varying "how loud is this band right now" control signal -
 *    still an AudioNode output, not a number read back to JS.
 *  - A single carrier oscillator (buzzy sawtooth or square, the classic
 *    vocoder timbres) is split into the same `BAND_COUNT` bandpass
 *    filters at the same center frequencies.
 *  - Each carrier band is multiplied by its matching envelope using the
 *    standard Web Audio "audio-rate AudioParam modulation" trick:
 *    connecting an AudioNode's output directly into a GainNode's `.gain`
 *    AudioParam multiplies the two signals together, sample-accurately -
 *    there is no dedicated "multiply two signals" node, this *is* how
 *    it's done natively.
 *  - All `BAND_COUNT` modulated carrier bands are summed - that sum is
 *    the classic vocoder voice.
 *
 * Deliberate simplification, stated plainly: `BAND_COUNT` is fixed at
 * construction (rebuilding the whole filter bank for a live band-count
 * change isn't worth the complexity for a vocal DAW insert), and there is
 * no pitch-tracking carrier (the carrier is a fixed note you set, not the
 * singer's own pitch) - both are genuine vocoders do more elaborately, but
 * this is a real one, not an approximation faked with pitch correction.
 */

const BAND_COUNT = 12;
const MIN_HZ = 150;
const MAX_HZ = 6000;
const BAND_Q = 6;
const ENVELOPE_LOWPASS_HZ = 25;

function bandCenterHz(index: number): number {
  // Log-spaced bands - matches how vocoders are conventionally laid out
  // (equal perceptual spacing, not equal Hz spacing) and how EqPanel/etc.
  // already space their own frequency axes in this project.
  const t = index / (BAND_COUNT - 1);
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, t);
}

/** abs(x) rectifier curve for the envelope followers' WaveShaperNode. */
function rectifierCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1; // -1..1
    curve[i] = Math.abs(x);
  }
  return curve;
}

interface BandNodes {
  modBand: BiquadFilterNode;
  rectifier: WaveShaperNode;
  envelopeLowpass: BiquadFilterNode;
  carrierBand: BiquadFilterNode;
  bandOut: GainNode;
}

export class VocoderEffect implements Effect<VocoderParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private carrier: OscillatorNode;
  private carrierGain: GainNode; // lets setParams swap carrier type without reconnecting the whole band bank
  private bandSum: GainNode;
  /** In series after `output` (see AUDIO_ENGINE.md's "why analysers must
   * sit in the actual signal path" - same reasoning as every other
   * effect's telemetry tap in this project) - real post-vocoder level for
   * VocoderPanel's meter, not invented. */
  private outputAnalyser: AnalyserNode;
  /** Kept as explicit fields (not left as loop-local const bindings) so
   * dispose() can name every node it tears down, same convention as
   * MultibandCompressorEffect's per-band fields - not relying on nodes
   * becoming implicitly unreachable once their neighbors are disconnected. */
  private bands: BandNodes[] = [];

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.bandSum = ctx.createGain();
    this.bandSum.gain.value = 1 / Math.sqrt(BAND_COUNT); // rough level compensation for summing N bands

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.bandSum.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.outputAnalyser = ctx.createAnalyser();
    this.outputAnalyser.fftSize = 1024;
    this.output.connect(this.outputAnalyser);

    this.carrierGain = ctx.createGain();
    this.carrier = ctx.createOscillator();
    this.carrier.type = "sawtooth";
    this.carrier.frequency.value = 110;
    this.carrier.connect(this.carrierGain);
    this.carrier.start();

    const rectCurve = rectifierCurve();
    for (let i = 0; i < BAND_COUNT; i++) {
      const freq = bandCenterHz(i);

      const modBand = ctx.createBiquadFilter();
      modBand.type = "bandpass";
      modBand.frequency.value = freq;
      modBand.Q.value = BAND_Q;
      this.input.connect(modBand);

      const rectifier = ctx.createWaveShaper();
      rectifier.curve = rectCurve;
      modBand.connect(rectifier);

      const envelopeLowpass = ctx.createBiquadFilter();
      envelopeLowpass.type = "lowpass";
      envelopeLowpass.frequency.value = ENVELOPE_LOWPASS_HZ;
      rectifier.connect(envelopeLowpass);

      const carrierBand = ctx.createBiquadFilter();
      carrierBand.type = "bandpass";
      carrierBand.frequency.value = freq;
      carrierBand.Q.value = BAND_Q;
      this.carrierGain.connect(carrierBand);

      const bandOut = ctx.createGain();
      bandOut.gain.value = 0; // base level - the envelope signal supplies the actual amplitude
      carrierBand.connect(bandOut);
      envelopeLowpass.connect(bandOut.gain); // audio-rate multiply: carrier band x envelope

      bandOut.connect(this.bandSum);
      this.bands.push({ modBand, rectifier, envelopeLowpass, carrierBand, bandOut });
    }
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.outputAnalyser;
  }

  getOutputAnalyser(): AnalyserNode {
    return this.outputAnalyser;
  }

  setParams(params: VocoderParams): void {
    const t = this.ctx.currentTime;
    this.carrier.type = params.carrierType;
    this.carrier.frequency.setTargetAtTime(params.carrierFreqHz, t, 0.01);
    this.dryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  dispose(): void {
    this.carrier.stop();
    this.input.disconnect();
    this.output.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.carrierGain.disconnect();
    this.carrier.disconnect();
    this.bandSum.disconnect();
    this.outputAnalyser.disconnect();
    for (const band of this.bands) {
      band.modBand.disconnect();
      band.rectifier.disconnect();
      band.envelopeLowpass.disconnect();
      band.carrierBand.disconnect();
      band.bandOut.disconnect();
    }
  }
}
