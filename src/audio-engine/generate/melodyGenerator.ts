import type { ChordEvent, MelodyNoteEvent } from "@/types/beatGen";

/** One octave above the chord voicing, so the lead sits above the pad. */
const MELODY_OCTAVE_SHIFT = 12;
const NOTE_LENGTH_BEATS = 0.5; // 8th notes

/**
 * Deliberately simple: an up-down arpeggio over each chord's own tones
 * (root-third-fifth-third), not a melodic contour/phrase generator. This
 * is a real simplification, named as such — genuinely idiomatic for
 * arpeggiated trap leads/plucks, but not a substitute for an actual
 * melody with phrasing, motif development, or call-and-response.
 */
export function generateMelodyEvents(chords: ChordEvent[]): MelodyNoteEvent[] {
  const events: MelodyNoteEvent[] = [];

  for (const chord of chords) {
    const [root, third, fifth] = chord.notesMidi;
    const arpNotes = [root, third, fifth, third].map((m) => m + MELODY_OCTAVE_SHIFT);
    const chordEnd = chord.startBeat + chord.lengthBeats;

    let beat = chord.startBeat;
    let i = 0;
    while (beat < chordEnd) {
      const lengthBeats = Math.min(NOTE_LENGTH_BEATS, chordEnd - beat);
      events.push({ midi: arpNotes[i % arpNotes.length], startBeat: beat, lengthBeats, velocity: 0.75 });
      beat += NOTE_LENGTH_BEATS;
      i++;
    }
  }

  return events;
}
