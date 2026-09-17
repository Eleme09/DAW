"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { analyzePitch, correctPitchBuffer } from "@/audio-engine/pitch/applyPitchCorrection";
import { frequencyToMidi } from "@/audio-engine/pitch/noteUtils";
import { harmonizeBuffer } from "@/audio-engine/pitch/harmonize";
import { doubleBuffer } from "@/audio-engine/pitch/doubler";
import { noteFollowBuffer } from "@/audio-engine/pitch/noteFollow";
import { encodeWav } from "@/audio-engine/wavEncoder";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import { useProjectStore } from "@/state/projectStore";
import {
  NOTE_NAMES,
  PITCH_MODE_PRESETS,
  type PitchCorrectionSettings,
  type PitchFrame,
  type PitchMode,
  type ScaleName,
} from "@/types/pitch";
import type { AudioClip, SampleAsset } from "@/types/project";
import { NoteIcon } from "./icons";
import { Picker } from "./ui/Picker";
import { Knob } from "./ui/Knob";

const SCALE_OPTIONS: { value: ScaleName; label: string }[] = [
  { value: "major", label: "Mayor" },
  { value: "naturalMinor", label: "Menor" },
  { value: "chromatic", label: "Cromática" },
];

const MODE_LABEL: Record<PitchMode, string> = {
  natural: "Natural",
  hardTune: "Corrección dura",
  modernTrap: "Trap moderno",
  extreme: "Extremo",
};

interface PitchStudioPanelProps {
  sample: SampleAsset;
  onNewSample?: () => void;
}

