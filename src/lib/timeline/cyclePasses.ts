import type { LoopRegion } from "@/types/project";

export interface CyclePass {
  /** Where this pass sits on the timeline. */
  startTime: number;
  /** Where its audio starts inside the recorded file. */
  sourceOffset: number;
  duration: number;
}

/** Shorter leftovers (stopping right after the cycle wrapped) aren't a take. */
const MIN_PASS_SEC = 0.3;

/**
 * Splits one continuous recording made with the Cycle on into one region per
 * pass - BandLab's cycle recording: every lap over the cycle becomes its own
 * take stacked on the same span, and you pick which one plays. Returns null
 * when the recording didn't actually wrap (cycle off, started outside it, or
 * stopped before reaching its end), so the caller keeps the plain single-clip
 * path. `latencySec` is skipped at the start of each pass's audio so every
 * take lines up with the beat the same way a normal take does.
 */
export function splitCyclePasses(
  recordStart: number,
  recordedSec: number,
  loop: LoopRegion,
  latencySec: number
): CyclePass[] | null {
  if (!loop.enabled) return null;
  const loopLength = loop.endTime - loop.startTime;
  if (loopLength <= 0 || recordStart < loop.startTime || recordStart >= loop.endTime) return null;
  const audible = recordedSec - latencySec;
  const firstLength = loop.endTime - recordStart;
  if (audible <= firstLength) return null;

  const passes: CyclePass[] = [{ startTime: recordStart, sourceOffset: latencySec, duration: firstLength }];
  let offset = firstLength;
  while (offset < audible) {
    const duration = Math.min(loopLength, audible - offset);
    if (duration >= MIN_PASS_SEC) passes.push({ startTime: loop.startTime, sourceOffset: latencySec + offset, duration });
    offset += loopLength;
  }
  return passes;
}
