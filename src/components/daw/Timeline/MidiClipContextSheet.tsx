"use client";

import { useProjectStore } from "@/state/projectStore";
import type { MidiClip } from "@/types/project";
import { BottomSheet } from "../BottomSheet";

interface MidiClipContextSheetProps {
  clip: MidiClip;
  onClose: () => void;
}

/** MIDI counterpart to ClipContextSheet (FASE 10E) - MidiClipView used to
 * delete a pattern on a bare `onDoubleClick`, a gesture that doesn't fire
 * reliably on touch at all and gave a destructive action zero discoverable,
 * deliberate confirmation step. This gives pattern clips the same
 * tap-to-open, real-control treatment audio clips already have. No
 * gain/fade/normalize here - a pattern clip doesn't have those, only a
 * name, its notes (edited in the piano roll), and its own lifecycle. */
export function MidiClipContextSheet({ clip, onClose }: MidiClipContextSheetProps) {
  const updateMidiClip = useProjectStore((s) => s.updateMidiClip);
  const removeMidiClip = useProjectStore((s) => s.removeMidiClip);
  const duplicateMidiClip = useProjectStore((s) => s.duplicateMidiClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const setPianoRollClipId = useProjectStore((s) => s.setPianoRollClipId);

  function handleOpenPianoRoll() {
    selectTrack(clip.trackId);
    setPianoRollClipId(clip.id);
    onClose();
  }

  function handleDuplicate() {
    duplicateMidiClip(clip.trackId, clip.id);
    onClose();
  }

  function handleDelete() {
    removeMidiClip(clip.trackId, clip.id);
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title={clip.name}>
      <div className="space-y-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-bone-3">Nombre</label>
        <input
          value={clip.name}
          onChange={(e) => updateMidiClip(clip.trackId, clip.id, { name: e.target.value })}
          className="h-11 w-full rounded bg-surf px-3 text-sm text-bone outline-none"
        />
      </div>

      <p className="text-xs text-bone-3">{clip.notes.length} notas programadas</p>

      <button
        onClick={handleOpenPianoRoll}
        className="min-h-11 w-full rounded bg-surf-2 px-2 text-sm font-medium text-bone hover:bg-surf-3"
      >
        Abrir piano roll
      </button>

      <button
        onClick={handleDuplicate}
        className="min-h-11 w-full rounded bg-surf-2 px-2 text-sm font-medium text-bone hover:bg-surf-3"
      >
        Duplicar patrón
      </button>

      <button
        onClick={handleDelete}
        className="min-h-11 w-full rounded bg-rec/20 px-2 text-sm font-semibold text-rec hover:bg-rec/30"
      >
        Eliminar patrón
      </button>
    </BottomSheet>
  );
}
