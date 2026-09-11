"use client";

import { useProjectStore } from "@/state/projectStore";
import { HEADER_WIDTH, MIN_TIMELINE_SECONDS, PIXELS_PER_SECOND, RULER_HEIGHT } from "./constants";
import { Ruler } from "./Ruler";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const currentTime = useProjectStore((s) => s.currentTime);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const seek = useProjectStore((s) => s.seek);
  const addTrack = useProjectStore((s) => s.addTrack);
  const splitClipAtPlayhead = useProjectStore((s) => s.splitClipAtPlayhead);

  const clipEnd = project.tracks.reduce(
    (max, t) => Math.max(max, ...t.clips.map((c) => c.startTime + c.duration), 0),
    0
  );
  const durationSec = Math.max(MIN_TIMELINE_SECONDS, clipEnd + 15);
  const contentWidth = durationSec * PIXELS_PER_SECOND;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-neutral-950">
      <div className="relative flex-1 overflow-auto">
        <div className="relative" style={{ width: HEADER_WIDTH + contentWidth }}>
          <div className="sticky top-0 z-20 flex">
            <div
              className="sticky left-0 z-30 shrink-0 border-b border-r border-neutral-800 bg-neutral-950"
              style={{ width: HEADER_WIDTH, height: RULER_HEIGHT }}
            />
            <Ruler width={contentWidth} onSeek={(t) => seek(t)} />
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="flex">
              <TrackHeader track={track} selected={track.id === selectedTrackId} />
              <TrackLane track={track} width={contentWidth} selected={track.id === selectedTrackId} />
            </div>
          ))}

          <div
            className="pointer-events-none absolute top-0 z-10 w-px bg-orange-500"
            style={{
              left: HEADER_WIDTH + currentTime * PIXELS_PER_SECOND,
              height: RULER_HEIGHT + project.tracks.length * 76,
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-800 p-2">
        <button
          onClick={() => addTrack()}
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          + Add Track
        </button>
        <button
          onClick={splitClipAtPlayhead}
          title="Split the selected track's clip at the playhead (shortcut: S)"
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          ✂ Split
        </button>
      </div>
    </div>
  );
}
