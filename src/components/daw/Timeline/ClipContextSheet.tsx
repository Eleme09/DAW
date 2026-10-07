"use client";

import { useMemo, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { computePeakDb } from "@/audio-engine/loudness";
import { MAX_TRANSPOSE_SEMITONES } from "@/audio-engine/pitch/transpose";
import { denoiseClip, transposeClip } from "@/lib/audio/clipProcessing";
import type { AudioClip } from "@/types/project";
import { FloatingPanel } from "../FloatingPanel";
import { Picker } from "../ui/Picker";
import { ParamSlider } from "../EffectsRack/ParamSlider";

const MIN_GAIN_DB = -24;
const MAX_GAIN_DB = 12;
const NORMALIZE_HEADROOM_DB = -0.5; // leaves a hair of room, doesn't ride the ceiling exactly

interface ClipContextSheetProps {
  clip: AudioClip;
  onClose: () => void;
}

/**
 * Brief's FASE 10E, "tocar el clip abre acciones y ajustes sin cambiar de
 * pestaña" - everything ClipView.tsx only exposed as a hover-revealed drag
 * handle (fade corners, the thin gain line) is real but undiscoverable on
 * a touchscreen, since `group-hover` never fires without a mouse. This is
 * the always-reachable, always-visible equivalent: tap the clip, get every
 * action as a real control, no gesture required to even find it.
 */
export function ClipContextSheet({ clip, onClose }: ClipContextSheetProps) {
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const selectTake = useProjectStore((s) => s.selectTake);
  const currentTime = useProjectStore((s) => s.currentTime);
  const MIN_CLIP_SEC = 0.05;
  const splitClipAtPlayhead = useProjectStore((s) => s.splitClipAtPlayhead);
  const trackClips = useProjectStore((s) => s.project.tracks.find((t) => t.id === clip.trackId)?.clips);
  // Select the raw tracks array (stable reference between unrelated
  // re-renders) and filter it in useMemo, not inside the selector itself -
  // `.filter()` inside a Zustand selector allocates a new array on every
  // single store read, which useSyncExternalStore sees as "always changed"
  // and re-renders forever (crashed with "Maximum update depth exceeded",
  // confirmed via Playwright: the sheet never actually displayed its
  // content, it threw before paint).
  const tracks = useProjectStore((s) => s.project.tracks);
  const otherTracks = useMemo(() => tracks.filter((t) => t.id !== clip.trackId), [tracks, clip.trackId]);
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);

  const [semitones, setSemitones] = useState(0);
  const [transposing, setTransposing] = useState(false);
  const [denoising, setDenoising] = useState(false);

  const clipEnd = clip.startTime + clip.duration;
  const takes = clip.takeGroupId
    ? (trackClips?.filter(
        (c) => c.takeGroupId === clip.takeGroupId && c.startTime < clipEnd && clip.startTime < c.startTime + c.duration
      ) ?? [])
    : [];

  const canSplitHere = currentTime > clip.startTime + MIN_CLIP_SEC && currentTime < clipEnd - MIN_CLIP_SEC;

  function normalize() {
    const buffer = getAudioEngine().getBuffer(clip.sampleId);
    if (!buffer) return;
    const startSample = Math.round(clip.sourceOffset * buffer.sampleRate);
    const endSample = Math.min(buffer.length, Math.round((clip.sourceOffset + clip.duration) * buffer.sampleRate));
    if (endSample <= startSample) return;

    let peakDb = -Infinity;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const slice = buffer.getChannelData(ch).subarray(startSample, endSample);
      peakDb = Math.max(peakDb, computePeakDb(slice));
    }
    if (!Number.isFinite(peakDb)) return; // silent region - nothing to normalize against

    const gainDb = Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, NORMALIZE_HEADROOM_DB - peakDb));
    updateClip(clip.trackId, clip.id, { gainDb });
  }

  function handleDelete() {
    removeClip(clip.trackId, clip.id);
    onClose();
  }

  function handleDuplicate() {
    duplicateClip(clip.trackId, clip.id);
    onClose();
  }

  function handleSplit() {
    splitClipAtPlayhead();
    onClose();
  }

  async function handleTranspose() {
    if (semitones === 0) return;
    setTransposing(true);
    try {
      updateClip(clip.trackId, clip.id, await transposeClip(clip, semitones));
    } finally {
      setTransposing(false);
    }
  }

  async function handleDenoise() {
    setDenoising(true);
    try {
      updateClip(clip.trackId, clip.id, await denoiseClip(clip));
    } finally {
      setDenoising(false);
    }
  }

  return (
    <FloatingPanel open onClose={onClose} title={clip.name}>
      <div className="space-y-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-bone-3">Nombre</label>
        <input
          value={clip.name}
          onChange={(e) => updateClip(clip.trackId, clip.id, { name: e.target.value })}
          className="h-11 w-full rounded bg-surf px-3 text-sm text-bone outline-none"
        />
      </div>

      {takes.length > 1 && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-bone-3">Toma</label>
          <Picker
            value={clip.id}
            options={takes.map((t, i) => ({ value: t.id, label: `Toma ${i + 1}/${takes.length}` }))}
            title="Elige la toma que suena en este fragmento"
            onChange={(id) => {
              selectTake(clip.trackId, clip.takeGroupId!, id);
              onClose();
            }}
          />
        </div>
      )}

      <div className="space-y-2">
        <ParamSlider
          label="Ganancia"
          value={clip.gainDb}
          min={MIN_GAIN_DB}
          max={MAX_GAIN_DB}
          step={0.1}
          onChange={(v) => updateClip(clip.trackId, clip.id, { gainDb: v })}
        />
        <ParamSlider
          label="Fundido de entrada"
          value={clip.fadeInSec}
          min={0}
          max={Math.max(0.01, clip.duration / 2)}
          step={0.01}
          onChange={(v) => updateClip(clip.trackId, clip.id, { fadeInSec: v })}
        />
        <ParamSlider
          label="Fundido de salida"
          value={clip.fadeOutSec}
          min={0}
          max={Math.max(0.01, clip.duration / 2)}
          step={0.01}
          onChange={(v) => updateClip(clip.trackId, clip.id, { fadeOutSec: v })}
        />
      </div>

      <button
        onClick={normalize}
        className="min-h-11 w-full rounded-full bg-surf-2 px-2 text-sm font-medium text-bone hover:bg-surf-3"
        title="Sube la ganancia del clip hasta que su pico real llegue a -0.5dB, calculado del audio real de este fragmento"
      >
        Normalizar
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleDuplicate}
          className="min-h-11 rounded-full bg-surf-2 px-2 text-sm font-medium text-bone hover:bg-surf-3"
        >
          Duplicar
        </button>
        <button
          onClick={handleSplit}
          disabled={!canSplitHere}
          title={canSplitHere ? "Divide este clip en la posición del cabezal" : "Mueve el cabezal dentro de este clip para dividirlo"}
          className="min-h-11 rounded-full bg-surf-2 px-2 text-sm font-medium text-bone hover:bg-surf-3 disabled:opacity-30"
        >
          Dividir aquí
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wide text-bone-3">
          Transponer ({semitones > 0 ? "+" : ""}
          {semitones} semitonos)
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSemitones((s) => Math.max(-MAX_TRANSPOSE_SEMITONES, s - 1))}
            disabled={semitones <= -MAX_TRANSPOSE_SEMITONES}
            className="h-11 w-11 shrink-0 rounded-full bg-surf-2 text-lg font-bold text-bone disabled:opacity-30"
          >
            −
          </button>
          <div className="flex h-11 flex-1 items-center justify-center rounded-full bg-surf text-sm text-bone">
            {semitones > 0 ? "+" : ""}
            {semitones}
          </div>
          <button
            onClick={() => setSemitones((s) => Math.min(MAX_TRANSPOSE_SEMITONES, s + 1))}
            disabled={semitones >= MAX_TRANSPOSE_SEMITONES}
            className="h-11 w-11 shrink-0 rounded-full bg-surf-2 text-lg font-bold text-bone disabled:opacity-30"
          >
            +
          </button>
        </div>
        <button
          onClick={handleTranspose}
          disabled={semitones === 0 || transposing}
          title="Transpone el audio real de este clip - no un efecto en vivo, renderiza una versión nueva"
          className="min-h-11 w-full rounded-full bg-surf-2 px-2 text-sm font-medium text-bone hover:bg-surf-3 disabled:opacity-40"
        >
          {transposing ? "Transponiendo…" : "Aplicar transposición"}
        </button>
      </div>

      <button
        onClick={handleDenoise}
        disabled={denoising}
        title="Sustracción espectral clásica sobre el audio real de este clip - renderiza una versión nueva, no toca la toma original"
        className="min-h-11 w-full rounded-full bg-surf-2 px-2 text-sm font-medium text-bone hover:bg-surf-3 disabled:opacity-40"
      >
        {denoising ? "Quitando ruido…" : "Quitar ruido"}
      </button>

      {otherTracks.length > 0 && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-bone-3">Mover a otra pista</label>
          <Picker
            value=""
            placeholder="Elige la pista destino"
            options={otherTracks.map((t) => ({ value: t.id, label: t.name }))}
            title="Mover este clip a otra pista"
            onChange={(targetTrackId) => {
              moveClipToTrack(clip.trackId, clip.id, targetTrackId);
              onClose();
            }}
          />
        </div>
      )}

      <button
        onClick={handleDelete}
        className="min-h-11 w-full rounded-full bg-rec/20 px-2 text-sm font-semibold text-rec hover:bg-rec/30"
      >
        Eliminar clip
      </button>
    </FloatingPanel>
  );
}
