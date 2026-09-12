"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { analyzePitch, correctPitchBuffer } from "@/audio-engine/pitch/applyPitchCorrection";
import { frequencyToMidi } from "@/audio-engine/pitch/noteUtils";
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

  async function applyCorrection() {
    setApplying(true);
    try {
      const buffer = await ensureSampleLoaded(sample.id);
      if (!buffer) return;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
      const corrected = correctPitchBuffer(channels, buffer.sampleRate, settings);
      const blob = encodeWav(corrected, buffer.sampleRate);

      const newSampleId = crypto.randomUUID();
      await getAudioEngine().decodeAndCache(newSampleId, await blob.arrayBuffer());
      const name = `${sample.name.replace(/\.[^/.]+$/, "")} (afinado)`;
      await putSample(newSampleId, name, blob);
      const asset: SampleAsset = {
        id: newSampleId,
        name,
        durationSec: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
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
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mt-1 rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px]">
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-neutral-800 pb-1.5 font-semibold uppercase tracking-wide text-neutral-400">
        <NoteIcon className="h-3.5 w-3.5 text-cyan-400" />
        Estudio de afinación
      </div>

      {analyzing && <p className="text-neutral-600">Analizando el tono…</p>}

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
                  settings.mode === mode ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-400"
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

          <p className="mt-2 text-neutral-600">
            Renderiza una toma nueva y separada — tu grabación original nunca se sobrescribe. Todavía
            no hay preservación de formantes, así que correcciones grandes pueden sonar más delgadas
            (ver AUDIO_ENGINE.md).
          </p>

          <button
            onClick={applyCorrection}
            disabled={applying}
            className="mt-2 min-h-11 w-full rounded bg-cyan-500 px-2 text-[11px] font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
          >
            {applying ? "Renderizando…" : "Aplicar corrección de tono"}
          </button>
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

    ctx.fillStyle = "#22d3ee";
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
