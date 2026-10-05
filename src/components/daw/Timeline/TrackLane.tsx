"use client";

import { useProjectStore } from "@/state/projectStore";
import type { Track } from "@/types/project";
import { TRACK_HEIGHT } from "./constants";
import { ClipView } from "./ClipView";
import { CompactClipView } from "./CompactClipView";
import { GridLines } from "./GridLines";

interface TrackLaneProps {
  track: Track;
  width: number;
  selected: boolean;
  /** Phone Studio: BandLab-style regions (tap selects, see CompactClipView);
   * tapping empty lane space clears the region selection. */
  compact?: boolean;
}

export function TrackLane({ track, width, selected, compact = false }: TrackLaneProps) {
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond);
  const selectClip = useProjectStore((s) => s.selectClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
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
        height: TRACK_HEIGHT,
        // Toda la fila teñida con el color de la pista (no solo un borde de
        // 3px) - así se ve de verdad el carril de BandLab, confirmado contra
        // captura real de su app: el color de pista cubre la fila entera a
        // baja opacidad, no solo acenta un borde.
        background: selected ? `${track.color}26` : `${track.color}14`,
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
          compact ? <CompactClipView key={clip.id} clip={clip} /> : <ClipView key={clip.id} clip={clip} />
        ))}
    </div>
  );
}
