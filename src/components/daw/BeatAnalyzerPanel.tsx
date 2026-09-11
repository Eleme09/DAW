"use client";

import { useEffect, useRef, useState } from "react";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { analyzeBeat } from "@/audio-engine/beat/beatAnalysis";
import { mixToMono } from "@/audio-engine/audioBufferUtils";
import { frequencyToMidi } from "@/audio-engine/pitch/noteUtils";
import { NOTE_NAMES } from "@/types/pitch";
import type { BeatAnalysisResult, DrumHitType } from "@/types/beat";
import type { SampleAsset } from "@/types/project";

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

  return (
    <div className="mt-1 rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px]">
      <div className="mb-1 font-semibold text-neutral-400">BEAT ANALYZER</div>

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
