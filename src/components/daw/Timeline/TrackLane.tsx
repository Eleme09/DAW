"use client";

import type { Track } from "@/types/project";
import { PIXELS_PER_SECOND, TRACK_HEIGHT } from "./constants";
import { ClipView } from "./ClipView";
import { MidiClipView } from "./MidiClipView";

interface TrackLaneProps {
  track: Track;
  width: number;
  selected: boolean;
}

export function TrackLane({ track, width, selected }: TrackLaneProps) {
  return (
    <div
      style={{ width, height: TRACK_HEIGHT }}
      className={`relative shrink-0 border-b border-neutral-800 ${
        selected ? "bg-neutral-900/60" : "bg-neutral-950"
      }`}
    >
      {Array.from({ length: Math.ceil(width / PIXELS_PER_SECOND) }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 h-full border-l border-neutral-900"
          style={{ left: i * PIXELS_PER_SECOND }}
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
