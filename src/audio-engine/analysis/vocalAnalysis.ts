import { analyzeDynamics } from "./dynamicsAnalysis";
import { computeAveragePowerSpectrum, computeBandEnergies } from "./spectralAnalysis";
import { mixToMono } from "../audioBufferUtils";
import type { Severity, VocalAnalysisResult } from "@/types/analysis";

/**
 * Turns raw analysis numbers into the categorical read the UI shows
 * ("Noise: High", "Mud: Medium", ...). Thresholds below are heuristic —
 * calibrated by ear against a handful of phone/earbud recordings, not
 * trained on a labeled dataset. Good enough to point at real problems,
 * not a scientific instrument. See AI_FEATURES.md principle 2 (no invented
 * precision) and PROJECT_SPEC.md (don't promise to fix what isn't there).
 */

function severityFromRelativeDb(db: number, mediumAt: number, highAt: number): Severity {
  if (db >= highAt) return "high";
  if (db >= mediumAt) return "medium";
  return "low";
}

export function analyzeVocalChannel(channelData: Float32Array, sampleRate: number): VocalAnalysisResult {
  const dynamics = analyzeDynamics(channelData, sampleRate);
  const powerSpectrum = computeAveragePowerSpectrum(channelData);
  const bands = computeBandEnergies(powerSpectrum, sampleRate);
  const byName = (name: string) => bands.find((b) => b.name === name)?.relativeDb ?? 0;

  const lowEndRelativeDb = (byName("subBass") + byName("bass")) / 2;
  const mudRelativeDb = byName("lowMid");
  const harshnessRelativeDb = byName("highMid");
  const sibilanceRelativeDb = byName("sibilance");

  const limitations: string[] = [];
  if (dynamics.clippedSampleRatio > 0.001) {
    limitations.push(
      `El ${(dynamics.clippedSampleRatio * 100).toFixed(1)}% de las muestras están saturadas (clipping). Ese audio ` +
        `se perdió en esos puntos — ningún procesamiento puede recuperarlo. Vuelve a grabar con un nivel de entrada más bajo si es posible.`
    );
  } else if (dynamics.peakDb > -0.5) {
    limitations.push("Los picos están muy cerca del máximo — una ganancia de entrada más baja dejaría más margen (headroom) en la próxima toma.");
  }
  if (dynamics.noiseFloorDb > -25) {
    limitations.push(
      "El piso de ruido es bastante alto. Las herramientas actuales (Puerta de ruido) pueden silenciar los " +
        "espacios entre frases, pero no pueden quitar el ruido que está debajo de la voz misma — eso necesita " +
        "reducción espectral de ruido, todavía no está construida."
    );
  }

  return {
    noise: severityFromRelativeDb(dynamics.noiseFloorDb, -45, -35),
    lowEnd: severityFromRelativeDb(lowEndRelativeDb, 3, 6),
    mud: severityFromRelativeDb(mudRelativeDb, 3, 6),
    harshness: severityFromRelativeDb(harshnessRelativeDb, 3, 6),
    sibilance: severityFromRelativeDb(sibilanceRelativeDb, 4, 6),
    dynamics: dynamics.dynamicRangeDb > 25 ? "uncontrolled" : "controlled",
    limitations,
    metrics: {
      peakDb: dynamics.peakDb,
      rmsDb: dynamics.rmsDb,
      noiseFloorDb: dynamics.noiseFloorDb,
      dynamicRangeDb: dynamics.dynamicRangeDb,
      clippedSampleRatio: dynamics.clippedSampleRatio,
      lowEndRelativeDb,
      mudRelativeDb,
      harshnessRelativeDb,
      sibilanceRelativeDb,
    },
  };
}

/** Mono-mixes a multi-channel AudioBuffer before analysis (vocals are typically mono anyway). */
export function analyzeVocalRecording(buffer: AudioBuffer): VocalAnalysisResult {
  const channelData = mixToMono(buffer);
  return analyzeVocalChannel(channelData, buffer.sampleRate);
}
