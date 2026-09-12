"use client";

import { useEffect, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { estimateNoiseProfile, reduceNoiseBuffer } from "@/audio-engine/analysis/spectralNoiseReduction";
import { encodeWav } from "@/audio-engine/wavEncoder";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import { useProjectStore } from "@/state/projectStore";
import type { AudioClip, SampleAsset } from "@/types/project";
import { WaveformIcon } from "./icons";

interface DenoisePanelProps {
  sample: SampleAsset;
  onNewSample?: () => void;
}

export function DenoisePanel({ sample, onNewSample }: DenoisePanelProps) {
  const [loading, setLoading] = useState(true);
  const [strength, setStrength] = useState(0.6);
  const [noiseLevel, setNoiseLevel] = useState(0);
  const [applying, setApplying] = useState(false);

  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);

  useEffect(() => {
    let cancelled = false;
    ensureSampleLoaded(sample.id).then((buffer) => {
      if (cancelled || !buffer) return;
      const profile = estimateNoiseProfile(buffer.getChannelData(0));
      const level = profile.reduce((s, v) => s + v, 0) / profile.length;
      setNoiseLevel(level);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sample.id]);

  async function applyDenoise() {
    setApplying(true);
    try {
      const buffer = await ensureSampleLoaded(sample.id);
      if (!buffer) return;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
      const denoised = reduceNoiseBuffer(channels, { strength });
      const blob = encodeWav(denoised, buffer.sampleRate);

      const newSampleId = crypto.randomUUID();
      await getAudioEngine().decodeAndCache(newSampleId, await blob.arrayBuffer());
      const name = `${sample.name.replace(/\.[^/.]+$/, "")} (denoised)`;
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
        <WaveformIcon className="h-3.5 w-3.5 text-orange-400" />
        Denoise
      </div>

      {loading ? (
        <p className="text-neutral-600">Analyzing noise floor…</p>
      ) : (
        <>
          <div className="flex justify-between text-neutral-500">
            <span>Estimated noise level</span>
            <span className="text-neutral-300">{noiseLevel < 0.0005 ? "very low" : noiseLevel < 0.003 ? "low" : "noticeable"}</span>
          </div>

          <label className="mt-2 flex items-center gap-2 text-neutral-400">
            <span className="w-16 shrink-0">Strength</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={strength * 100}
              onChange={(e) => setStrength(Number(e.target.value) / 100)}
              className="h-1 flex-1 accent-orange-500"
            />
            <span className="w-10 shrink-0 text-right tabular-nums text-neutral-300">{Math.round(strength * 100)}%</span>
          </label>

          <p className="mt-2 text-neutral-600">
            Classic spectral subtraction, not a trained model — works best when the recording has real
            quiet gaps (room tone between phrases) to learn the noise&apos;s shape from. Aggressive
            strength on a signal with no quiet gaps can introduce a warbly &quot;musical noise&quot;
            artifact. Renders a new, separate take — your original recording is never overwritten.
          </p>

          <button
            onClick={applyDenoise}
            disabled={applying}
            className="mt-2 w-full rounded bg-orange-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
          >
            {applying ? "Rendering…" : "Apply Denoise"}
          </button>
        </>
      )}
    </div>
  );
}
