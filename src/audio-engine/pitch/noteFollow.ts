import { midiToFrequency } from "./noteUtils";
import { psolaShift } from "./psola";
import type { CorrectionFrame } from "./correctionCurve";
import { trackPitch } from "./pitchDetection";
import type { PitchFrame } from "@/types/pitch";
import type { Note } from "@/types/project";

/**
 * Brief mode 10, "Control por notas": correction targets come from notes
 * written in a piano-roll pattern instead of the nearest tone of a
 * key/scale - the same offline PSOLA render as every other mode here,
 * just with a different source for `targetFrequencyHz` per frame.
 *
 * `notes` are clip-local (Note.startTime is relative to its MidiClip's own
 * start, per types/project.ts) - the caller is asking "correct this vocal
 * take as if it started at the same instant as this MIDI pattern", the
 * same alignment convention the rest of this project uses for a take's
 * own buffer (always analyzed/rendered from its own t=0, never against
 * absolute timeline position).
 *
 * Where no note is active at a frame's time (a gap in the piano-roll
 * pattern, or past its last note), the frame is left uncorrected
 * (`targetFrequencyHz: null`) rather than holding the previous note or
 * guessing - an editorial silence in the reference melody means "no
 * correction here," not "assume the singer should still be on the last
 * written note."
 */
const VOICED_CONFIDENCE_MIN = 0.5;

export function buildNoteFollowCurve(frames: PitchFrame[], notes: Note[]): CorrectionFrame[] {
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

  function activeNote(timeSec: number): Note | null {
    // Linear scan is fine here (piano-roll patterns are small; this runs
    // once per pitch-analysis frame, not per audio sample) - no need for
    // the binary search psola.ts uses on its much longer correction curve.
    for (const note of sorted) {
      if (timeSec >= note.startTime && timeSec < note.startTime + note.duration) return note;
    }
    return null;
  }

  return frames.map((frame) => {
    if (frame.frequencyHz === null || frame.confidence < VOICED_CONFIDENCE_MIN) {
      return { timeSec: frame.timeSec, detectedFrequencyHz: frame.frequencyHz, targetFrequencyHz: null };
    }
    const note = activeNote(frame.timeSec);
    return {
      timeSec: frame.timeSec,
      detectedFrequencyHz: frame.frequencyHz,
      targetFrequencyHz: note ? midiToFrequency(note.pitch) : null,
    };
  });
}

export function noteFollowChannel(channelData: Float32Array, sampleRate: number, notes: Note[], frames?: PitchFrame[]): Float32Array {
  const pitchFrames = frames ?? trackPitch(channelData, sampleRate);
  const curve = buildNoteFollowCurve(pitchFrames, notes);
  return psolaShift(channelData, sampleRate, curve);
}

export function noteFollowBuffer(channels: Float32Array[], sampleRate: number, notes: Note[]): Float32Array[] {
  return channels.map((channel) => noteFollowChannel(channel, sampleRate, notes));
}
