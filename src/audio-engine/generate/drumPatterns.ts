import { createRng } from "./rng";
import type { DrumHitEvent, GenGenre, GenMood } from "@/types/beatGen";

/**
 * Fixed, hand-picked pattern library — one base pattern per genre, on a
 * 16-step (16th-note) grid over one 4/4 bar. Deliberately small and
 * explicit rather than a generalized drum-pattern model: these are
 * genuinely idiomatic patterns for each genre, not an attempt to cover
 * every possible groove.
 */

const STEPS_PER_BAR = 16;

interface BasePattern {
  kick: number[];
  snare: number[];
  hihat: number[];
  openhat: number[];
}

const PATTERNS: Record<GenGenre, BasePattern> = {
  // Kick on 1 + syncopated hits, snare/clap on the backbeat, dense hihats
  // with an open-hat accent — the classic trap skeleton.
  trap: { kick: [0, 6, 10], snare: [4, 12], hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15], openhat: [14] },
  // Boom-bap: sparser kick, backbeat snare, straight 8th-note hihats.
  boomBap: { kick: [0, 7], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14], openhat: [] },
  // Four-on-the-floor: kick every quarter note, open hat on the off-beats, no snare.
  dance: { kick: [0, 4, 8, 12], snare: [], hihat: [2, 10], openhat: [6, 14] },
  // Half-time: kick on 1, snare only on beat 3 (not 2 and 4) for the half-time feel.
  halfTime: { kick: [0, 10], snare: [8], hihat: [0, 4, 8, 12], openhat: [] },
};

/** Extra 32nd-note hihat hits appended to the last beat of a bar — trap's signature hihat roll. */
const TRAP_ROLL_EXTRA_STEPS = [12.5, 13.5, 14.5, 15.5];

const ROLL_PROBABILITY: Record<GenMood, number> = {
  aggressive: 0.5,
  dark: 0.3,
  bright: 0.2,
  chill: 0.05,
};

function stepToBeat(barStartBeat: number, step: number): number {
  return barStartBeat + (step / STEPS_PER_BAR) * 4;
}

export function generateDrumEvents(genre: GenGenre, mood: GenMood, bars: number, seed: number): DrumHitEvent[] {
  const pattern = PATTERNS[genre];
  const rng = createRng(seed);
  const rollProbability = ROLL_PROBABILITY[mood];
  const events: DrumHitEvent[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const barStartBeat = bar * 4;
    const rollThisBar = genre === "trap" && rng() < rollProbability;

    for (const step of pattern.kick) events.push({ type: "kick", startBeat: stepToBeat(barStartBeat, step), velocity: 1 });
    for (const step of pattern.snare) events.push({ type: "snare", startBeat: stepToBeat(barStartBeat, step), velocity: 0.9 });
    for (const step of pattern.hihat) {
      events.push({ type: "hihat", startBeat: stepToBeat(barStartBeat, step), velocity: 0.7 });
    }
    for (const step of pattern.openhat) {
      events.push({ type: "openhat", startBeat: stepToBeat(barStartBeat, step), velocity: 0.75 });
    }
    if (rollThisBar) {
      for (const step of TRAP_ROLL_EXTRA_STEPS) {
        events.push({ type: "hihat", startBeat: stepToBeat(barStartBeat, step), velocity: 0.6 });
      }
    }
  }

  return events.sort((a, b) => a.startBeat - b.startBeat);
}
