"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { sliceAudioBuffer } from "@/audio-engine/sliceBuffer";
import { renderBufferThroughChain } from "@/audio-engine/previewRender";
import { approxLufsFromMix, computePeakDb } from "@/audio-engine/loudness";
import { dbToGain } from "@/audio-engine/dbUtils";
import { analyzePitch, type PitchAnalysis } from "@/audio-engine/pitch/applyPitchCorrection";
import { analyzeVocalRecording } from "@/audio-engine/analysis/vocalAnalysis";
import { buildVocalEngineerChain } from "@/audio-engine/analysis/vocalEngineerChain";
import { VOCAL_CHARACTER_PRESETS } from "@/audio-engine/analysis/vocalStylePresets";
import { getOverlappingTakes } from "@/lib/timeline/takes";
import { NOTE_NAMES } from "@/types/pitch";
import { EFFECT_LABELS, type EffectInstance } from "@/types/effects";
import type { AudioClip } from "@/types/project";
import { Waveform } from "../Waveform";
import { PitchCurveView } from "./PitchCurveView";
import { InputMeterRow } from "../InputMeterRow";
import { MONITOR_NEXT, MONITOR_LABEL, MONITOR_CLASS } from "../monitorLabels";
import { useMonitoringLive } from "../useMonitoringLive";
import { SparkleIcon, MicIcon, RecordIcon, PlayIcon, PauseIcon } from "../icons";

/** How long the chain must sit still before re-rendering the A/B preview -
 * long enough that a knob/slider drag (which fires onChange continuously,
 * not just on release) settles before the expensive offline render runs. */
const RENDER_DEBOUNCE_MS = 500;

/** A callback ref, not useRef+useEffect([]) - the latter only ever sees
 * ref.current at the moment THIS component first mounted, which here is
 * always null (VozPanel's early-return empty states render before any
 * clip exists, and refs aren't reactive - a later re-render that finally
 * attaches the DOM node doesn't re-fire an effect with an empty deps
 * array). A callback ref runs exactly when React actually attaches/detaches
 * the node, which is the only correct place to start observing it. */
function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const refCallback = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    observerRef.current = observer;
  }, []);
  return [refCallback, width];
}

/** Short, real status text per effect type from its actual params - not
 * every one of the 16 types gets a custom line (the rest fall back to
 * "activo"/"apagado"), but nothing shown here is fabricated. */
function effectStatusLabel(effect: EffectInstance): string {
  if (effect.bypassed) return "apagado";
  switch (effect.type) {
    case "noiseGate":
      return `${effect.params.thresholdDb.toFixed(0)} dB`;
    case "pitchCorrection":
      if (effect.params.mode === "fixed") {
        const st = effect.params.fixedSemitones;
        return `${st > 0 ? "+" : ""}${st.toFixed(0)}st`;
      }
      return effect.params.scale === "custom" ? "escala personal" : `${NOTE_NAMES[effect.params.key]}`;
    case "eq":
      return `${effect.params.bands.filter((b) => b.enabled).length} bandas`;
    case "compressor":
      return `${effect.params.ratio.toFixed(0)}:1`;
    case "deesser":
      return `${(effect.params.freq / 1000).toFixed(1)}kHz`;
    case "reverb":
      return effect.params.sizeType === "room" ? "sala" : effect.params.sizeType === "hall" ? "auditorio" : "plato";
    case "delay":
      return `${effect.params.timeMs.toFixed(0)}ms`;
    case "limiter":
      return `${effect.params.ceilingDb.toFixed(1)} dB`;
    case "saturation":
      return `${effect.params.driveDb.toFixed(1)} dB`;
    default:
      return "activo";
  }
}

interface PreviewPlayer {
  source: AudioBufferSourceNode;
  gain: GainNode;
  mode: "wet" | "dry";
  startedAtCtxSec: number;
  startedAtBufferSec: number;
}

