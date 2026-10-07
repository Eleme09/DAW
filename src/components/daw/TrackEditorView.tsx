"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { denoiseClip } from "@/lib/audio/clipProcessing";
import { isAbortError } from "@/lib/audio/clipWorkerClient";
import { Timeline } from "./Timeline/Timeline";
import { BottomSheet } from "./BottomSheet";
import { VozPanel } from "./VozPanel/VozPanel";
import { MicIcon, CloseIcon, TuneIcon, DenoiseIcon, KnobIcon } from "./icons";
import { formatTime } from "./TransportBar";

/**
 * BandLab's Voice/Audio track editor - what the mic button opens (user's
 * recording "v1"): the selected track alone, big, with the fixed centre
 * playhead; a header with the track name, Takes and close; and the voice
 * tools under it (AutoPitch, Voice Cleaner). Recording here works the same as
 * in the main view - the new take grows in a pale tint as it comes in.
 */
export function TrackEditorView({ onTuning }: { onTuning: () => void }) {
  const track = useProjectStore((s) => s.project.tracks.find((t) => t.id === s.selectedTrackId) ?? null);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const selectTake = useProjectStore((s) => s.selectTake);
  const [takesOpen, setTakesOpen] = useState(false);
  const [chainOpen, setChainOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const cleanAbort = useRef<AbortController | null>(null);
  // leaving the editor stops a running clean-up instead of finishing it unseen
  useEffect(() => () => cleanAbort.current?.abort(), []);

  // Take groups on this track: regions recorded on top of each other.
  const takeGroups = useMemo(() => {
    if (!track) return [];
    const groups = new Map<string, typeof track.clips>();
    for (const c of track.clips) {
      if (!c.takeGroupId) continue;
      groups.set(c.takeGroupId, [...(groups.get(c.takeGroupId) ?? []), c]);
    }
    return [...groups.entries()].filter(([, clips]) => clips.length > 1);
  }, [track]);

  if (!track) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-bone-3">
        Toca una pista para abrir su editor.
      </div>
    );
  }

  async function cleanVoice() {
    if (cleaning) {
      cleanAbort.current?.abort();
      return;
    }
    if (!track) return;
    const clips = track.clips.filter((c) => !c.muted);
    if (clips.length === 0) return useProjectStore.getState().showToast("Esta pista no tiene audio todavía");
    const controller = new AbortController();
    cleanAbort.current = controller;
    setCleaning(true);
    useProjectStore.getState().showToast("Limpiando la voz…");
    try {
      // every clip is processed first and applied together: cancelling in the
      // middle leaves the track exactly as it was
      const patches: { clip: (typeof clips)[number]; patch: Awaited<ReturnType<typeof denoiseClip>> }[] = [];
      for (const clip of clips) patches.push({ clip, patch: await denoiseClip(clip, { signal: controller.signal }) });
      for (const { clip, patch } of patches) useProjectStore.getState().updateClip(clip.trackId, clip.id, patch);
      useProjectStore.getState().showToast("Éxito");
    } catch (err) {
      useProjectStore.getState().showToast(isAbortError(err) ? "Cancelado" : err instanceof Error ? err.message : "No se pudo limpiar");
    } finally {
      cleanAbort.current = null;
      setCleaning(false);
    }
  }

  const chip =
    "flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surf-2 px-3.5 text-[13px] font-medium text-bone disabled:opacity-40";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ink">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <MicIcon className="h-5 w-5 shrink-0" style={{ color: track.color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-bone">{track.name}</span>
        <button
          onClick={() => setTakesOpen(true)}
          className={`flex h-9 items-center rounded-full px-3 text-xs font-semibold ${
            takeGroups.length > 0 ? "bg-surf-3 text-bone" : "bg-surf-2 text-bone-3"
          }`}
        >
          Tomas{takeGroups.length > 0 ? ` (${takeGroups.length})` : ""}
        </button>
        <button
          onClick={() => setMobileView("timeline")}
          aria-label="Cerrar editor de pista"
          className="flex h-9 w-9 items-center justify-center rounded-full text-bone-2"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <Timeline compact focusTrackId={track.id} />
      </div>

      <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-3 py-2">
        <button onClick={onTuning} className={chip}>
          <TuneIcon className="h-4 w-4" /> Núcleo
        </button>
        <button onClick={() => void cleanVoice()} aria-label={cleaning ? "Cancelar limpieza" : "Limpiador de voz"} className={chip}>
          <DenoiseIcon className="h-4 w-4" /> {cleaning ? "Cancelar" : "Limpiador de voz"}
        </button>
        <button onClick={() => setChainOpen(true)} className={chip}>
          <KnobIcon className="h-4 w-4" /> Cadena de voz
        </button>
      </div>

      <BottomSheet open={takesOpen} onClose={() => setTakesOpen(false)} title="Tomas">
        {takeGroups.length === 0 ? (
          <p className="text-sm text-bone-2">
            Esta pista aún no tiene tomas. Activa el ciclo (barra roja de arriba) o vuelve a grabar encima de la misma parte:
            cada pasada queda guardada como una toma y aquí eliges cuál suena.
          </p>
        ) : (
          takeGroups.map(([groupId, clips]) => (
            <div key={groupId} className="space-y-1.5">
              <div className="text-xs text-bone-3">Región en {formatTime(Math.min(...clips.map((c) => c.startTime)))}</div>
              <div className="flex flex-wrap gap-1.5">
                {clips.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => selectTake(track.id, groupId, c.id)}
                    className={`h-10 rounded-full px-4 text-sm font-semibold ${c.muted ? "bg-surf-2 text-bone-2" : "bg-bone text-ink"}`}
                  >
                    Toma {i + 1}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </BottomSheet>

      <BottomSheet open={chainOpen} onClose={() => setChainOpen(false)} title="Cadena de voz">
        <VozPanel />
      </BottomSheet>
    </div>
  );
}
