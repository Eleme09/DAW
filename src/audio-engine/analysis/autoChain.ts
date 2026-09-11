import { createEffectInstance, type EffectInstance, type EqBand } from "@/types/effects";
import type { VocalAnalysisResult } from "@/types/analysis";

/**
 * Rule-based "Phone Mic Enhance" chain: analysis measurements -> concrete
 * effect parameters. Deliberately not ML/AI — a deterministic, inspectable
 * set of rules the user can see and override afterward in the Effects Rack.
 * See AI_FEATURES.md principle 3 (AI proposes, DSP executes) — this is the
 * DSP side of that split, built first since it doesn't need a model.
 *
 * Order matters: clean up noise before shaping tone, shape tone before
 * de-essing (de-esser is frequency-specific and should see the corrected
 * spectrum), control dynamics after everything else is already sitting
 * right, and always end on a safety limiter.
 */
export function buildPhoneMicEnhanceChain(analysis: VocalAnalysisResult): EffectInstance[] {
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

  const needsEq = analysis.lowEnd !== "low" || analysis.mud !== "low" || analysis.harshness !== "low";
  if (needsEq) {
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
      eq.params.bands = bands;
    }
    chain.push(eq);
  }

  if (analysis.sibilance !== "low") {
    const deesser = createEffectInstance("deesser");
    if (deesser.type === "deesser") {
      deesser.params.freq = 6500;
      deesser.params.thresholdDb = analysis.sibilance === "high" ? -34 : -28;
      deesser.params.ratio = analysis.sibilance === "high" ? 6 : 4;
    }
    chain.push(deesser);
  }

  if (analysis.dynamics === "uncontrolled") {
    const compressor = createEffectInstance("compressor");
    if (compressor.type === "compressor") {
      compressor.params.thresholdDb = -22;
      compressor.params.ratio = 3.5;
      compressor.params.attackMs = 8;
      compressor.params.releaseMs = 140;
      compressor.params.kneeDb = 6;
      compressor.params.makeupDb = 3;
    }
    chain.push(compressor);
  }

  // Always end on a gentle safety limiter — it only catches future peaks,
  // it does not (and is not presented as) a fix for already-clipped audio.
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
