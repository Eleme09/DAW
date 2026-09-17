"use client";

import { useProjectStore } from "@/state/projectStore";
import type { Track } from "@/types/project";
import { TRACK_HEIGHT } from "./constants";
import { ClipView } from "./ClipView";
import { MidiClipView } from "./MidiClipView";

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
      {Array.from({ length: Math.ceil(width / pixelsPerSecond) }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 h-full border-l border-surf"
          style={{ left: i * pixelsPerSecond }}
        />
      ))}
      {track.type === "instrument"
        ? track.midiClips.map((clip) => <MidiClipView key={clip.id} clip={clip} />)
        : track.clips
            // Inactive takes stay in the project data (switchable from the
            // active take's picker) but don't render a second overlapping
            // block on top of the active one.
            .filter((clip) => !clip.muted)
            .map((clip) => <ClipView key={clip.id} clip={clip} />)}
    </div>
  );
}
