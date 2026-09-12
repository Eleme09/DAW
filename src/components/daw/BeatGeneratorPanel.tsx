"use client";

import { useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { audioBufferToChannelArrays } from "@/audio-engine/bounce";
import { generateBeat } from "@/audio-engine/generate/beatGenerator";
import { synthesizeBeat } from "@/audio-engine/generate/synthesizeBeat";
import { encodeWav } from "@/audio-engine/wavEncoder";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import { putSample } from "@/lib/storage/sampleStore";
import { useProjectStore } from "@/state/projectStore";
import { NOTE_NAMES } from "@/types/pitch";
import type { ScaleName } from "@/types/pitch";
import type { GenGenre, GenMood } from "@/types/beatGen";
import type { AudioClip, SampleAsset } from "@/types/project";
import { BeatGridIcon } from "./icons";
import { Picker } from "./ui/Picker";
import { SegmentedControl } from "./ui/SegmentedControl";

const SCALE_OPTIONS: { value: ScaleName; label: string }[] = [
  { value: "major", label: "Mayor" },
  { value: "naturalMinor", label: "M. natural" },
];

const GENRE_LABELS: Record<GenGenre, string> = {
  trap: "Trap",
  boomBap: "Boom Bap",
  dance: "Dance (a cuatro tiempos)",
  halfTime: "Medio tiempo",
};
const MOOD_LABELS: Record<GenMood, string> = {
  dark: "Oscuro",
  bright: "Brillante",
  chill: "Relajado",
  aggressive: "Agresivo",
};

export function BeatGeneratorPanel() {
  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);

  const [key, setKey] = useState(0);
  const [scale, setScale] = useState<ScaleName>("naturalMinor");
  const [genre, setGenre] = useState<GenGenre>("trap");
  const [mood, setMood] = useState<GenMood>("dark");
  const [seed, setSeed] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const beat = generateBeat({ bpm: project.bpm, key, scale, genre, mood, seed });
      const synth = await synthesizeBeat(beat);
      const engine = getAudioEngine();

      const stems: Array<{ name: string; buffer: AudioBuffer }> = [
        { name: "Batería", buffer: synth.drums },
        { name: "Bajo", buffer: synth.bass },
        { name: "Acordes", buffer: synth.chords },
        { name: "Melodía", buffer: synth.melody },
      ];

      for (const stem of stems) {
        const sampleId = crypto.randomUUID();
        const blob = encodeWav(audioBufferToChannelArrays(stem.buffer), stem.buffer.sampleRate);
        await engine.decodeAndCache(sampleId, await blob.arrayBuffer());
        await putSample(sampleId, `${stem.name} generado`, blob);
        const asset: SampleAsset = {
          id: sampleId,
          name: `${stem.name} generado (${genre}/${mood})`,
          durationSec: stem.buffer.duration,
          sampleRate: stem.buffer.sampleRate,
          channels: stem.buffer.numberOfChannels,
          createdAt: new Date().toISOString(),
        };
        await addSampleAsset(asset);

        const track = addTrack(stem.name);
        const clip: AudioClip = {
          id: crypto.randomUUID(),
          trackId: track.id,
          sampleId,
          name: asset.name,
          startTime: 0,
          duration: stem.buffer.duration,
          sourceOffset: 0,
          gainDb: 0,
          fadeInSec: 0,
          fadeOutSec: 0,
          color: track.color,
        };
        addClip(clip);
      }

      setLastSummary(
        `Se generaron ${beat.bars} compases (progresión de ${beat.progressionDegrees.length} acordes) a ${project.bpm} BPM en 4 pistas nuevas.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el beat");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 text-xs">
      <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        <BeatGridIcon className="h-3.5 w-3.5 text-cyan-400" />
        Generador de beats
      </div>
      <p className="text-neutral-500">
        Genera un boceto de batería/bajo/acordes/melodía por reglas en 4 pistas nuevas, usando el
        BPM actual del proyecto ({project.bpm}). Instrumentos sintetizados de referencia (osciladores
        + ruido filtrado), no producción con samples — pensado para mezclarse, reemplazarse o
        construirse encima después, no un beat terminado.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Tonalidad</span>
        <Picker
          value={String(key)}
          options={NOTE_NAMES.map((name, i) => ({ value: String(i), label: name }))}
          title="Tonalidad"
          onChange={(v) => setKey(Number(v))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Escala</span>
        <SegmentedControl value={scale} options={SCALE_OPTIONS} onChange={setScale} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Género</span>
        <Picker
          value={genre}
          options={Object.entries(GENRE_LABELS).map(([id, label]) => ({ value: id as GenGenre, label }))}
          title="Género"
          onChange={setGenre}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Ánimo</span>
        <Picker
          value={mood}
          options={Object.entries(MOOD_LABELS).map(([id, label]) => ({ value: id as GenMood, label }))}
          title="Ánimo"
          onChange={setMood}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Semilla (misma semilla = mismo resultado)</span>
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value) || 0)}
          className="min-h-11 rounded bg-neutral-900 px-2 text-neutral-300"
        />
      </label>

      {error && <p className="text-red-400">{error}</p>}
      {lastSummary && <p className="text-neutral-500">{lastSummary}</p>}

      <button
        onClick={handleGenerate}
        disabled={generating}
        className="mt-1 min-h-11 rounded bg-cyan-500 px-2 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
      >
        {generating ? "Generando…" : "Generar beat"}
      </button>
    </div>
  );
}
