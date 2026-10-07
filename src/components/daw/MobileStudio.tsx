"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { isTrackMonitoredLive } from "@/audio-engine/monitoring";
import { Timeline } from "./Timeline/Timeline";
import { MobileMixView } from "./Mixer/MobileMixView";
import { FxPanel } from "./Fx/FxPanel";
import { BrowserPanel } from "./BrowserPanel";
import { BeatNotice } from "./BeatNotice";
import { TrackEditorView } from "./TrackEditorView";
import { AutomationEditor } from "./Automation/AutomationEditor";
import { ClipEditPanel } from "./ClipEditPanel";
import { AddTrackSheet } from "./AddTrackSheet";
import { StudioSettingsPage } from "./StudioSettingsPage";
import { LyricsPage } from "./LyricsPage";
import { AutoPitchPanel } from "./AutoPitch/AutoPitchPanel";
import { NucleoGlyph } from "./AutoPitch/NucleoGlyph";
import { MasteringPanel } from "./Mixer/MasteringPanel";
import { RULER_HEIGHT } from "./Timeline/constants";
import { useReturnToStart } from "./TransportBar";
import { MONITOR_NEXT } from "./monitorLabels";
import {
  BackIcon,
  CloseIcon,
  FeatherIcon,
  HexSettingsIcon,
  MixIcon,
  UndoIcon,
  RedoIcon,
  RewindIcon,
  PlayIcon,
  PauseIcon,
  MetronomeIcon,
  MicIcon,
  WaveformIcon,
  CloudUploadIcon,
  RecordIcon,
  HeadphonesIcon,
} from "./icons";

/**
 * The phone Studio, rebuilt on BandLab's real structure (BANDLAB_REFERENCE.md
 * §1-2): ONE screen where the timeline is always present. Nothing replaces
 * it - the selected track's Voz/Fx panel opens underneath it, Mix View and
 * the sample library open over it with a close button, settings live behind
 * the gear. The old five-tab bottom bar (Voz/Biblioteca/Sesión/Mezcla/FX)
 * is gone on purpose: it hid the timeline every time you switched.
 *
 * `mobileView` stays the routing state so every existing "jump to effects /
 * mixer / library" caller elsewhere in the app keeps working unchanged.
 */
