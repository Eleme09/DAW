import { computeMeanSquare } from "../loudness";

const SMOOTHING = 0.95; // same exponential-smoothing constant as Analyzer.tsx/LimiterPanel.tsx's loudness readouts
const RAMP_SEC = 0.03; // click-free crossfade/compensation transition, inaudible but not instant (avoids zipper noise)
const MAX_COMPENSATION_DB = 18; // clamp - an effect that goes near-silent (e.g. a closed gate) shouldn't demand an absurd boost to "match" it
const MEAN_SQUARE_FLOOR = 1e-9; // ~-90dB-ish; below this, treat as "no real signal yet" rather than computing a wild ratio

/**
 * Zona 8 of "Cabina v2"'s plugin anatomy: "bypass honesto" - toggling an
 * effect on/off must not let a simple loudness difference masquerade as
 * "sounds better". Wraps one `Effect` instance with a permanent parallel
 * dry/wet split (both paths always running and always measured, instead of
 * the previous `if (bypassed) continue` which fully disconnected the node -
 * see EffectChain.ts) so the exact loudness delta between the two is known
 * continuously, not computed after the fact once you've already flipped
 * the switch. When bypass turns on, the dry path is boosted/cut by that
 * measured delta so what you hear next doesn't just get quieter or louder
 * - the level stays put and only the processing character changes.
 *
 * `tick()` must be called continuously (AudioEngine's own maintenance
 * loop, independent of whether any UI panel for this effect is open or
 * even mounted - this is audio correctness, not a UI meter) so the
 * compensation gain is already current the instant `setBypassed` fires,
 * not catching up afterward.
 */
export class BypassWrapper {
  readonly inputNode: GainNode;
  readonly outputNode: GainNode;

  private dryGain: GainNode;
  private wetGain: GainNode;
  private dryAnalyser: AnalyserNode;
  private wetAnalyser: AnalyserNode;
  private dryTimeData: Float32Array<ArrayBuffer>;
  private wetTimeData: Float32Array<ArrayBuffer>;
  private smoothedDryMs = 0;
  private smoothedWetMs = 0;
  private bypassed = false;
  private dryWired = false;
  private unwireTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: BaseAudioContext, effectInput: AudioNode, effectOutput: AudioNode) {
    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryAnalyser = ctx.createAnalyser();
    this.dryAnalyser.fftSize = 1024;
    this.wetAnalyser = ctx.createAnalyser();
    this.wetAnalyser.fftSize = 1024;
    this.dryTimeData = new Float32Array(this.dryAnalyser.fftSize);
    this.wetTimeData = new Float32Array(this.wetAnalyser.fftSize);

    // Level taps on the side (not in series): they only need to read.
    this.inputNode.connect(this.dryAnalyser);
    effectOutput.connect(this.wetAnalyser);

    // Wet path: through the real effect.
    this.inputNode.connect(effectInput);
    effectOutput.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    // Dry path: only wired while the effect is bypassed (or fading) - a
    // silent dry branch on every effect of every track was audio-thread
    // work for nothing (phones ran out of it with a few chains).
    this.dryGain.connect(this.outputNode);

    // Starts fully wet - matches `EffectInstance.bypassed`'s own default (false).
    this.dryGain.gain.value = 0;
    this.wetGain.gain.value = 1;
  }

  setBypassed(bypassed: boolean, ctx: BaseAudioContext): void {
    if (this.bypassed === bypassed) return;
    this.bypassed = bypassed;
    const now = ctx.currentTime;
    if (this.unwireTimer !== null) clearTimeout(this.unwireTimer);
    this.unwireTimer = null;
    if (bypassed) {
      if (!this.dryWired) {
        this.inputNode.connect(this.dryGain);
        this.dryWired = true;
      }
      this.wetGain.gain.setTargetAtTime(0, now, RAMP_SEC);
      this.dryGain.gain.setTargetAtTime(this.compensationGain(), now, RAMP_SEC);
    } else {
      this.dryGain.gain.setTargetAtTime(0, now, RAMP_SEC);
      this.wetGain.gain.setTargetAtTime(1, now, RAMP_SEC);
      // unwire the dry branch once its fade is over
      this.unwireTimer = setTimeout(() => {
        this.unwireTimer = null;
        if (this.bypassed || !this.dryWired) return;
        try {
          this.inputNode.disconnect(this.dryGain);
        } catch {
          // already gone
        }
        this.dryWired = false;
      }, RAMP_SEC * 8 * 1000);
    }
  }

  private compensationGain(): number {
    if (this.smoothedWetMs <= MEAN_SQUARE_FLOOR || this.smoothedDryMs <= MEAN_SQUARE_FLOOR) return 1;
    const deltaDb = 10 * Math.log10(this.smoothedWetMs / this.smoothedDryMs);
    const clampedDb = Math.min(MAX_COMPENSATION_DB, Math.max(-MAX_COMPENSATION_DB, deltaDb));
    return Math.pow(10, clampedDb / 20);
  }

  tick(ctx: BaseAudioContext): void {
    this.dryAnalyser.getFloatTimeDomainData(this.dryTimeData);
    this.wetAnalyser.getFloatTimeDomainData(this.wetTimeData);
    const dryMs = computeMeanSquare(this.dryTimeData);
    const wetMs = computeMeanSquare(this.wetTimeData);
    this.smoothedDryMs = SMOOTHING * this.smoothedDryMs + (1 - SMOOTHING) * dryMs;
    this.smoothedWetMs = SMOOTHING * this.smoothedWetMs + (1 - SMOOTHING) * wetMs;
    // Keep the compensation current while bypassed too - the effect keeps
    // processing in the background even though it's inaudible, so its
    // loudness (and therefore the gap being corrected for) can keep
    // drifting as the user tweaks its params with the sheet still open.
    if (this.bypassed) {
      this.dryGain.gain.setTargetAtTime(this.compensationGain(), ctx.currentTime, RAMP_SEC);
    }
  }

  /** Real, measured dB delta (positive = processed is louder) - exposed so
   * the UI can show it, not just silently correct for it. "Honesto" means
   * visible, not only inaudible. */
  getMeasuredDeltaDb(): number {
    if (this.smoothedWetMs <= MEAN_SQUARE_FLOOR || this.smoothedDryMs <= MEAN_SQUARE_FLOOR) return 0;
    return 10 * Math.log10(this.smoothedWetMs / this.smoothedDryMs);
  }

  dispose(): void {
    if (this.unwireTimer !== null) clearTimeout(this.unwireTimer);
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.dryAnalyser.disconnect();
    this.wetAnalyser.disconnect();
  }
}
