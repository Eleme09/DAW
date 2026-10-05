"use client";

import { useProjectStore } from "@/state/projectStore";

/**
 * A slim, always-there strip of the project's tracks, shown under
 * TransportBar on every mobile view except Sesión itself (which already
 * shows the real thing). Grounded in a real, sourced BandLab design
 * decision, not invented: their own blog post on the BandLab 10.0 rebuild
 * states the Timeline is now "present in every screen" - before that
 * change, switching to Mixer/Effects/etc. hid it entirely, the same gap
 * this app had (and in the desktop layout, where Sesión/Mezcla/FX are
 * already all visible together, still has no gap to close).
 *
 * This is a bounded adaptation of that principle, not a literal copy of
 * their exact layout (no reference for that exists in what's been
 * gathered) - just enough track context (name, color, armed/muted state)
 * to stay oriented without leaving Voz/Biblioteca/Mezcla/FX, with a tap
 * taking you straight to the real Timeline.
 */
export function MiniTrackStrip() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const mobileView = useProjectStore((s) => s.mobileView);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const selectTrack = useProjectStore((s) => s.selectTrack);

  if (mobileView === "timeline" || tracks.length === 0) return null;

  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-ink px-2 py-1.5 md:hidden">
      {tracks.map((track) => (
        <button
          key={track.id}
          onClick={() => {
            selectTrack(track.id);
            setMobileView("timeline");
          }}
          style={{ background: `${track.color}${track.id === selectedTrackId ? "33" : "1f"}` }}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-bone ${
            track.id === selectedTrackId ? "ring-1 ring-bone" : ""
          }`}
        >
          {track.armed && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rec" />}
          <span className={`max-w-20 truncate ${track.muted ? "text-bone-3 line-through decoration-1" : ""}`}>
            {track.name}
          </span>
        </button>
      ))}
    </div>
  );
}
