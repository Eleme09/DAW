"use client";

import { useEffect, useState } from "react";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { mixToMono } from "@/audio-engine/audioBufferUtils";
import { analyzePitch } from "@/audio-engine/pitch/applyPitchCorrection";
import { detectBeatKey, matchVocalToBeat } from "@/audio-engine/matching/vocalBeatMatch";
import { NOTE_NAMES } from "@/types/pitch";
import { listSampleAssets } from "@/lib/storage/sampleIndex";
import type { VocalBeatMatchResult } from "@/types/match";
import type { SampleAsset } from "@/types/project";
import { MatchIcon } from "./icons";

export function VocalBeatMatchPanel() {
  const [samples, setSamples] = useState<SampleAsset[]>([]);

  useEffect(() => {
    listSampleAssets().then(setSamples);
  }, []);
  const [vocalId, setVocalId] = useState<string>("");
  const [beatId, setBeatId] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<VocalBeatMatchResult | null>(null);

  async function compare() {
    if (!vocalId || !beatId) return;
    setComparing(true);
    setResult(null);
    try {
      const [vocalBuffer, beatBuffer] = await Promise.all([
        ensureSampleLoaded(vocalId),
        ensureSampleLoaded(beatId),
      ]);
      if (!vocalBuffer || !beatBuffer) return;

      const vocalChannel = mixToMono(vocalBuffer);
      const beatChannel = mixToMono(beatBuffer);
      const { frames, detectedKey: vocalKey } = analyzePitch(vocalChannel, vocalBuffer.sampleRate);
      const beatKey = detectBeatKey(beatChannel, beatBuffer.sampleRate);

      setResult(matchVocalToBeat(frames, vocalKey, beatKey));
    } finally {
      setComparing(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-2 text-xs">
      <div className="mb-2 flex items-center gap-1.5 border-b border-neutral-800 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        <MatchIcon className="h-3.5 w-3.5 text-cyan-400" />
        Vocal Match
      </div>
      {samples.length < 2 ? (
        <p className="mt-4 text-center text-neutral-600">Import a vocal take and a beat first.</p>
      ) : (
        <>
          <label className="mb-2 block">
            <span className="mb-1 block text-neutral-500">Vocal</span>
            <select
              value={vocalId}
              onChange={(e) => setVocalId(e.target.value)}
              className="w-full rounded bg-neutral-900 px-2 py-1.5 text-neutral-300"
            >
              <option value="">Select a sample…</option>
              {samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-2 block">
            <span className="mb-1 block text-neutral-500">Beat</span>
            <select
              value={beatId}
              onChange={(e) => setBeatId(e.target.value)}
              className="w-full rounded bg-neutral-900 px-2 py-1.5 text-neutral-300"
            >
              <option value="">Select a sample…</option>
              {samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={compare}
            disabled={!vocalId || !beatId || comparing}
            className="rounded bg-cyan-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
          >
            {comparing ? "Comparing…" : "Compare"}
          </button>

          {result && (
            <div className="mt-3 rounded border border-neutral-800 bg-neutral-950 p-2">
              <p className={result.compatible ? "text-green-400" : "text-yellow-400"}>{result.message}</p>
              <div className="mt-2 space-y-0.5 text-neutral-400">
                <div className="flex justify-between">
                  <span>Beat key</span>
                  <span className="text-neutral-200">
                    {NOTE_NAMES[result.beatKey.key]} {result.beatKey.scale} (
                    {Math.round(result.beatKey.confidence * 100)}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Vocal key</span>
                  <span className="text-neutral-200">
                    {NOTE_NAMES[result.vocalKey.key]} {result.vocalKey.scale} (
                    {Math.round(result.vocalKey.confidence * 100)}%)
                  </span>
                </div>
              </div>
              {result.notesOutsideScale.length > 0 && (
                <p className="mt-2 text-neutral-500">
                  Notes outside the beat&apos;s scale: {result.notesOutsideScale.map((pc) => NOTE_NAMES[pc]).join(", ")}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
