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
      const name = `${sample.name.replace(/\.[^/.]+$/, "")} (tuned)`;
      await putSample(newSampleId, name, blob);
      const asset: SampleAsset = {
        id: newSampleId,
        name,
        durationSec: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        createdAt: new Date().toISOString(),
      };
      addSampleAsset(asset);
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
      <div className="mb-1 font-semibold text-neutral-400">PITCH STUDIO</div>

      {analyzing && <p className="text-neutral-600">Analyzing pitch…</p>}

      {frames && (
        <>
          <PitchTrackCanvas frames={frames} duration={duration} />

          <div className="mt-2 flex gap-1">
            <select
              value={settings.key}
              onChange={(e) => setSettings((prev) => ({ ...prev, key: Number(e.target.value) }))}
              className="flex-1 rounded bg-neutral-800 px-1 py-1 text-neutral-300"
            >
              {NOTE_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={settings.scale}
              onChange={(e) => setSettings((prev) => ({ ...prev, scale: e.target.value as ScaleName }))}
              className="flex-1 rounded bg-neutral-800 px-1 py-1 text-neutral-300"
            >
              <option value="major">Major</option>
              <option value="naturalMinor">Minor</option>
              <option value="chromatic">Chromatic</option>
            </select>
          </div>

          <div className="mt-2 flex gap-1">
            {(["natural", "hardTune", "modernTrap", "extreme"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => applyMode(mode)}
                className={`flex-1 rounded px-1 py-1 text-[10px] uppercase ${
                  settings.mode === mode ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {mode === "hardTune" ? "Hard Tune" : mode === "modernTrap" ? "Modern Trap" : mode}
              </button>
            ))}
          </div>

          <label className="mt-2 flex items-center gap-2 text-neutral-400">
            <span className="w-20 shrink-0">Retune</span>
            <input
              type="range"
              min={0}
              max={300}
              step={5}
              value={settings.retuneSpeedMs}
              onChange={(e) => setSettings((prev) => ({ ...prev, retuneSpeedMs: Number(e.target.value) }))}
              className="h-1 flex-1 accent-orange-500"
            />
            <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">{settings.retuneSpeedMs}ms</span>
          </label>
          <label className="mt-1 flex items-center gap-2 text-neutral-400">
            <span className="w-20 shrink-0">Humanize</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={settings.humanizeAmount * 100}
              onChange={(e) => setSettings((prev) => ({ ...prev, humanizeAmount: Number(e.target.value) / 100 }))}
              className="h-1 flex-1 accent-orange-500"
            />
            <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">
              {Math.round(settings.humanizeAmount * 100)}%
            </span>
          </label>

          <p className="mt-2 text-neutral-600">
            Renders a new, separate take — your original recording is never overwritten. No formant
            preservation yet, so large corrections can sound thinner (see AUDIO_ENGINE.md).
          </p>

          <button
            onClick={applyCorrection}
            disabled={applying}
            className="mt-2 w-full rounded bg-orange-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
          >
            {applying ? "Rendering…" : "Apply Pitch Correction"}
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

    ctx.fillStyle = "#f97316";
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
