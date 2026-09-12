"use client";

import { useProjectStore } from "@/state/projectStore";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { barSeconds, gridStepSeconds, snapToGrid, type GridResolution } from "@/lib/timing/grid";
import { BottomSheet } from "../BottomSheet";

const LOW_PITCH = 48; // C3
const HIGH_PITCH = 83; // B5, 3 octaves
const ROW_HEIGHT = 18;
const PX_PER_SECOND = 120;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function pitchName(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

/** Click-to-toggle note grid for a MIDI pattern, opened as a bottom sheet
 * from the timeline's MIDI clip blocks. Notes are added/removed with a tap
 * (like a step sequencer) rather than dragged - moving/resizing individual
 * notes is deferred (see PROGRESS.md) so this first pass is completely
 * reliable rather than half-covering drag physics too. */
export function PianoRoll() {
  const clipId = useProjectStore((s) => s.pianoRollClipId);
  const setClipId = useProjectStore((s) => s.setPianoRollClipId);
  const tracks = useProjectStore((s) => s.project.tracks);
  const bpm = useProjectStore((s) => s.project.bpm);
  const timeSignature = useProjectStore((s) => s.project.timeSignature);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const addNote = useProjectStore((s) => s.addNote);
  const removeNote = useProjectStore((s) => s.removeNote);
  const updateMidiClip = useProjectStore((s) => s.updateMidiClip);

  const track = tracks.find((t) => t.midiClips.some((c) => c.id === clipId));
  const clip = track?.midiClips.find((c) => c.id === clipId);
  const resolution: GridResolution = snapResolution === "off" ? "1/16" : snapResolution;
  const step = clip ? (gridStepSeconds(bpm, timeSignature, resolution) ?? 0.25) : 0.25;
  const bar = barSeconds(bpm, timeSignature);
  const beatSecondsForGrid = bar / timeSignature[0];
  const beatPxWidth = beatSecondsForGrid * PX_PER_SECOND;

  function toggleCell(pitch: number, cellIndex: number) {
    if (!track || !clip) return;
    const startTime = cellIndex * step;
    const existing = clip.notes.find((n) => n.pitch === pitch && Math.abs(n.startTime - startTime) < step / 2);
    if (existing) {
      removeNote(track.id, clip.id, existing.id);
      return;
    }
    addNote(track.id, clip.id, { pitch, startTime, duration: step, velocity: 0.85 });
    if (track.instrument) getAudioEngine().previewNote(track.id, track.instrument, pitch);
  }

  const cellCount = clip ? Math.max(1, Math.round(clip.duration / step)) : 0;
  const gridWidth = cellCount * step * PX_PER_SECOND;

  return (
    <BottomSheet
      open={Boolean(track && clip)}
      onClose={() => setClipId(null)}
      title={track && clip ? `${track.name} — ${clip.name}` : "Piano Roll"}
    >
      {track && clip && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{clip.notes.length} notes</span>
            <div className="flex items-center gap-1">
              <span>Length</span>
              <button
                onClick={() => updateMidiClip(track.id, clip.id, { duration: Math.max(bar, clip.duration - bar) })}
                className="h-6 w-6 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                title="Remove one bar"
              >
                −
              </button>
              <span className="w-16 text-center tabular-nums">{(clip.duration / bar).toFixed(2)} bars</span>
              <button
                onClick={() => updateMidiClip(track.id, clip.id, { duration: clip.duration + bar })}
                className="h-6 w-6 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                title="Add one bar"
              >
                +
              </button>
            </div>
          </div>

          <div className="max-h-[55vh] overflow-auto rounded border border-neutral-800">
            <div style={{ width: gridWidth + 40 }}>
              {Array.from({ length: HIGH_PITCH - LOW_PITCH + 1 }, (_, i) => HIGH_PITCH - i).map((pitch) => (
                <div key={pitch} className="flex border-b border-neutral-900" style={{ height: ROW_HEIGHT }}>
                  <div
                    className={`sticky left-0 z-10 flex w-10 shrink-0 items-center justify-end pr-1 font-mono text-[9px] ${
                      pitch % 12 === 0 ? "bg-neutral-800 text-neutral-300" : "bg-neutral-900 text-neutral-600"
                    }`}
                  >
                    {pitchName(pitch)}
                  </div>
                  <div
                    className="relative shrink-0"
                    style={{
                      width: gridWidth,
                      backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,0.08), rgba(255,255,255,0.08) 1px, transparent 1px, transparent ${beatPxWidth}px)`,
                    }}
                  >
                    {Array.from({ length: cellCount }, (_, i) => i).map((i) => {
                      const cellStart = i * step;
                      const note = clip.notes.find(
                        (n) => n.pitch === pitch && Math.abs(n.startTime - cellStart) < step / 2
                      );
                      return (
                        <button
                          key={i}
                          onClick={() => toggleCell(pitch, i)}
                          title={`${pitchName(pitch)} @ ${snapToGrid(cellStart, bpm, timeSignature, resolution).toFixed(2)}s`}
                          className="absolute top-0 h-full border-r border-neutral-900/60 hover:bg-white/5"
                          style={{
                            left: i * step * PX_PER_SECOND,
                            width: step * PX_PER_SECOND,
                            background: note ? track.color : undefined,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-neutral-600">Tap a cell to add a note, tap again to remove it.</p>
        </div>
      )}
    </BottomSheet>
  );
}
