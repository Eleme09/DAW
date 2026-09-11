import { createEffectInstance, type EffectInstance, type EqBand } from "@/types/effects";
import type { VocalAnalysisResult } from "@/types/analysis";
import type { VocalStyleParams } from "@/types/vocalStyle";

/**
 * "Make Vocal Professional" — the broader Auto Vocal Engineer, built on
 * top of Phase 4's corrective logic rather than replacing it. Two layers,
 * both rule-based (no ML model backs this — see AI_FEATURES.md principle
 * 3, AI proposes/DSP executes, and this whole file *is* the DSP side):
 *
 *  1. Corrective: same measured-problem -> parameter logic as
 *     autoChain.ts's Phone Mic Enhance (noise gate, EQ cuts, de-esser),
 *     but always includes a compressor now (Phase 4 only added one when
 *     dynamics were flagged uncontrolled — Phase 9 treats baseline
 *     compression as part of "professional," not just a fix).
 *  2. Stylistic: the selected VocalStyleParams (a character preset or a
 *     genre-inspired one — src/audio-engine/analysis/vocalStylePresets.ts)
 *     layers tone tilt, presence, saturation, reverb, and delay on top.
 *     These do NOT depend on the analysis — they're a deliberate creative
 *     choice, not a correction.
 *
 * Pitch correction is NOT part of this chain on purpose: it's a separate
 * offline render (Phase 5, Pitch Studio), not an insert effect — see
 * AUDIO_ENGINE.md's "Pitch detection & correction" for why those are
 * architecturally different operations that can't be merged into one
 * EffectInstance[] list.
 */
export function buildVocalEngineerChain(analysis: VocalAnalysisResult, style: VocalStyleParams): EffectInstance[] {
  const chain: EffectInstance[] = [];

  if (analysis.noise !== "low") {
    const gate = createEffectInstance("noiseGate");
    if (gate.type === "noiseGate") {
      const margin = analysis.noise === "high" ? 8 : 5;
      gate.params.thresholdDb = clamp(analysis.metrics.noiseFloorDb + margin, -60, -20);
      gate.params.releaseMs = analysis.noise === "high" ? 200 : 150;
      gate.params.holdMs = 80;
    }
    chain.push(gate);
  }

  const eq = createEffectInstance("eq");
  if (eq.type === "eq") {
    const bands: EqBand[] = [
      { id: crypto.randomUUID(), type: "highpass", freq: 90, gainDb: 0, q: 0.707, enabled: true },
    ];
    if (analysis.lowEnd !== "low") {
      bands.push({
        id: crypto.randomUUID(),
        type: "lowshelf",
        freq: 150,
        q: 0.707,
        enabled: true,
        gainDb: analysis.lowEnd === "high" ? -6 : -3,
      });
    }
    if (analysis.mud !== "low") {
      bands.push({
        id: crypto.randomUUID(),
        type: "peaking",
        freq: 350,
        q: 1.2,
        enabled: true,
        gainDb: analysis.mud === "high" ? -5 : -2.5,
      });
    }
    if (analysis.harshness !== "low") {
      bands.push({
        id: crypto.randomUUID(),
        type: "peaking",
        freq: 3000,
        q: 1.4,
        enabled: true,
        gainDb: analysis.harshness === "high" ? -5 : -2.5,
      });
    }
    // Stylistic tilt: split across a low and high shelf so overall
    // loudness stays roughly neutral while the tonal balance shifts.
    if (style.eqTiltDb !== 0) {
      bands.push({
        id: crypto.randomUUID(),
        type: "lowshelf",
        freq: 200,
        q: 0.707,
        enabled: true,
        gainDb: -style.eqTiltDb / 2,
      });
      bands.push({
        id: crypto.randomUUID(),
        type: "highshelf",
        freq: 8000,
        q: 0.707,
        enabled: true,
        gainDb: style.eqTiltDb / 2,
      });
    }
    if (style.presenceBoostDb > 0) {
      bands.push({
        id: crypto.randomUUID(),
        type: "peaking",
        freq: 4000,
        q: 1,
        enabled: true,
        gainDb: style.presenceBoostDb,
      });
    }
    eq.params.bands = bands;
  }
  chain.push(eq);

  if (analysis.sibilance !== "low") {
    const deesser = createEffectInstance("deesser");
    if (deesser.type === "deesser") {
      deesser.params.freq = 6500;
      deesser.params.thresholdDb = analysis.sibilance === "high" ? -34 : -28;
      deesser.params.ratio = analysis.sibilance === "high" ? 6 : 4;
    }
    chain.push(deesser);
  }

  // Baseline compression is part of "professional" now, not just a fix for
  // flagged-uncontrolled dynamics — take whichever is stronger.
  const compressor = createEffectInstance("compressor");
  if (compressor.type === "compressor") {
    const correctiveRatio = analysis.dynamics === "uncontrolled" ? 3.5 : 1;
    compressor.params.ratio = Math.max(style.compressionRatio, correctiveRatio);
    compressor.params.thresholdDb = -22;
    compressor.params.attackMs = 8;
    compressor.params.releaseMs = 140;
    compressor.params.kneeDb = 6;
    compressor.params.makeupDb = 3;
  }
  chain.push(compressor);

  if (style.saturationMix > 0) {
    const saturation = createEffectInstance("saturation");
    if (saturation.type === "saturation") {
      saturation.params.driveDb = style.saturationDriveDb;
      saturation.params.tone = style.saturationTone;
      saturation.params.mix = style.saturationMix;
    }
    chain.push(saturation);
  }

  if (style.reverbMix > 0) {
    const reverb = createEffectInstance("reverb");
    if (reverb.type === "reverb") {
      reverb.params.mix = style.reverbMix;
      reverb.params.sizeType = style.reverbSize;
      reverb.params.decaySec = style.reverbSize === "hall" ? 2.2 : style.reverbSize === "plate" ? 1.4 : 0.9;
    }
    chain.push(reverb);
  }

  if (style.delayMix > 0) {
    const delay = createEffectInstance("delay");
    if (delay.type === "delay") {
      delay.params.mix = style.delayMix;
      delay.params.timeMs = 320;
      delay.params.feedback = 0.3;
      delay.params.filterFreq = 4000;
    }
    chain.push(delay);
  }

  // Safety net, not a clipping fix — same reasoning as autoChain.ts.
  const limiter = createEffectInstance("limiter");
  if (limiter.type === "limiter") {
    limiter.params.thresholdDb = -8;
    limiter.params.releaseMs = 100;
    limiter.params.ceilingDb = -0.3;
  }
  chain.push(limiter);

  return chain;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
