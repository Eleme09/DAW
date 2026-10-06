"use client";

import { useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { IMPORT_ACCEPT, importAudioFile } from "@/lib/audio/importFile";
import type { AudioClip } from "@/types/project";
import { BottomSheet } from "./BottomSheet";
import { MicIcon, UploadFileIcon, FolderIcon } from "./icons";

interface AddTrackSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * BandLab's "Add Track" / "New Track" pop-up (BANDLAB_REFERENCE.md §4, §9):
 * one place to start a voice track, import a file (audio or video - the
 * video's audio is used) or bring in something already saved. This app only
 * keeps the three entries that fit its scope - no drum machine, sampler or
 * looper (the user ruled out beat-making explicitly).
 */
export function AddTrackSheet({ open, onClose }: AddTrackSheetProps) {
  const trackCount = useProjectStore((s) => s.project.tracks.length);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const armTrack = useProjectStore((s) => s.armTrack);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addVoiceTrack() {
    const track = addTrack(`Voz ${trackCount + 1}`);
    if (!track.armed) armTrack(track.id);
    selectTrack(track.id);
    onClose();
  }

  async function importFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImporting(true);
    setError(null);
    const failed: string[] = [];
    // the first beat of a project sets its tempo and key (once per
    // project; the store checks it really is a beat)
    for (const file of Array.from(files)) {
      try {
        const asset = await importAudioFile(file);
        const track = addTrack(file.name.replace(/\.[^/.]+$/, ""));
        const clip: AudioClip = {
          id: crypto.randomUUID(),
          trackId: track.id,
          sampleId: asset.id,
          name: asset.name,
          startTime: 0,
          duration: asset.durationSec,
          sourceOffset: 0,
          gainDb: 0,
          fadeInSec: 0,
          fadeOutSec: 0,
          color: track.color,
        };
        addClip(clip);
        selectTrack(track.id);
        void useProjectStore.getState().analyzeFirstBeat(asset.id, asset.name);
      } catch {
        failed.push(file.name);
      }
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (failed.length > 0) {
      setError(`No se pudo leer el audio de: ${failed.join(", ")}. Prueba con MP3, WAV, M4A o un video MP4/MOV.`);
    } else {
      onClose();
    }
  }

  const option = "flex min-h-16 w-full items-center gap-4 rounded-2xl bg-surf-2 px-4 text-left hover:bg-surf-3";

  return (
    <BottomSheet open={open} onClose={onClose} title="Nueva pista">
      <button onClick={addVoiceTrack} className={option}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rec text-bone">
          <MicIcon className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-bone">Voz / Audio</span>
          <span className="block text-xs text-bone-3">Pista lista para grabar con el micrófono</span>
        </span>
      </button>

      <button onClick={() => fileInputRef.current?.click()} disabled={importing} className={`${option} disabled:opacity-50`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surf-3 text-bone">
          <UploadFileIcon className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-bone">{importing ? "Importando…" : "Importar archivo"}</span>
          <span className="block text-xs text-bone-3">Tu beat o cualquier audio. También video: se usa su audio</span>
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void importFiles(e.target.files)}
      />

      <button
        onClick={() => {
          onClose();
          setMobileView("browser");
        }}
        className={option}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surf-3 text-bone">
          <FolderIcon className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-bone">Mis audios</span>
          <span className="block text-xs text-bone-3">Lo que ya grabaste o importaste (también audio de videos)</span>
        </span>
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </BottomSheet>
  );
}
