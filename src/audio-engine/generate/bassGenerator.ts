import type { BassNoteEvent, ChordEvent, DrumHitEvent } from "@/types/beatGen";

/** Two octaves below the chord voicing — a typical 808/bass register. */
const BASS_OCTAVE_SHIFT = -24;

/**
 * Idiomatic "bass follows the kick" technique: a bass note fires on every
 * kick within a chord's span, sustained until the next kick (or the
 * chord's end). Not a melodic bassline generator — it's deliberately tied
 * to the drum pattern's rhythm, which is exactly how a lot of trap/hip-hop
 * bass programming actually works.
 */
export function generateBassEvents(chords: ChordEvent[], drums: DrumHitEvent[]): BassNoteEvent[] {
  const kicks = drums.filter((d) => d.type === "kick").sort((a, b) => a.startBeat - b.startBeat);
  const events: BassNoteEvent[] = [];

  for (const chord of chords) {
    const rootMidi = chord.notesMidi[0] + BASS_OCTAVE_SHIFT;
    const chordEnd = chord.startBeat + chord.lengthBeats;
    const kicksInChord = kicks.filter((k) => k.startBeat >= chord.startBeat && k.startBeat < chordEnd);

    if (kicksInChord.length === 0) {
      // Sparse pattern with no kick in this chord's span — hold one sustained note rather than leaving silence.
      events.push({ midi: rootMidi, startBeat: chord.startBeat, lengthBeats: chord.lengthBeats, velocity: 0.9 });
      continue;
    }

    for (let i = 0; i < kicksInChord.length; i++) {
      const kick = kicksInChord[i];
      const next = kicksInChord[i + 1];
      const noteEnd = next ? next.startBeat : chordEnd;
      events.push({
        midi: rootMidi,
        startBeat: kick.startBeat,
        lengthBeats: Math.max(0.1, noteEnd - kick.startBeat),
        velocity: kick.velocity,
      });
    }
  }

  return events;
}
