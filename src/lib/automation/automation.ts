import type { AutomationLane, AutomationPoint } from "@/types/project";

/**
 * Linear-interpolated value of a breakpoint curve at `time`. Before the
 * first point or after the last, holds that point's value flat rather than
 * extrapolating - matches how every DAW's automation lane behaves outside
 * its drawn range. Callers must guarantee `points.length > 0`.
 */
export function interpolateAutomation(points: AutomationPoint[], time: number): number {
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = b.time === a.time ? 0 : (time - a.time) / (b.time - a.time);
      return a.value + (b.value - a.value) * t;
    }
  }
  return last.value;
}

/**
 * Schedules a breakpoint curve onto a real AudioParam, anchored at
 * (fromTime -> ctxStartTime) - shared by the live engine (re-anchored on
 * every play/seek) and offline bounce (always fromTime=0). Engine-agnostic:
 * AudioParam behaves identically on a live AudioContext and an
 * OfflineAudioContext, so one implementation covers both without the two
 * ever drifting out of sync with each other.
 */
export function scheduleParamAutomation(
  lane: AutomationLane,
  param: AudioParam,
  fromTime: number,
  ctxStartTime: number,
  toParamValue: (value: number) => number
): void {
  if (!lane.enabled || lane.points.length === 0) return;
  const points = [...lane.points].sort((a, b) => a.time - b.time);
  param.cancelScheduledValues(ctxStartTime);
  param.setValueAtTime(toParamValue(interpolateAutomation(points, fromTime)), ctxStartTime);
  for (const p of points) {
    if (p.time <= fromTime) continue;
    param.linearRampToValueAtTime(toParamValue(p.value), ctxStartTime + (p.time - fromTime));
  }
}