export function PitchStudioPanel({ sample, onNewSample }: PitchStudioPanelProps) {
  const [analyzing, setAnalyzing] = useState(true);
  const [frames, setFrames] = useState<PitchFrame[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [applying, setApplying] = useState(false);
  const [settings, setSettings] = useState<PitchCorrectionSettings>({
    key: 0,
    scale: "major",
    retuneSpeedMs: PITCH_MODE_PRESETS.natural.retuneSpeedMs,
    humanizeAmount: PITCH_MODE_PRESETS.natural.humanizeAmount,
    mode: "natural",
  });

  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const [harmonyInterval, setHarmonyInterval] = useState<2 | 4 | 7>(2);
  const [generatingHarmony, setGeneratingHarmony] = useState(false);
  const [doubleDetuneCents, setDoubleDetuneCents] = useState(25);
  const [generatingDouble, setGeneratingDouble] = useState(false);
  const midiClips = useProjectStore((s) => s.project.tracks.flatMap((t) => t.midiClips));
  const [selectedMidiClipId, setSelectedMidiClipId] = useState<string>("");
  const [applyingNoteFollow, setApplyingNoteFollow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureSampleLoaded(sample.id).then((buffer) => {
      if (cancelled || !buffer) return;
      const { frames: detectedFrames, detectedKey } = analyzePitch(buffer.getChannelData(0), buffer.sampleRate);
      setFrames(detectedFrames);
      setDuration(buffer.duration);
      setSettings((prev) => ({ ...prev, key: detectedKey.key, scale: detectedKey.scale === "minor" ? "naturalMinor" : "major" }));
      setAnalyzing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sample.id]);

  function applyMode(mode: PitchMode) {
    const preset = PITCH_MODE_PRESETS[mode];
    setSettings((prev) => ({ ...prev, mode, retuneSpeedMs: preset.retuneSpeedMs, humanizeAmount: preset.humanizeAmount }));
  }

  /** Shared by every "render a processed copy as a new take on its own
   * track" flow (correction/harmony/double) - only what differs (the DSP
   * itself, the name suffix, where the clip starts, its default level) is
   * a parameter, everything else (encode, cache, persist, place) is one
   * code path instead of copy-pasted per mode. */
  async function renderChannelsToNewTrack(
    channels: Float32Array[],
    sampleRate: number,
    nameSuffix: string,
    opts: { startTimeSec?: number; gainDb?: number } = {}
  ) {
    const blob = encodeWav(channels, sampleRate);
    const newSampleId = crypto.randomUUID();
    await getAudioEngine().decodeAndCache(newSampleId, await blob.arrayBuffer());
    const name = `${sample.name.replace(/\.[^/.]+$/, "")} (${nameSuffix})`;
    await putSample(newSampleId, name, blob);
    const durationSec = channels[0].length / sampleRate;
    const asset: SampleAsset = {
      id: newSampleId,
      name,
      durationSec,
      sampleRate,
      channels: channels.length,
      createdAt: new Date().toISOString(),
    };
    await addSampleAsset(asset);
    onNewSample?.();

    const track = addTrack(name);
    const clip: AudioClip = {
      id: crypto.randomUUID(),
      trackId: track.id,
      sampleId: newSampleId,
      name,
      startTime: opts.startTimeSec ?? 0,
      duration: durationSec,
      sourceOffset: 0,
      gainDb: opts.gainDb ?? 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      color: track.color,
    };
    addClip(clip);
    selectTrack(track.id);
  }

  async function applyCorrection() {
    setApplying(true);
    try {
      const buffer = await ensureSampleLoaded(sample.id);
      if (!buffer) return;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
      const corrected = correctPitchBuffer(channels, buffer.sampleRate, settings);
      await renderChannelsToNewTrack(corrected, buffer.sampleRate, "afinado");
    } finally {
      setApplying(false);
    }
  }

  async function generateHarmony() {
    setGeneratingHarmony(true);
    try {
      const buffer = await ensureSampleLoaded(sample.id);
      if (!buffer) return;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
      const harmonized = harmonizeBuffer(channels, buffer.sampleRate, settings.key, settings.scale, harmonyInterval);
      const intervalLabel = { 2: "3ra", 4: "5ta", 7: "8va" }[harmonyInterval];
      // -4dB starting point: a harmony sitting under the lead, not fighting
      // it for the same space - a mix starting point, not a claim that
      // this is "the right" balance (the user still has the track fader).
      await renderChannelsToNewTrack(harmonized, buffer.sampleRate, `armonía ${intervalLabel}`, { gainDb: -4 });
    } finally {
      setGeneratingHarmony(false);
    }
  }

  async function generateDouble() {
    setGeneratingDouble(true);
    try {
      const buffer = await ensureSampleLoaded(sample.id);
      if (!buffer) return;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
      const doubled = doubleBuffer(channels, buffer.sampleRate, doubleDetuneCents);
      // Timing micro-variation lives here, not inside doubler.ts (see that
      // file's doc comment) - a few real random milliseconds of offset on
      // where the rendered clip starts, the cheap-but-honest way to vary
      // timing without warping the render itself. Capped at 30ms: enough
      // to be a real double, not enough to read as sloppily out of sync.
      const startTimeSec = (Math.random() * 2 - 1) * 0.03;
      await renderChannelsToNewTrack(doubled, buffer.sampleRate, "doble", {
        startTimeSec: Math.max(0, startTimeSec),
        gainDb: -4,
      });
    } finally {
      setGeneratingDouble(false);
    }
  }

  async function generateNoteFollow() {
    const clip = midiClips.find((c) => c.id === selectedMidiClipId);
    if (!clip) return;
    setApplyingNoteFollow(true);
    try {
      const buffer = await ensureSampleLoaded(sample.id);
      if (!buffer) return;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
      const followed = noteFollowBuffer(channels, buffer.sampleRate, clip.notes);
      await renderChannelsToNewTrack(followed, buffer.sampleRate, `según ${clip.name}`);
    } finally {
      setApplyingNoteFollow(false);
    }
  }

  return (
    <div className="mt-1 rounded border border-line bg-ink p-2 text-[11px]">
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-line pb-1.5 font-semibold uppercase tracking-wide text-bone-2">
        <NoteIcon className="h-3.5 w-3.5 text-bone" />
        Estudio de afinación
      </div>

      {analyzing && <p className="text-bone-3">Analizando el tono…</p>}

      {frames && (
        <>
          <PitchTrackCanvas frames={frames} duration={duration} />

          <div className="mt-2 flex gap-1">
            <div className="flex-1">
              <Picker
                value={String(settings.key)}
                options={NOTE_NAMES.map((name, i) => ({ value: String(i), label: name }))}
                title="Tonalidad"
                onChange={(v) => setSettings((prev) => ({ ...prev, key: Number(v) }))}
              />
            </div>
            <div className="flex-1">
              <Picker
                value={settings.scale}
                options={SCALE_OPTIONS}
                title="Escala"
                onChange={(scale) => setSettings((prev) => ({ ...prev, scale }))}
              />
            </div>
          </div>

          <div className="mt-2 flex gap-1">
            {(["natural", "hardTune", "modernTrap", "extreme"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => applyMode(mode)}
                className={`min-h-11 flex-1 rounded px-1 text-[10px] uppercase ${
                  settings.mode === mode ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
                }`}
              >
                {MODE_LABEL[mode]}
              </button>
            ))}
          </div>

          <div className="mt-2 flex justify-center gap-4">
            <Knob
              value={settings.retuneSpeedMs}
              min={0}
              max={300}
              defaultValue={120}
              decimals={0}
              unit=" ms"
              label="Retune"
              onChange={(v) => setSettings((prev) => ({ ...prev, retuneSpeedMs: v }))}
            />
            <Knob
              value={settings.humanizeAmount * 100}
              min={0}
              max={100}
              defaultValue={40}
              decimals={0}
              unit="%"
              label="Humanizar"
              onChange={(v) => setSettings((prev) => ({ ...prev, humanizeAmount: v / 100 }))}
            />
          </div>

          <p className="mt-2 text-bone-3">
            Renderiza una toma nueva y separada — tu grabación original nunca se sobrescribe. Todavía
            no hay preservación de formantes, así que correcciones grandes pueden sonar más delgadas
            (ver AUDIO_ENGINE.md).
          </p>

          <button
            onClick={applyCorrection}
            disabled={applying}
            className="mt-2 min-h-11 w-full rounded bg-bone px-2 text-[11px] font-semibold text-ink hover:opacity-90 disabled:opacity-50"
          >
            {applying ? "Renderizando…" : "Aplicar corrección de tono"}
          </button>

          <div className="mt-3 border-t border-line pt-2">
            <p className="mb-1 font-semibold uppercase tracking-wide text-bone-2">Armonizador</p>
            <p className="mb-1.5 text-bone-3">
              Genera una voz nueva en una pista aparte, {harmonyInterval === 7 ? "una octava" : harmonyInterval === 4 ? "una quinta" : "una tercera"}{" "}
              dentro de la tonalidad/escala de arriba (no un intervalo fijo en semitonos - el ancho real cambia
              según la nota, como una armonía diatónica de verdad). Se suma a la mezcla, no reemplaza la toma
              original.
            </p>
            <div className="flex gap-1">
              {([2, 4, 7] as const).map((steps) => (
                <button
                  key={steps}
                  onClick={() => setHarmonyInterval(steps)}
                  className={`min-h-11 flex-1 rounded px-1 text-[10px] uppercase ${
                    harmonyInterval === steps ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
                  }`}
                >
                  {steps === 2 ? "3ra" : steps === 4 ? "5ta" : "8va"}
                </button>
              ))}
            </div>
            <button
              onClick={generateHarmony}
              disabled={generatingHarmony}
              className="mt-1.5 min-h-11 w-full rounded bg-surf-2 px-2 text-[11px] font-semibold text-bone hover:bg-surf-3 disabled:opacity-50"
            >
              {generatingHarmony ? "Generando…" : "Generar armonía"}
            </button>
          </div>

          <div className="mt-3 border-t border-line pt-2">
            <p className="mb-1 font-semibold uppercase tracking-wide text-bone-2">Doblaje</p>
            <p className="mb-1.5 text-bone-3">
              Duplica la toma en una pista aparte con micro-variaciones de tono (deriva lenta, no una
              transposición fija) y un pequeño desfase de tiempo al colocar el clip - el truco clásico de
              &quot;doblar&quot; una voz cantando la misma línea dos veces.
            </p>
            <div className="flex items-center gap-2">
              <Knob
                value={doubleDetuneCents}
                min={5}
                max={50}
                defaultValue={25}
                decimals={0}
                unit=" ¢"
                label="Variación"
                onChange={(v) => setDoubleDetuneCents(v)}
              />
              <button
                onClick={generateDouble}
                disabled={generatingDouble}
                className="min-h-11 flex-1 rounded bg-surf-2 px-2 text-[11px] font-semibold text-bone hover:bg-surf-3 disabled:opacity-50"
              >
                {generatingDouble ? "Generando…" : "Generar doble"}
              </button>
            </div>
          </div>

          <div className="mt-3 border-t border-line pt-2">
            <p className="mb-1 font-semibold uppercase tracking-wide text-bone-2">Control por notas</p>
            {midiClips.length === 0 ? (
              <p className="text-bone-3">
                No hay ningún patrón MIDI en el proyecto todavía. Crea uno en una pista de instrumento (piano
                roll) para usarlo como referencia de afinación en vez de la tonalidad/escala de arriba.
              </p>
            ) : (
              <>
                <p className="mb-1.5 text-bone-3">
                  Corrige hacia las notas exactas de un patrón MIDI en vez de la nota de escala más cercana - el
                  patrón se alinea desde su propio inicio con el comienzo de esta toma. Donde el patrón no tiene
                  ninguna nota sonando, esa parte de la toma se deja sin corregir.
                </p>
                <Picker
                  value={selectedMidiClipId}
                  options={midiClips.map((c) => ({ value: c.id, label: `${c.name} (${c.notes.length} notas)` }))}
                  title="Patrón MIDI de referencia"
                  onChange={setSelectedMidiClipId}
                />
                <button
                  onClick={generateNoteFollow}
                  disabled={applyingNoteFollow || !selectedMidiClipId}
                  className="mt-1.5 min-h-11 w-full rounded bg-surf-2 px-2 text-[11px] font-semibold text-bone hover:bg-surf-3 disabled:opacity-50"
                >
                  {applyingNoteFollow ? "Renderizando…" : "Aplicar corrección por notas"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PitchTrackCanvas({ frames, duration }: { frames: PitchFrame[]; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || duration <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 260;
    const height = 60;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const midiValues = frames.filter((f) => f.frequencyHz !== null).map((f) => frequencyToMidi(f.frequencyHz!));
    if (midiValues.length === 0) return;
    const minMidi = Math.min(...midiValues) - 2;
    const maxMidi = Math.max(...midiValues) + 2;
    const range = Math.max(1, maxMidi - minMidi);

    ctx.fillStyle = "#f2ede4";
    for (const frame of frames) {
      if (frame.frequencyHz === null) continue;
      const midi = frequencyToMidi(frame.frequencyHz);
      const x = (frame.timeSec / duration) * width;
      const y = height - ((midi - minMidi) / range) * height;
      const alpha = Math.max(0.2, frame.confidence);
      ctx.globalAlpha = alpha;
      ctx.fillRect(x, y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }, [frames, duration]);

  return <canvas ref={canvasRef} className="block w-full rounded bg-black" style={{ height: 60 }} />;
}
