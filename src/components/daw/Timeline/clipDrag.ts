import { create } from "zustand";

/**
 * A region being dragged in the phone Studio (BandLab: press and hold a
 * region, then slide it anywhere - later/earlier, onto another track, or
 * below the last one for a new track). Lives outside the project store: the
 * drag is only a preview, and the project changes once, on drop
 * (placeClip), so playback isn't rescheduled on every finger move and the
 * drag is a single undo step.
 */
export interface ClipDragState {
  clipId: string;
  fromTrackId: string;
  /** Row the region would land on; === track count = a new track. */
  targetIndex: number;
}

export const useClipDrag = create<{ drag: ClipDragState | null; set: (d: ClipDragState | null) => void }>((set) => ({
  drag: null,
  set: (drag) => set({ drag }),
}));
