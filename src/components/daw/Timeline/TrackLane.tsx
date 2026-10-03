"use client";

import { useProjectStore } from "@/state/projectStore";
import type { Track } from "@/types/project";
import { TRACK_HEIGHT } from "./constants";
import { ClipView } from "./ClipView";
import { GridLines } from "./GridLines";

interface TrackLaneProps {
  track: Track;
  width: number;
  selected: boolean;
}

export function TrackLane({ track, width, selected }: TrackLaneProps) {
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond);
  return (
    <div
      style={{ width, height: TRACK_HEIGHT }}
      className={`relative shrink-0 border-b border-line ${
        selected ? "bg-surf/60" : "bg-ink"
      }`}
    >
      <GridLines width={width} pixelsPerSecond={pixelsPerSecond} />
      {track.clips
        // Inactive takes stay in the project data (switchable from the
        // active take's picker) but don't render a second overlapping
        // block on top of the active one.
        .filter((clip) => !clip.muted)
        .map((clip) => (
          <ClipView key={clip.id} clip={clip} />
        ))}
    </div>
  );
}
