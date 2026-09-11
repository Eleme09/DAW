import type { SectionBoundary } from "@/types/beat";

/**
 * Structural boundary detection from an energy-novelty curve: find where
 * the track's loudness profile changes abruptly. This finds *when*
 * something changes and how loud the new part is *relative to the rest of
 * this track* — it does not (and cannot, from energy alone) know whether
 * that new part is a verse, chorus, drop, or bridge. `energyLevel` is
 * exactly what it says: a relative-loudness read, not a semantic section
 * label. Real structural segmentation (self-similarity matrices, or ML) is
 * a harder problem this doesn't attempt to solve — see AUDIO_ENGINE.md.
 */

const WINDOW_SEC = 2;
const HOP_SEC = 1;
const MIN_GAP_SEC = 4; // don't flag boundaries closer together than this

interface EnergyPoint {
  timeSec: number;
  rms: number;
}

function computeEnergyEnvelope(channelData: Float32Array, sampleRate: number): EnergyPoint[] {
  const windowSize = Math.round(WINDOW_SEC * sampleRate);
  const hopSize = Math.round(HOP_SEC * sampleRate);
  const envelope: EnergyPoint[] = [];

  for (let start = 0; start + windowSize <= channelData.length; start += hopSize) {
    let sum = 0;
    for (let i = 0; i < windowSize; i++) sum += channelData[start + i] ** 2;
    envelope.push({ timeSec: start / sampleRate, rms: Math.sqrt(sum / windowSize) });
  }
  return envelope;
}

export function detectSections(channelData: Float32Array, sampleRate: number, sensitivity = 1.2): SectionBoundary[] {
  const envelope = computeEnergyEnvelope(channelData, sampleRate);
  if (envelope.length === 0) return [];

  const rmsValues = envelope.map((e) => e.rms);
  const maxRms = Math.max(...rmsValues);
  const minRms = Math.min(...rmsValues);
  const range = Math.max(1e-9, maxRms - minRms);
  const levelOf = (rms: number): SectionBoundary["energyLevel"] => {
    const t = (rms - minRms) / range;
    if (t < 1 / 3) return "low";
    if (t < 2 / 3) return "medium";
    return "high";
  };

  const novelty = envelope.map((e, i) => (i === 0 ? 0 : Math.abs(e.rms - envelope[i - 1].rms)));
  const mean = novelty.reduce((s, v) => s + v, 0) / novelty.length;
  const variance = novelty.reduce((s, v) => s + (v - mean) ** 2, 0) / novelty.length;
  const threshold = mean + sensitivity * Math.sqrt(variance);

  const boundaries: SectionBoundary[] = [{ timeSec: 0, energyLevel: levelOf(envelope[0].rms) }];
  for (let i = 1; i < novelty.length; i++) {
    if (novelty[i] <= threshold) continue;
    const timeSec = envelope[i].timeSec;
    if (timeSec - boundaries[boundaries.length - 1].timeSec < MIN_GAP_SEC) continue;
    boundaries.push({ timeSec, energyLevel: levelOf(envelope[i].rms) });
  }

  return boundaries;
}
