"use client";

import { useProjectStore } from "@/state/projectStore";
import { GRID_RESOLUTIONS } from "@/lib/timing/grid";
import { HEADER_WIDTH, MIN_TIMELINE_SECONDS, PIXELS_PER_SECOND, RULER_HEIGHT, TRACK_HEIGHT } from "./constants";
import { Ruler } from "./Ruler";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { LoopRegion } from "./LoopRegion";

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const currentTime = useProjectStore((s) => s.currentTime);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const seek = useProjectStore((s) => s.seek);
  const addTrack = useProjectStore((s) => s.addTrack);
  const splitClipAtPlayhead = useProjectStore((s) => s.splitClipAtPlayhead);
  const duplicateClipAtPlayhead = useProjectStore((s) => s.duplicateClipAtPlayhead);
  const addPatternAtPlayhead = useProjectStore((s) => s.addPatternAtPlayhead);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const setSnapResolution = useProjectStore((s) => s.setSnapResolution);

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const canAddPattern = selectedTrack?.type === "instrument";

  const clipEnd = project.tracks.reduce(
    (max, t) => Math.max(max, ...t.clips.map((c) => c.startTime + c.duration), 0),
    0
  );
  const durationSec = Math.max(MIN_TIMELINE_SECONDS, clipEnd + 15);
  const contentWidth = durationSec * PIXELS_PER_SECOND;
  const tracksHeight = RULER_HEIGHT + project.tracks.length * TRACK_HEIGHT;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-neutral-950">
      <div className="relative flex-1 overflow-auto">
        {project.tracks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-neutral-500">No tracks yet</p>
            <p className="text-xs text-neutral-700">
              Import a sample from the Samples tab, or click + Add Track below
            </p>
          </div>
        )}
        <div className="relative" style={{ width: HEADER_WIDTH + contentWidth }}>
          <div className="sticky top-0 z-20 flex">
            <div
              className="sticky left-0 z-30 shrink-0 border-b border-r border-neutral-800 bg-neutral-950"
              style={{ width: HEADER_WIDTH, height: RULER_HEIGHT }}
            />
            <Ruler width={contentWidth} bpm={project.bpm} timeSignature={project.timeSignature} onSeek={(t) => seek(t)} />
          </div>

          <div className="absolute left-0 top-0" style={{ left: HEADER_WIDTH }}>
            <LoopRegion height={tracksHeight} />
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="flex">
              <TrackHeader track={track} selected={track.id === selectedTrackId} />
              <TrackLane track={track} width={contentWidth} selected={track.id === selectedTrackId} />
            </div>
          ))}

          <div
            className="pointer-events-none absolute top-0 z-10 w-px bg-cyan-500"
            style={{ left: HEADER_WIDTH + currentTime * PIXELS_PER_SECOND, height: tracksHeight }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 p-2">
        <button
          onClick={() => addTrack()}
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          + Add Track
        </button>
        <button
          onClick={() => addTrack(undefined, "instrument")}
          title="Add a track with a synth/sampler instrument, playable from programmed patterns"
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          + Add Instrument
        </button>
        <button
          onClick={addPatternAtPlayhead}
          disabled={!canAddPattern}
          title={
            canAddPattern
              ? "Add a one-bar pattern to the selected instrument track at the playhead"
              : "Select an instrument track first"
          }
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-30"
        >
          + Add Pattern
        </button>
        <button
          onClick={splitClipAtPlayhead}
          title="Split the selected track's clip at the playhead (shortcut: S)"
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          ✂ Split
        </button>
        <button
          onClick={duplicateClipAtPlayhead}
          title="Duplicate the selected track's clip at the playhead (shortcut: D)"
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          ⧉ Duplicate
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-400" title="Snap clips to the musical grid">
          <span className="font-medium">Snap</span>
          <select
            value={snapResolution}
            onChange={(e) => setSnapResolution(e.target.value as (typeof GRID_RESOLUTIONS)[number])}
            className="rounded bg-neutral-900 px-1.5 py-1 text-neutral-200"
          >
            {GRID_RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r === "off" ? "Off" : r}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
