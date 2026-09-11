"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { analyzeBeat } from "@/audio-engine/beat/beatAnalysis";
import { mixToMono } from "@/audio-engine/audioBufferUtils";
import { audioBufferToChannelArrays } from "@/audio-engine/bounce";
import { frequencyToMidi } from "@/audio-engine/pitch/noteUtils";
import { reconstructBassEvents, reconstructChordEvents, reconstructDrumEvents } from "@/audio-engine/generate/reconstructBeat";
import { synthesizeReconstruction } from "@/audio-engine/generate/synthesizeBeat";
import { encodeWav } from "@/audio-engine/wavEncoder";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import { putSample } from "@/lib/storage/sampleStore";
import { useProjectStore } from "@/state/projectStore";
import { NOTE_NAMES } from "@/types/pitch";
import type { BeatAnalysisResult, DrumHitType } from "@/types/beat";
import type { AudioClip, SampleAsset } from "@/types/project";
import { BeatGridIcon } from "./icons";

interface BeatAnalyzerPanelProps {
  sample: SampleAsset;
}

const DRUM_COLOR: Record<DrumHitType, string> = {
  kick: "#f97316",
  snare: "#38bdf8",
  hihat: "#eab308",
  other: "#525252",
};

export function BeatAnalyzerPanel({ sample }: BeatAnalyzerPanelProps) {
  const [analyzing, setAnalyzing] = useState(true);
  const [result, setResult] = useState<BeatAnalysisResult | null>(null);
  const [reconstructing, setReconstructing] = useState(false);
  const [reconstructError, setReconstructError] = useState<string | null>(null);
  const [reconstructSummary, setReconstructSummary] = useState<string | null>(null);

  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);

  useEffect(() => {
    let cancelled = false;
    ensureSampleLoaded(sample.id).then((buffer) => {
      if (cancelled || !buffer) return;
      const channelData = mixToMono(buffer);
      const analysis = analyzeBeat(channelData, buffer.sampleRate);
      setResult(analysis);
      setAnalyzing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sample.id]);

  async function reconstructAsTracks() {
    if (!result) return;
    setReconstructing(true);
    setReconstructError(null);
    try {
      const bpm = result.tempo.bpm;
      const drums = reconstructDrumEvents(result.drumHits, bpm);
      const bass = reconstructBassEvents(result.bassLine, bpm);
      const chords = reconstructChordEvents(result.chords, bpm);
      const synth = await synthesizeReconstruction(bpm, drums, bass, chords, result.durationSec);
      const engine = getAudioEngine();

      const stems: Array<{ name: string; buffer: AudioBuffer }> = [
        { name: "Drums", buffer: synth.drums },
        { name: "Bass", buffer: synth.bass },
        { name: "Chords", buffer: synth.chords },
      ];

      for (const stem of stems) {
        const sampleId = crypto.randomUUID();
        const blob = encodeWav(audioBufferToChannelArrays(stem.buffer), stem.buffer.sampleRate);
        await engine.decodeAndCache(sampleId, await blob.arrayBuffer());
        await putSample(sampleId, `Reconstructed ${stem.name}`, blob);
        const asset: SampleAsset = {
          id: sampleId,
          name: `Reconstructed ${stem.name} (from ${sample.name})`,
          durationSec: stem.buffer.duration,
          sampleRate: stem.buffer.sampleRate,
          channels: stem.buffer.numberOfChannels,
          createdAt: new Date().toISOString(),
        };
        addSampleAsset(asset);

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

      setReconstructSummary(
        `Reconstructed ${drums.length} drum hits, ${bass.length} bass notes, and ${chords.length} chords as 3 new tracks.`
      );
    } catch (err) {
      setReconstructError(err instanceof Error ? err.message : "Reconstruction failed");
    } finally {
      setReconstructing(false);
    }
  }

  return (
    <div className="mt-1 rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px]">
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-neutral-800 pb-1.5 font-semibold uppercase tracking-wide text-neutral-400">
        <BeatGridIcon className="h-3.5 w-3.5 text-orange-400" />
        Beat Analyzer
      </div>

      {analyzing && <p className="text-neutral-600">Analyzing beat — longer tracks can take a moment…</p>}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-1">
            <div className="rounded bg-neutral-900 px-1.5 py-1">
              <div className="text-neutral-500">BPM</div>
              <div className="tabular-nums text-neutral-200">
                {result.tempo.bpm.toFixed(1)}{" "}
                <span className="text-neutral-600">({Math.round(result.tempo.confidence * 100)}%)</span>
              </div>
            </div>
            <div className="rounded bg-neutral-900 px-1.5 py-1">
              <div className="text-neutral-500">Key</div>
              <div className="tabular-nums text-neutral-200">
                {NOTE_NAMES[result.key.key]} {result.key.scale}{" "}
                <span className="text-neutral-600">({Math.round(result.key.confidence * 100)}%)</span>
              </div>
            </div>
          </div>

          <div className="mt-2">
            <div className="mb-0.5 text-neutral-500">Bass line</div>
            <BassLineCanvas bassLine={result.bassLine} duration={result.durationSec} />
          </div>

          <div className="mt-2">
            <div className="mb-0.5 text-neutral-500">
              Drum hits ({result.drumHits.length}) — heuristic, not a transcription
            </div>
            <DrumHitCanvas drumHits={result.drumHits} duration={result.durationSec} />
            <div className="mt-1 flex gap-2 text-[10px]">
              {(["kick", "snare", "hihat"] as const).map((type) => (
                <span key={type} className="flex items-center gap-1 text-neutral-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: DRUM_COLOR[type] }} />
                  {type}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-2">
            <div className="mb-0.5 text-neutral-500">Chords (estimated, per second)</div>
            <div className="flex flex-wrap gap-1">
              {result.chords.map((chord, i) => (
                <span
                  key={i}
                  className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-300"
                  title={`${chord.startSec.toFixed(1)}s (confidence ${Math.round(chord.confidence * 100)}%)`}
                >
                  {NOTE_NAMES[chord.root]}
                  {chord.quality === "minor" ? "m" : ""}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-2">
            <div className="mb-0.5 text-neutral-500">
              Section boundaries — relative energy level, not verse/chorus labels
            </div>
            <div className="flex flex-wrap gap-1">
              {result.sections.map((section, i) => (
                <span key={i} className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-300">
                  {section.timeSec.toFixed(1)}s · {section.energyLevel}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-2 border-t border-neutral-800 pt-2">
            <p className="mb-1.5 text-neutral-600">
              Reconstructs the detected drums/bass/chords as 3 new synthesized tracks — a best-effort
              approximation from the analysis above, not a lossless transcription. No melody (this
              project doesn&apos;t attempt melody extraction from a full mix).
            </p>
            {reconstructError && <p className="mb-1.5 text-red-400">{reconstructError}</p>}
            {reconstructSummary && <p className="mb-1.5 text-neutral-500">{reconstructSummary}</p>}
            <button
              onClick={reconstructAsTracks}
              disabled={reconstructing}
              className="w-full rounded bg-orange-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
            >
              {reconstructing ? "Reconstructing…" : "Reconstruct as Tracks"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BassLineCanvas({ bassLine, duration }: { bassLine: BeatAnalysisResult["bassLine"]; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || duration <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 260;
    const height = 50;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const midiValues = bassLine.filter((n) => n.frequencyHz !== null).map((n) => frequencyToMidi(n.frequencyHz!));
    if (midiValues.length === 0) return;
    const minMidi = Math.min(...midiValues) - 2;
    const maxMidi = Math.max(...midiValues) + 2;
    const range = Math.max(1, maxMidi - minMidi);

    ctx.fillStyle = "#38bdf8";
    for (const note of bassLine) {
      if (note.frequencyHz === null) continue;
      const midi = frequencyToMidi(note.frequencyHz);
      const x = (note.timeSec / duration) * width;
      const y = height - ((midi - minMidi) / range) * height;
      ctx.fillRect(x, y - 1, 2, 2);
    }
  }, [bassLine, duration]);

  return <canvas ref={canvasRef} className="block w-full rounded bg-black" style={{ height: 50 }} />;
}

function DrumHitCanvas({ drumHits, duration }: { drumHits: BeatAnalysisResult["drumHits"]; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || duration <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 260;
    const height = 30;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const lanes: Record<DrumHitType, number> = { kick: 24, snare: 15, hihat: 6, other: 24 };
    for (const hit of drumHits) {
      const x = (hit.timeSec / duration) * width;
      ctx.fillStyle = DRUM_COLOR[hit.type];
      ctx.globalAlpha = Math.max(0.3, hit.confidence);
      ctx.fillRect(x, lanes[hit.type] - 2, 2, 4);
    }
    ctx.globalAlpha = 1;
  }, [drumHits, duration]);

  return <canvas ref={canvasRef} className="block w-full rounded bg-black" style={{ height: 30 }} />;
}
