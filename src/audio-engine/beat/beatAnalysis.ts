import { computeOnsetEnvelope, detectOnsets } from "./onsetDetection";
import { estimateTempo } from "./tempoDetection";
import { computeChromagram, sumChroma } from "./chromagram";
import { detectKeyFromChroma } from "../pitch/keyDetection";
import { trackBassLine } from "./bassTracking";
import { detectChordSegments } from "./chordDetection";
import { classifyDrumHits } from "./drumClassification";
import { detectSections } from "./sectionDetection";
import type { BeatAnalysisResult } from "@/types/beat";

/**
 * Ties together every piece in this directory. Runs synchronously on the
 * main thread (matches Phase 4/5's pattern) — for a short clip that's
 * instant, but a multi-minute beat can take a genuinely noticeable few
 * seconds, mostly in bass-line YIN tracking. Not offloaded to a Worker in
 * this pass; a reasonable future improvement if long beats turn out to be
 * the common case, not attempted here. Show a loading state, don't block
 * silently — see BeatAnalyzerPanel.
 *
 * What this does NOT attempt, on purpose (see AUDIO_ENGINE.md): melody
 * extraction from the full polyphonic mix (needs source separation, a
 * genuinely different and harder problem than bass tracking a filtered
 * low end), and instrument recognition (needs a trained classifier, not a
 * hand-written heuristic like the drum-hit classifier below gets away
 * with).
 */
export function analyzeBeat(channelData: Float32Array, sampleRate: number): BeatAnalysisResult {
  const durationSec = channelData.length / sampleRate;

  const onsetEnvelope = computeOnsetEnvelope(channelData, sampleRate);
  const onsets = detectOnsets(onsetEnvelope);
  const tempo = estimateTempo(onsetEnvelope);

  const chromaFrames = computeChromagram(channelData, sampleRate);
  const key = detectKeyFromChroma(sumChroma(chromaFrames));
  const chords = detectChordSegments(chromaFrames, durationSec);

  const bassLine = trackBassLine(channelData, sampleRate);
  const drumHits = classifyDrumHits(channelData, sampleRate, onsets);
  const sections = detectSections(channelData, sampleRate);

  return { tempo, key, bassLine, chords, drumHits, sections, durationSec };
}
