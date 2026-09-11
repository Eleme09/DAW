import type { BassNote, ChordSegment, DrumHit } from "@/types/beat";
import type { BassNoteEvent, ChordEvent, DrumHitEvent } from "@/types/beatGen";

/**
 * Phase 12 (Beat Reconstruction): maps Phase 6's *detected* beat analysis
 * into the same event shapes Phase 11's generator produces, so the exact
 * same synthesis code (synthesizeBeat.ts's synthDrums/synthBass/
 * synthChords) can render it. This is the inverse of generation — real
 * detected content, not a fresh rule-based sketch — so every mapping here
 * carries the detection's own confidence through as velocity rather than
 * inventing certainty, and stays deliberately narrow: only what Phase 6
 * can actually detect gets reconstructed. No melody reconstruction, for
 * the same reason Phase 6 never attempted melody extraction from a full
 * mix (see AUDIO_ENGINE.md "Beat analysis" — it needs source separation,
 * a substantially harder problem this project doesn't attempt).
 */

/** A null-pitch gap longer than this ends the current bass note rather than being treated as a brief tracking dropout. */
const BASS_NOTE_GAP_SEC = 0.15;
/** Pitch drift (in semitones) still counted as "the same held note" rather than a new one. */
const BASS_SEMITONE_TOLERANCE = 0.7;
const MIN_EVENT_LENGTH_SEC = 0.05;

function secToBeat(sec: number, bpm: number): number {
  return sec * (bpm / 60);
}

function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function isReconstructableHit(hit: DrumHit): hit is DrumHit & { type: "kick" | "snare" | "hihat" } {
  return hit.type !== "other";
}

/** Drum hits map almost directly — detection confidence becomes synthesis velocity, floored so a low-confidence hit is quieter, not silent. */
export function reconstructDrumEvents(hits: DrumHit[], bpm: number): DrumHitEvent[] {
  return hits.filter(isReconstructableHit).map((hit) => ({
    type: hit.type,
    startBeat: secToBeat(hit.timeSec, bpm),
    velocity: Math.max(0.3, hit.confidence),
  }));
}

interface OpenNote {
  startSec: number;
  lastVoicedSec: number;
  midi: number;
}

/**
 * The detected bass line is a continuous per-frame pitch track (one entry
 * per analysis hop, `frequencyHz: null` where unvoiced), not discrete
 * notes — this groups consecutive frames holding roughly the same pitch
 * into a single note, the same "voiced run" idea Phase 5's pitch
 * correction pipeline uses for vocals.
 */
export function reconstructBassEvents(bassLine: BassNote[], bpm: number): BassNoteEvent[] {
  if (bassLine.length === 0) return [];
  const sorted = [...bassLine].sort((a, b) => a.timeSec - b.timeSec);
  const events: BassNoteEvent[] = [];
  let current: OpenNote | null = null;

  const flush = (endSec: number) => {
    if (!current) return;
    events.push({
      midi: Math.round(current.midi),
      startBeat: secToBeat(current.startSec, bpm),
      lengthBeats: secToBeat(Math.max(MIN_EVENT_LENGTH_SEC, endSec - current.startSec), bpm),
      velocity: 0.85,
    });
    current = null;
  };

  for (const note of sorted) {
    if (note.frequencyHz === null) {
      if (current && note.timeSec - current.lastVoicedSec > BASS_NOTE_GAP_SEC) flush(current.lastVoicedSec);
      continue;
    }
    const midi = frequencyToMidi(note.frequencyHz);
    if (!current) {
      current = { startSec: note.timeSec, lastVoicedSec: note.timeSec, midi };
    } else if (Math.abs(midi - current.midi) <= BASS_SEMITONE_TOLERANCE) {
      current.lastVoicedSec = note.timeSec;
    } else {
      flush(note.timeSec);
      current = { startSec: note.timeSec, lastVoicedSec: note.timeSec, midi };
    }
  }
  if (current) flush(current.lastVoicedSec + MIN_EVENT_LENGTH_SEC);

  return events;
}

/** ChordSegment already carries root + quality directly (Phase 6's chord template matcher only distinguishes major/minor) — a direct triad build, no scale-degree lookup needed. */
export function reconstructChordEvents(chords: ChordSegment[], bpm: number, octaveMidi = 48): ChordEvent[] {
  return chords.map((c) => {
    const thirdInterval = c.quality === "major" ? 4 : 3;
    const notesMidi: ChordEvent["notesMidi"] = [
      octaveMidi + c.root,
      octaveMidi + c.root + thirdInterval,
      octaveMidi + c.root + 7,
    ];
    return {
      notesMidi,
      quality: c.quality,
      startBeat: secToBeat(c.startSec, bpm),
      lengthBeats: secToBeat(Math.max(MIN_EVENT_LENGTH_SEC, c.endSec - c.startSec), bpm),
    };
  });
}
