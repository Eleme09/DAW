import type { AudioClip } from "@/types/project";

/**
 * Every clip in `clips` that shares `clip`'s take group AND still overlaps
 * its time range - once a take group has been split/comped independently
 * (see projectStore's selectTake/splitClipAtPlayhead), a same-group clip
 * living in a different, non-overlapping window is a different comp
 * decision, not an alternate take for this fragment. Shared by ClipView's
 * take picker and VozPanel's "Toma N de M" header so the two never drift
 * out of sync on what counts as "a take of this one".
 */
export function getOverlappingTakes(clips: AudioClip[], clip: AudioClip): AudioClip[] {
  if (!clip.takeGroupId) return [];
  const clipEnd = clip.startTime + clip.duration;
  return clips.filter(
    (c) => c.takeGroupId === clip.takeGroupId && c.startTime < clipEnd && clip.startTime < c.startTime + c.duration
  );
}
