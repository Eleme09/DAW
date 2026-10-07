"use client";

import { useProjectStore } from "@/state/projectStore";
import { fxChipLabel } from "@/lib/fx/catalog";
import type { Track } from "@/types/project";
import { FxChainIcon, MicIcon } from "../icons";
import { TRACK_HEIGHT } from "./constants";

/** Width of the name column once you swipe away from the start - just the
 * track icon (+ Fx badge), like BandLab. */
export const COLLAPSED_HEADER_WIDTH = 44;

interface CompactTrackHeaderProps {
  track: Track;
  width: number;
  collapsed: boolean;
  selected: boolean;
}

/**
 * Phone Studio track header, copied from BandLab's (user's screen recording):
 * expanded at the start of the song - icon · name (2 lines) · Fx pill - and
 * collapsed to icon + Fx badge as soon as you swipe the timeline, so the
 * waveforms get the width. Tap selects the track; the Fx pill opens its
 * effects. Volume/pan/mute/solo live in Mix View, as in BandLab.
 */
export function CompactTrackHeader({ track, width, collapsed, selected }: CompactTrackHeaderProps) {
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const setEffectsRackMode = useProjectStore((s) => s.setEffectsRackMode);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const firstFx = track.inserts[0];
  const anySolo = useProjectStore((s) => s.project.tracks.some((t) => t.solo));
  // Not heard right now (muted, or another track is soloed): greyed like BandLab.
  const silent = track.muted || (anySolo && !track.solo);
  const tint = selected ? `${track.color}40` : `${track.color}1f`;

  function openFx(e: React.MouseEvent) {
    e.stopPropagation();
    selectTrack(track.id);
    setEffectsRackMode("track");
    setMobileView("effects");
  }

  return (
    <div
      onClick={() => selectTrack(track.id)}
      style={{
        width,
        height: TRACK_HEIGHT,
        backgroundColor: "var(--color-ink)",
        backgroundImage: `linear-gradient(${tint}, ${tint})`,
      }}
      className={`sticky left-0 z-10 flex shrink-0 items-center overflow-hidden border-b border-r border-line ${
        collapsed ? "flex-col justify-center gap-1" : "gap-2.5 px-3"
      } ${silent ? "grayscale *:opacity-40" : ""}`}
    >
      <span className="relative shrink-0">
        <MicIcon className="h-5 w-5" style={{ color: track.color }} />
        {track.armed && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-rec ring-2 ring-ink" title="Armada para grabar" />}
      </span>

      {collapsed ? (
        track.inserts.length > 0 && (
          <button onClick={openFx} title="Efectos" className="flex h-5 w-7 items-center justify-center rounded-full text-ink" style={{ background: track.color }}>
            <FxChainIcon className="h-3.5 w-3.5" />
          </button>
        )
      ) : (
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] font-medium leading-tight" style={{ color: track.color }}>
            {track.name}
          </div>
          <button
            onClick={openFx}
            title="Efectos de esta pista"
            className="mt-1 flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-bone"
            style={{ background: `${track.color}55` }}
          >
            <FxChainIcon className="h-3.5 w-3.5 shrink-0" />
            {firstFx ? <span className="truncate">{fxChipLabel(track)}</span> : <span className="font-semibold">Efectos</span>}
          </button>
        </div>
      )}
    </div>
  );
}
