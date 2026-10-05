"use client";

import { useProjectStore } from "@/state/projectStore";
import type { Track } from "@/types/project";
import { TRACK_HEIGHT } from "./constants";
import { ClipView } from "./ClipView";
import { CompactClipView } from "./CompactClipView";
import { GridLines } from "./GridLines";
import { LiveTake } from "./LiveTake";

interface TrackLaneProps {
  track: Track;
  width: number;
  selected: boolean;
  /** Phone Studio: BandLab-style regions (tap selects, see CompactClipView);
   * tapping empty lane space clears the region selection. */
  compact?: boolean;
  height?: number;
}

/** The row tint shared by the lane and its lead-in (see TrackLaneLead). */
function laneBackground(track: Track, selected: boolean, audible: boolean, compact: boolean): string {
  return audible || !compact ? (selected ? `${track.color}26` : `${track.color}14`) : "#ffffff08";
}

/** The stretch of the row between the track header and time 0 (the lane
 * itself starts at time 0): same tint as the lane, so the strip is unbroken. */
export function TrackLaneLead({ track, width, selected, compact = false, height = TRACK_HEIGHT }: TrackLaneProps) {
  const anySolo = useProjectStore((s) => s.project.tracks.some((t) => t.solo));
  const audible = !track.muted && (!anySolo || track.solo);
  if (width <= 0) return null;
  return (
    <div
      aria-hidden
      style={{ width, height, background: laneBackground(track, selected, audible, compact) }}
      className="shrink-0 border-b border-line"
    />
  );
}

export function TrackLane({ track, width, selected, compact = false, height = TRACK_HEIGHT }: TrackLaneProps) {
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond);
  const selectClip = useProjectStore((s) => s.selectClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const anySolo = useProjectStore((s) => s.project.tracks.some((t) => t.solo));
  const recordingHere = useProjectStore((s) => s.isRecording && track.armed);
  // What you'd actually hear from this track right now.
  const audible = !track.muted && (!anySolo || track.solo);
  return (
    <div
      onClick={
        compact
          ? () => {
              selectClip(null);
              selectTrack(track.id);
            }
          : undefined
      }
      style={{
        width,
        height,
        // Toda la fila teñida con el color de la pista (no solo un borde de
        // 3px) - así se ve de verdad el carril de BandLab, confirmado contra
        // captura real de su app: el color de pista cubre la fila entera a
        // baja opacidad, no solo acenta un borde.
        background: laneBackground(track, selected, audible, compact),
      }}
      className="relative shrink-0 border-b border-line"
    >
      <GridLines width={width} pixelsPerSecond={pixelsPerSecond} />
      {track.clips
        // Inactive takes stay in the project data (switchable from the
        // active take's picker) but don't render a second overlapping
        // block on top of the active one.
        .filter((clip) => !clip.muted)
        .map((clip) => (
          compact ? (
            <CompactClipView key={clip.id} clip={clip} laneHeight={height} audible={audible} />
          ) : (
            <ClipView key={clip.id} clip={clip} />
          )
        ))}
      {compact && recordingHere && <LiveTake color={track.color} height={height - 8} />}
    </div>
  );
}