/**
 * "Voz" - the dedicated screen for the take currently in focus, per the
 * project's master direction: this is meant to be the product, not one
 * more panel reached by navigating. Operates on the selected track's
 * take-under-the-playhead (or its most recent clip), reusing the same
 * offline pitch/vocal-analysis and effect-chain code the rest of the app
 * already has - no parallel "lighter" analysis path for this screen.
 */
export function VozPanel() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const currentTime = useProjectStore((s) => s.currentTime);
  const setEffectChain = useProjectStore((s) => s.setEffectChain);
  const setEffectsRackMode = useProjectStore((s) => s.setEffectsRackMode);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const armTrack = useProjectStore((s) => s.armTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  const track = tracks.find((t) => t.id === selectedTrackId);
  // Called unconditionally (armed:false/monitorMode:"off" when there's no
  // track yet) so this screen's two early-return empty states below can
  // still show real arm/monitor state instead of nothing at all - the gap
  // named explicitly in PROGRESS.md's "indicador de monitoreo" section:
  // this was the one screen in the app with no way to tell if the mic was
  // live, even though it's the one people land on to actually record.
  const { monitoringLive, likelyHeadphones, isRecording } = useMonitoringLive(
    track?.armed ?? false,
    track?.monitorMode ?? "off"
  );
  const activeClips = useMemo(() => track?.clips.filter((c) => !c.muted) ?? [], [track]);
  const clip: AudioClip | null = useMemo(() => {
    if (activeClips.length === 0) return null;
    const atPlayhead = activeClips.find((c) => currentTime >= c.startTime && currentTime < c.startTime + c.duration);
    return atPlayhead ?? activeClips[activeClips.length - 1];
  }, [activeClips, currentTime]);

  const [dryState, setDryState] = useState<{ clipId: string; buffer: AudioBuffer; analysis: PitchAnalysis } | null>(
    null
  );
  const [wetState, setWetState] = useState<{ forBuffer: AudioBuffer; forInserts: EffectInstance[]; buffer: AudioBuffer } | null>(
    null
  );
  const [compareMode, setCompareMode] = useState<"wet" | "dry">("wet");
  const [applyingAI, setApplyingAI] = useState(false);
  const playerRef = useRef<PreviewPlayer | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const [containerRef, width] = useElementWidth<HTMLDivElement>();

  // Derived, not reset imperatively: a stale clip's buffer/analysis simply
  // stops matching `clip.id` the instant the clip changes, so the render
  // below falls back to "Cargando…" on its own - no separate "clear the
  // old one first" step that could race with the async load.
  const dryBuffer = clip && dryState?.clipId === clip.id ? dryState.buffer : null;
  const pitchAnalysis = clip && dryState?.clipId === clip.id ? dryState.analysis : null;

  // Load + trim the take's actual audible region, then analyze its real pitch.
  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    ensureSampleLoaded(clip.sampleId).then((full) => {
      if (cancelled || !full) return;
      const dry = sliceAudioBuffer(full, clip.sourceOffset, clip.duration);
      const analysis = analyzePitch(dry.getChannelData(0), dry.sampleRate);
      setDryState({ clipId: clip.id, buffer: dry, analysis });
    });
    return () => {
      cancelled = true;
      stopPreview();
    };
  }, [clip]);

  const insertsNow = useMemo(() => track?.inserts ?? [], [track?.inserts]);
  // Same derived-not-reset approach: no chain means wet IS dry, no render
  // needed; otherwise falls back to null (→ "Renderizando…") until the
  // offline render for this exact buffer+chain pair actually lands.
  const wetBuffer =
    insertsNow.length === 0
      ? dryBuffer
      : wetState && wetState.forBuffer === dryBuffer && wetState.forInserts === insertsNow
        ? wetState.buffer
        : null;
  // True exactly while a chain render for the CURRENT buffer+chain pair is
  // in flight - derived from the same wetBuffer gap, not a separate flag
  // that could drift out of sync with it.
  const rendering = insertsNow.length > 0 && dryBuffer !== null && wetBuffer === null;

  // Renders the take through the track's actual current chain - the same
  // EffectChain code as live playback, not an approximation. Re-runs
  // whenever the chain itself changes (including from "Mezclar con IA").
  // Debounced: `insertsNow` gets a new array reference on every single tick
  // of a knob/slider drag (e.g. dragging Afinación's intensity while this
  // screen is open), and each render here is a real OfflineAudioContext
  // pass - for an effect backed by an AudioWorklet (pitchCorrection,
  // noiseGate) that also means reloading the worklet module every single
  // tick. Undebounced, a normal drag fired dozens of these concurrently
  // per second with nothing to cancel the in-flight work (only the stale
  // *result* was ignored) - a real resource-exhaustion crash, not a
  // hypothetical one. Only the chain state the user actually settles on
  // gets rendered.
  useEffect(() => {
    if (!dryBuffer || insertsNow.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      renderBufferThroughChain(dryBuffer, insertsNow).then((wet) => {
        if (!cancelled) setWetState({ forBuffer: dryBuffer, forInserts: insertsNow, buffer: wet });
      });
    }, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dryBuffer, insertsNow]);

  // Loudness-match trim for the dry path - without this, toggling
  // Antes/Después would just reflect whichever one happens to be louder,
  // which is exactly the "miente" (lies) the design brief calls out.
  const matchTrimDb = useMemo(() => {
    if (!dryBuffer || !wetBuffer) return 0;
    const dryLufs = approxLufsFromMix(dryBuffer.getChannelData(0), dryBuffer.sampleRate);
    const wetLufs = approxLufsFromMix(wetBuffer.getChannelData(0), wetBuffer.sampleRate);
    if (!Number.isFinite(dryLufs) || !Number.isFinite(wetLufs)) return 0;
    return wetLufs - dryLufs;
  }, [dryBuffer, wetBuffer]);

  const displayBuffer = compareMode === "wet" ? wetBuffer : dryBuffer;
  const lufs = displayBuffer ? approxLufsFromMix(displayBuffer.getChannelData(0), displayBuffer.sampleRate) : null;
  const peakDb = displayBuffer ? computePeakDb(displayBuffer.getChannelData(0)) : null;

  function stopPreview() {
    playerRef.current?.source.stop();
    playerRef.current = null;
    setPreviewPlaying(false);
  }

  function playPreview(mode: "wet" | "dry", resumeFromSec: number) {
    const buffer = mode === "wet" ? wetBuffer : dryBuffer;
    if (!buffer) return;
    const ctx = getAudioEngine().ensureContext();
    playerRef.current?.source.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = mode === "dry" ? dbToGain(matchTrimDb) : 1;
    source.connect(gain);
    gain.connect(ctx.destination);
    const startedAtCtxSec = ctx.currentTime - resumeFromSec;
    source.start(0, Math.min(resumeFromSec, buffer.duration - 0.01));
    source.onended = () => {
      if (playerRef.current?.source === source) {
        playerRef.current = null;
        setPreviewPlaying(false);
      }
    };
    playerRef.current = { source, gain, mode, startedAtCtxSec, startedAtBufferSec: resumeFromSec };
    setPreviewPlaying(true);
  }

  function selectCompareMode(mode: "wet" | "dry") {
    if (mode === compareMode) {
      if (previewPlaying) stopPreview();
      else playPreview(mode, 0);
      return;
    }
    const ctx = getAudioEngine().getContext();
    const elapsed = playerRef.current && ctx ? ctx.currentTime - playerRef.current.startedAtCtxSec : 0;
    setCompareMode(mode);
    if (previewPlaying) playPreview(mode, Math.max(0, elapsed));
  }

  useEffect(() => stopPreview, []);

  async function mixWithAI() {
    if (!dryBuffer || !track) return;
    setApplyingAI(true);
    try {
      const analysis = analyzeVocalRecording(dryBuffer);
      const chain = buildVocalEngineerChain(analysis, VOCAL_CHARACTER_PRESETS.natural);
      setEffectChain(track.id, chain);
    } finally {
      setApplyingAI(false);
    }
  }

  function openChainEffect() {
    setEffectsRackMode("track");
    setMobileView("effects");
  }

  // Shared by both empty states below and the normal render - the gap this
  // closes is specifically that recording setup (arm + hear yourself) had
  // no presence at all on the screen people land on to record, not just in
  // the state that already has a take.
  const armMonitorRow = track && (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surf px-3 py-2">
      <button
        onClick={() => armTrack(track.id)}
        disabled={isRecording}
        title="Armar para grabar"
        className={`flex h-9 items-center gap-1.5 rounded px-3 text-xs font-semibold disabled:opacity-30 ${
          track.armed ? "bg-rec text-bone" : "bg-surf-2 text-bone-2"
        }`}
      >
        <RecordIcon className="h-3.5 w-3.5" />
        {track.armed ? "Armada" : "Armar"}
      </button>
      <button
        onClick={() => updateTrack(track.id, { monitorMode: MONITOR_NEXT[track.monitorMode] })}
        title={
          monitoringLive
            ? `${MONITOR_LABEL[track.monitorMode]} — escuchando tu micrófono ahora mismo`
            : MONITOR_LABEL[track.monitorMode]
        }
        className={`relative flex h-9 items-center gap-1.5 rounded px-3 text-xs font-semibold ${MONITOR_CLASS[track.monitorMode]}`}
      >
        <MicIcon className="h-3.5 w-3.5" />
        Monitor
        {monitoringLive && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
        )}
      </button>
      {track.armed && (
        <div className="min-w-0 flex-1">
          <InputMeterRow
            track={track}
            isRecording={isRecording}
            monitoringLive={monitoringLive}
            likelyHeadphones={likelyHeadphones}
          />
        </div>
      )}
    </div>
  );

  if (!track) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <MicIcon className="h-8 w-8 text-bone-3" />
        <p className="text-sm font-medium text-bone-2">Ninguna pista seleccionada</p>
        <p className="text-xs text-bone-3">Elige una pista con una toma de voz desde Sesión.</p>
        <button
          onClick={() => setMobileView("timeline")}
          className="mt-1 min-h-11 rounded bg-surf-2 px-4 text-xs font-medium text-bone hover:bg-surf-3"
        >
          Ir a Sesión
        </button>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-ink">
        {armMonitorRow}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <MicIcon className="h-8 w-8 text-bone-3" />
          <p className="text-sm font-medium text-bone-2">&quot;{track.name}&quot; todavía no tiene ninguna toma</p>
          <p className="text-xs text-bone-3">Graba o importa audio en esta pista para verla aquí.</p>
        </div>
      </div>
    );
  }

  const takes = getOverlappingTakes(track.clips, clip);
  const takeIndex = takes.findIndex((c) => c.id === clip.id);
  const takeLabel = takes.length > 1 ? `Toma ${takeIndex + 1} de ${takes.length}` : null;
  const keyLabel = pitchAnalysis
    ? `${NOTE_NAMES[pitchAnalysis.detectedKey.key]}${pitchAnalysis.detectedKey.scale === "minor" ? "m" : ""}`
    : null;
  const playheadSec = currentTime >= clip.startTime && currentTime <= clip.startTime + clip.duration ? currentTime - clip.startTime : null;

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-y-auto bg-ink">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surf px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-bold text-bone">{track.name}</div>
          <div className="truncate font-mono text-[9.5px] text-bone-3">
            {[takeLabel, keyLabel].filter(Boolean).join(" · ") || "Sin analizar"}
          </div>
        </div>
      </div>

      {armMonitorRow}

      <div className="relative border-b border-line" style={{ height: 150, background: "#0C0C0E" }}>
        {width > 0 && <Waveform buffer={dryBuffer} width={width} height={150} color={track.color} />}
        <div className="pointer-events-none absolute left-2.5 top-2 font-mono text-[9.5px] tracking-wide text-bone-3">TOMA</div>
        {!dryBuffer && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-bone-3">Cargando…</div>
        )}
      </div>

      {width > 0 && pitchAnalysis && (
        <PitchCurveView
          frames={pitchAnalysis.frames}
          durationSec={clip.duration}
          detectedKey={pitchAnalysis.detectedKey}
          color={track.color}
          width={width}
          playheadSec={playheadSec}
        />
      )}

      <div className="px-3.5 pb-2 pt-3.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-bone-3">Cadena vocal</div>
      {track.inserts.length === 0 ? (
        <p className="px-3.5 pb-2 text-xs text-bone-3">Todavía no hay efectos en esta pista.</p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto px-3.5 pb-2">
          {track.inserts.map((fx) => (
            <button
              key={fx.id}
              onClick={openChainEffect}
              title={`${EFFECT_LABELS[fx.type]} — toca para abrir su panel`}
              className={`shrink-0 rounded border px-2.5 py-2 text-left ${
                fx.bypassed ? "border-line opacity-40" : "border-line-2 bg-surf"
              }`}
              style={{ minWidth: 84 }}
            >
              <div className="text-[11px] font-bold text-bone">{EFFECT_LABELS[fx.type]}</div>
              <div className="mt-0.5 font-mono text-[9px] text-bone-3">{effectStatusLabel(fx)}</div>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={mixWithAI}
        disabled={!dryBuffer || applyingAI}
        className="mx-3.5 mb-2.5 flex h-13 items-center justify-center gap-2 rounded bg-bone font-display text-base font-bold text-ink hover:opacity-90 disabled:opacity-50"
      >
        <SparkleIcon className="h-4 w-4" />
        {applyingAI ? "Aplicando…" : "Mezclar con IA"}
      </button>

      <div className="mx-3.5 mb-3 flex overflow-hidden rounded border border-line-2">
        <button
          onClick={() => selectCompareMode("dry")}
          disabled={!dryBuffer}
          title="Reproduce la toma sin la cadena de efectos, con el volumen igualado al de 'Después'"
          className={`flex h-9.5 flex-1 items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-40 ${
            compareMode === "dry" ? "bg-surf-3 text-bone" : "text-bone-2"
          }`}
        >
          {compareMode === "dry" && previewPlaying ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="h-3 w-3" />}
          Antes
        </button>
        <button
          onClick={() => selectCompareMode("wet")}
          disabled={!wetBuffer}
          title="Reproduce la toma con la cadena de efectos actual"
          className={`flex h-9.5 flex-1 items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-40 ${
            compareMode === "wet" ? "bg-surf-3 text-bone" : "text-bone-2"
          }`}
        >
          {compareMode === "wet" && previewPlaying ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="h-3 w-3" />}
          Después
        </button>
      </div>
      {rendering && <p className="mx-3.5 -mt-2 mb-2 text-[10px] text-bone-3">Renderizando la cadena…</p>}

      <div className="mx-3.5 mb-4 flex gap-4 rounded border border-line bg-surf px-3 py-2.5">
        <div className="flex-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-bone-3">Sonoridad</div>
          <div className="mt-0.5 font-mono text-base text-bone">
            {lufs !== null && Number.isFinite(lufs) ? <span className="text-live">{lufs.toFixed(1)}</span> : "—"} LUFS
          </div>
        </div>
        <div className="flex-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-bone-3">Pico real</div>
          <div className="mt-0.5 font-mono text-base text-bone">
            {peakDb !== null && Number.isFinite(peakDb) ? <span className="text-live">{peakDb.toFixed(1)}</span> : "—"} dB
          </div>
        </div>
      </div>
    </div>
  );
}
