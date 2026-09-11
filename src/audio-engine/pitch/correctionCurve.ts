import { frequencyToMidi, midiToFrequency, nearestScaleMidi } from "./noteUtils";
import type { PitchCorrectionSettings, PitchFrame } from "@/types/pitch";

export interface CorrectionFrame {
  timeSec: number;
  detectedFrequencyHz: number | null;
  /** null = no correction this frame (unvoiced/low-confidence). */
  targetFrequencyHz: number | null;
}

const HUMANIZE_MAX_SEMITONES = 0.15; // ~15 cents at humanizeAmount = 1
const HUMANIZE_WALK_STEP = 0.05;
const HUMANIZE_WALK_DECAY = 0.9;
const VOICED_CONFIDENCE_MIN = 0.5;

/**
 * Detected pitch -> target pitch, per frame. `retuneSpeedMs` is the time
 * constant of an exponential glide toward the snapped note — 0 is an
 * instant hard-tune snap, larger values glide more gradually (this is the
 * same knob Auto-Tune calls "retune speed"). `humanizeAmount` layers a
 * slow, smoothed random wobble on top so a hard snap doesn't read as
 * perfectly robotic (a genre choice, not always wanted — "Extreme" mode
 * sets it to 0 on purpose).
 *
 * `random` defaults to Math.random but is injectable so tests can isolate
 * the retune-speed glide behavior from humanize's randomness.
 */
export function buildCorrectionCurve(
  frames: PitchFrame[],
  settings: PitchCorrectionSettings,
  random: () => number = Math.random
): CorrectionFrame[] {
  const result: CorrectionFrame[] = [];
  let smoothedTargetMidi: number | null = null;
  let humanizeWalk = 0;
  let prevTime = frames.length > 0 ? frames[0].timeSec : 0;

  for (const frame of frames) {
    const dt = Math.max(0, frame.timeSec - prevTime);
    prevTime = frame.timeSec;

    if (frame.frequencyHz === null || frame.confidence < VOICED_CONFIDENCE_MIN) {
      result.push({ timeSec: frame.timeSec, detectedFrequencyHz: frame.frequencyHz, targetFrequencyHz: null });
      smoothedTargetMidi = null; // fresh glide next time voicing resumes
      continue;
    }

    const detectedMidi = frequencyToMidi(frame.frequencyHz);
    const snappedMidi = nearestScaleMidi(detectedMidi, settings.key, settings.scale);

    const step = (random() * 2 - 1) * HUMANIZE_WALK_STEP;
    humanizeWalk = clamp(humanizeWalk * HUMANIZE_WALK_DECAY + step, -1, 1);
    const desiredMidi = snappedMidi + humanizeWalk * HUMANIZE_MAX_SEMITONES * settings.humanizeAmount;

    if (smoothedTargetMidi === null) {
      // Start of a new voiced run: the glide begins from the pitch that was
      // actually sung, not from the target — that audible glide-in *is* what
      // "retune speed" means (think the classic slow-Auto-Tune swoop).
      smoothedTargetMidi = detectedMidi;
    }
    if (settings.retuneSpeedMs <= 0) {
      smoothedTargetMidi = desiredMidi;
    } else {
      const tau = settings.retuneSpeedMs / 1000;
      const alpha = 1 - Math.exp(-dt / tau);
      smoothedTargetMidi += (desiredMidi - smoothedTargetMidi) * alpha;
    }

    result.push({
      timeSec: frame.timeSec,
      detectedFrequencyHz: frame.frequencyHz,
      targetFrequencyHz: midiToFrequency(smoothedTargetMidi),
    });
  }

  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
