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

const GENRE_LABELS: Record<GenGenre, string> = {
  trap: "Trap",
  boomBap: "Boom Bap",
  dance: "Dance (four-on-floor)",
  halfTime: "Half-Time",
};
const MOOD_LABELS: Record<GenMood, string> = {
  dark: "Dark",
  bright: "Bright",
  chill: "Chill",
  aggressive: "Aggressive",
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
        { name: "Drums", buffer: synth.drums },
        { name: "Bass", buffer: synth.bass },
        { name: "Chords", buffer: synth.chords },
        { name: "Melody", buffer: synth.melody },
      ];

      for (const stem of stems) {
        const sampleId = crypto.randomUUID();
        const blob = encodeWav(audioBufferToChannelArrays(stem.buffer), stem.buffer.sampleRate);
        await engine.decodeAndCache(sampleId, await blob.arrayBuffer());
        await putSample(sampleId, `Generated ${stem.name}`, blob);
        const asset: SampleAsset = {
          id: sampleId,
          name: `Generated ${stem.name} (${genre}/${mood})`,
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
        `Generated ${beat.bars} bars (${beat.progressionDegrees.length}-chord progression) at ${project.bpm} BPM as 4 new tracks.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beat generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 text-xs">
      <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        <BeatGridIcon className="h-3.5 w-3.5 text-cyan-400" />
        Beat Generator
      </div>
      <p className="text-neutral-500">
        Generates a rule-based drum/bass/chords/melody sketch as 4 new tracks, using the project&apos;s
        current BPM ({project.bpm}). Synthesized placeholder instruments (oscillators + filtered noise),
        not sample-based production — meant to be mixed, replaced, or built on afterward, not a finished
        beat.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Key</span>
        <select
          value={key}
          onChange={(e) => setKey(Number(e.target.value))}
          className="rounded bg-neutral-900 px-2 py-1.5 text-neutral-300"
        >
          {NOTE_NAMES.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Scale</span>
        <select
          value={scale}
          onChange={(e) => setScale(e.target.value as ScaleName)}
          className="rounded bg-neutral-900 px-2 py-1.5 text-neutral-300"
        >
          <option value="major">Major</option>
          <option value="naturalMinor">Natural Minor</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Genre</span>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value as GenGenre)}
          className="rounded bg-neutral-900 px-2 py-1.5 text-neutral-300"
        >
          {Object.entries(GENRE_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Mood</span>
        <select
          value={mood}
          onChange={(e) => setMood(e.target.value as GenMood)}
          className="rounded bg-neutral-900 px-2 py-1.5 text-neutral-300"
        >
          {Object.entries(MOOD_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-500">Seed (same seed = same result)</span>
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value) || 0)}
          className="rounded bg-neutral-900 px-2 py-1.5 text-neutral-300"
        />
      </label>

      {error && <p className="text-red-400">{error}</p>}
      {lastSummary && <p className="text-neutral-500">{lastSummary}</p>}

      <button
        onClick={handleGenerate}
        disabled={generating}
        className="mt-1 rounded bg-cyan-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate Beat"}
      </button>
    </div>
  );
}