export function MobileStudio() {
  const projectName = useProjectStore((s) => s.project.name);
  const tracks = useProjectStore((s) => s.project.tracks);
  const metronomeEnabled = useProjectStore((s) => s.project.metronomeEnabled);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const isRecording = useProjectStore((s) => s.isRecording);
  const isCountingIn = useProjectStore((s) => s.isCountingIn);
  const countInBeats = useProjectStore((s) => s.countInBeats);
  const recordingError = useProjectStore((s) => s.recordingError);
  const mobileView = useProjectStore((s) => s.mobileView);
  const clipEditMode = useProjectStore((s) => s.clipEditMode);
  const toast = useProjectStore((s) => s.toast);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const play = useProjectStore((s) => s.play);
  const pause = useProjectStore((s) => s.pause);
  const startRecording = useProjectStore((s) => s.startRecording);
  const stopRecording = useProjectStore((s) => s.stopRecording);
  const cancelRecording = useProjectStore((s) => s.cancelRecording);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const toggleMetronome = useProjectStore((s) => s.toggleMetronome);
  const persist = useProjectStore((s) => s.persist);
  const closeProject = useProjectStore((s) => s.closeProject);
  const armTrack = useProjectStore((s) => s.armTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const setAutoPitch = useProjectStore((s) => s.setAutoPitch);
  const setEffectsRackMode = useProjectStore((s) => s.setEffectsRackMode);
  const returnToStart = useReturnToStart();

  // A tap anywhere outside the selected region and its tools (action bar, ⋯
  // menu, the Transponer/Ganancia/... panel) dismisses them - before, the bar
  // stayed up for the rest of the session. Capture phase, so it also fires
  // when the tap lands on something that handles its own pointer events.
  useEffect(() => {
    function dismissOnOutsideTap(e: PointerEvent) {
      const s = useProjectStore.getState();
      if (!s.selectedClip && !s.clipEditMode) return;
      if ((e.target as Element | null)?.closest?.("[data-keep-region]")) return;
      s.selectClip(null);
    }
    window.addEventListener("pointerdown", dismissOnOutsideTap, true);
    return () => window.removeEventListener("pointerdown", dismissOnOutsideTap, true);
  }, []);

  const [addTrackOpen, setAddTrackOpen] = useState(false);
  // BandLab's three top tabs: Studio (waveform), lyrics/notes (quill), settings.
  const [tab, setTab] = useState<"studio" | "lyrics" | "settings">("studio");
  const [savedFlash, setSavedFlash] = useState(false);

  // The track row (mic, +Fx, AutoPitch, arm, monitor) belongs to the SELECTED
  // TRACK, not to a selected region. The store keeps a track selected whenever
  // the project has any (see defaultTrackId), so the row is never greyed out.
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;
  const panelOpen = mobileView === "effects";
  const overlay = mobileView === "mixer" || mobileView === "browser" ? mobileView : null;
  const busy = isRecording || isCountingIn;
  const monitoringLive = selectedTrack
    ? isTrackMonitoredLive(selectedTrack.armed, selectedTrack.monitorMode, isPlaying, isRecording)
    : false;

  function togglePanel(view: "voz" | "effects") {
    if (view === "effects") setEffectsRackMode("track");
    setMobileView(mobileView === view ? "timeline" : view);
  }

  /** AutoPitch pill: closed -> opens the panel (first time on a track it
   * starts with Classic on, like BandLab); open -> turns AutoPitch on/off. */
  function autoPitchPill() {
    if (!selectedTrack) return;
    if (mobileView !== "autopitch") {
      if (!selectedTrack.autoPitch) setAutoPitch(selectedTrack.id, {});
      setMobileView("autopitch");
    } else {
      setAutoPitch(selectedTrack.id, { enabled: !selectedTrack.autoPitch?.enabled });
    }
  }

  /** The track editor's tuning button: the same AutoPitch panel as the pill. */
  function openTuning() {
    if (!selectedTrack) return;
    if (!selectedTrack.autoPitch) setAutoPitch(selectedTrack.id, {});
    setMobileView("autopitch");
  }

  async function saveNow() {
    await persist();
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }

  async function exitToLibrary() {
    await persist();
    closeProject();
  }

  const seg = (active: boolean) =>
    `flex h-9 items-center gap-1.5 rounded-full px-3 text-bone disabled:opacity-30 ${active ? "bg-bone !text-ink" : ""}`;
  const roundBtn = "flex h-11 w-11 items-center justify-center rounded-full text-bone-2 disabled:opacity-30";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink text-bone" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Barra superior como BandLab: salir · [Estudio | Ajustes] · guardar */}
      <div className="flex h-14 shrink-0 items-center justify-between px-1.5">
        <button onClick={() => void exitToLibrary()} disabled={busy} aria-label="Salir a mis proyectos" title="Guardar y salir a mis proyectos" className={roundBtn}>
          <BackIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center rounded-full bg-surf-2 p-1">
          {(
            [
              ["studio", WaveformIcon, "Estudio"],
              ["lyrics", FeatherIcon, "Letra y notas"],
              ["settings", HexSettingsIcon, "Ajustes"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-label={label}
              aria-pressed={tab === id}
              title={id === "studio" ? projectName : label}
              className={`flex h-9 w-14 items-center justify-center rounded-full ${tab === id ? "bg-bone text-ink" : "text-bone-2"}`}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
        <button onClick={() => void saveNow()} disabled={busy} aria-label="Guardar" title="Guardar proyecto" className={`${roundBtn} relative`}>
          <CloudUploadIcon className="h-6 w-6" />
          {savedFlash && <span className="absolute -bottom-1 text-[9px] font-semibold text-live">Guardado</span>}
        </button>
      </div>

      {tab === "settings" && <StudioSettingsPage />}

      {tab === "lyrics" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0" style={{ height: RULER_HEIGHT + 8 }}>
            <Timeline compact rulerOnly />
          </div>
          <LyricsPage />
        </div>
      )}

      {/* Studio: la línea de tiempo siempre está; el panel de pista abre debajo, Mezcla/Muestras encima */}
      <div className={`relative min-h-0 flex-1 flex-col ${tab === "studio" ? "flex" : "hidden"}`}>
        {mobileView === "autopitch" || mobileView === "mastering" ? (
          <>
            <div className="flex shrink-0" style={{ height: RULER_HEIGHT + 8 }}>
              <Timeline compact rulerOnly />
            </div>
            {mobileView === "autopitch" ? <AutoPitchPanel /> : <MasteringPanel />}
          </>
        ) : (
          <div className="flex min-h-0 flex-1">
            <Timeline compact onAddTrack={() => setAddTrackOpen(true)} />
          </div>
        )}

        {panelOpen && <FxPanel onClose={() => setMobileView("timeline")} />}

        {mobileView === "voz" && (
          <div className="absolute inset-0 z-30 flex flex-col bg-ink">
            <TrackEditorView onTuning={openTuning} />
          </div>
        )}

        {overlay === "mixer" && (
          // Mix View slides in from the left over the timeline, as in BandLab.
          <div className="absolute inset-0 z-30 flex animate-[slide-in-left_200ms_ease-out] flex-col bg-ink">
            <MobileMixView onAddTrack={() => setAddTrackOpen(true)} />
          </div>
        )}

        {overlay === "browser" && (
          <div className="absolute inset-0 z-30 flex flex-col bg-ink">
            <button
              onClick={() => setMobileView("timeline")}
              aria-label="Volver al estudio"
              title="Volver al estudio"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surf-2 text-bone"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><BrowserPanel /></div>
          </div>
        )}
      </div>

      {recordingError && <p className="shrink-0 bg-rec/15 px-3 py-1.5 text-xs text-red-300">Micrófono: {recordingError}</p>}

      {clipEditMode && tab === "studio" ? (
        <ClipEditPanel />
      ) : (
        <>
      {/* Fila de la pista seleccionada: [voz · +Fx · Núcleo] … armar · monitor */}
      <div className={`h-14 shrink-0 items-center gap-2 px-2 ${tab === "studio" ? "flex" : "hidden"}`}>
        <div className="flex h-11 items-center rounded-full bg-surf-2 px-1">
          <button onClick={() => togglePanel("voz")} disabled={!selectedTrack} aria-label="Voz" title="Voz: grabación y entrada de la pista" className={seg(mobileView === "voz")}>
            <MicIcon className="h-5 w-5" />
          </button>
          <button onClick={() => togglePanel("effects")} disabled={!selectedTrack} title="Efectos de la pista" className={seg(mobileView === "effects")}>
            <span className="text-base font-semibold">
              +<span className="italic">Fx</span>
            </span>
          </button>
          <button
            onClick={autoPitchPill}
            disabled={!selectedTrack}
            aria-label="Núcleo"
            title={mobileView === "autopitch" ? "Encender/apagar Núcleo" : "Núcleo: afinación y efectos de voz"}
            className={`relative ${seg(mobileView === "autopitch")}`}
          >
            {selectedTrack?.autoPitch?.enabled && (
              <span className="absolute -top-1.5 left-1.5 rounded-full border border-bone bg-ink px-1.5 text-[10px] font-semibold leading-4 text-bone">On</span>
            )}
            <NucleoGlyph presetId={selectedTrack?.autoPitch?.presetId ?? "classic"} className="h-6 w-6" />
            <span className="text-sm font-medium">Núcleo</span>
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => selectedTrack && armTrack(selectedTrack.id)}
          disabled={!selectedTrack || busy}
          aria-label="Armar pista para grabar"
          title={selectedTrack ? `Armar "${selectedTrack.name}" para grabar` : "Selecciona una pista"}
          className={`flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30 ${selectedTrack?.armed ? "bg-rec text-bone" : "bg-surf-2 text-bone-2"}`}
        >
          <RecordIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => selectedTrack && updateTrack(selectedTrack.id, { monitorMode: MONITOR_NEXT[selectedTrack.monitorMode] })}
          disabled={!selectedTrack}
          aria-label="Escucharte mientras grabas"
          title={selectedTrack ? `Monitor: ${selectedTrack.monitorMode}${monitoringLive ? " — te estás escuchando ahora" : ""}` : "Selecciona una pista"}
          className={`flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30 ${monitoringLive ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"}`}
        >
          <HeadphonesIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Transporte: mezcla · deshacer · inicio · GRABAR · reproducir · rehacer · metrónomo */}
      <div className="flex h-[72px] shrink-0 items-center justify-between border-t border-line px-2" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <button onClick={() => setMobileView(mobileView === "mixer" ? "timeline" : "mixer")} aria-label="Mezcla" title="Mezcla (volumen, paneo, mute, solo)" className={`${roundBtn} ${mobileView === "mixer" ? "bg-bone !text-ink" : ""}`}>
          <MixIcon className="h-5 w-5" />
        </button>
        <button onClick={undo} disabled={!canUndo || busy} aria-label="Deshacer" title="Deshacer" className={roundBtn}>
          <UndoIcon className="h-5 w-5" />
        </button>
        <button onClick={returnToStart} disabled={busy} aria-label="Volver al inicio" title="Volver al inicio — otro toque vuelve a donde estabas" className={roundBtn}>
          <RewindIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          disabled={isCountingIn}
          aria-label={isRecording ? "Detener grabación" : isCountingIn ? "Cuenta atrás" : "Grabar"}
          title={isRecording ? "Detener grabación" : "Grabar en la pista armada"}
          // BandLab: while recording the red circle becomes a dark button with
          // a red square (stop).
          className={`flex h-14 w-14 items-center justify-center rounded-full font-mono text-lg font-bold text-bone ${
            isRecording ? "bg-surf-3" : "bg-rec"
          }`}
        >
          {isCountingIn ? countInBeats : isRecording ? <span className="h-5 w-5 rounded-[4px] bg-rec" /> : null}
        </button>
        <button onClick={() => (isPlaying ? pause() : play())} disabled={busy} aria-label={isPlaying ? "Pausar" : "Reproducir"} title={isPlaying ? "Pausar" : "Reproducir"} className={`${roundBtn} !text-bone`}>
          {isPlaying && !isRecording ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
        </button>
        <button onClick={redo} disabled={!canRedo || busy} aria-label="Rehacer" title="Rehacer" className={roundBtn}>
          <RedoIcon className="h-5 w-5" />
        </button>
        {busy ? (
          <button onClick={cancelRecording} aria-label="Cancelar grabación" title="Cancelar grabación - descarta la toma" className={roundBtn}>
            <CloseIcon className="h-5 w-5" />
          </button>
        ) : (
          <button onClick={toggleMetronome} aria-label="Metrónomo" title={metronomeEnabled ? "Metrónomo encendido" : "Metrónomo apagado"} className={`${roundBtn} ${metronomeEnabled ? "bg-bone !text-ink" : ""}`}>
            <MetronomeIcon className="h-5 w-5" />
          </button>
        )}
      </div>
        </>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-40 z-50 flex justify-center px-4">
          <span className="rounded-xl bg-[#2c2c2e] px-4 py-2.5 text-sm text-bone shadow-xl">{toast}</span>
        </div>
      )}

      <BeatNotice onAdjust={() => setTab("settings")} />
      <AutomationEditor />
      <AddTrackSheet open={addTrackOpen} onClose={() => setAddTrackOpen(false)} />
    </div>
  );
}
