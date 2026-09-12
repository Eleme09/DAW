"use client";

import { useEffect, useState } from "react";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { mixToMono } from "@/audio-engine/audioBufferUtils";
import { analyzePitch } from "@/audio-engine/pitch/applyPitchCorrection";
import { analyzeDynamics } from "@/audio-engine/analysis/dynamicsAnalysis";
import { computeOnsetEnvelope } from "@/audio-engine/beat/onsetDetection";
import { estimateTempo } from "@/audio-engine/beat/tempoDetection";
import {
  detectBeatKey,
  matchVocalToBeat,
  suggestVocalTreatment,
  type VocalTreatmentSuggestion,
} from "@/audio-engine/matching/vocalBeatMatch";
import { createEffectInstance } from "@/types/effects";
import { useProjectStore } from "@/state/projectStore";
import { NOTE_NAMES } from "@/types/pitch";
import { listSampleAssets } from "@/lib/storage/sampleIndex";
import type { VocalBeatMatchResult } from "@/types/match";
import type { AudioClip, SampleAsset } from "@/types/project";
import { MatchIcon } from "./icons";
import { Picker } from "./ui/Picker";

export function VocalBeatMatchPanel() {
  const [samples, setSamples] = useState<SampleAsset[]>([]);

  useEffect(() => {
    listSampleAssets().then(setSamples);
  }, []);
  const [vocalId, setVocalId] = useState<string>("");
  const [beatId, setBeatId] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<VocalBeatMatchResult | null>(null);
  const [treatment, setTreatment] = useState<VocalTreatmentSuggestion | null>(null);
  const [levelApplied, setLevelApplied] = useState(false);
  const [delayApplied, setDelayApplied] = useState(false);

  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const setEffectChain = useProjectStore((s) => s.setEffectChain);
  const selectTrack = useProjectStore((s) => s.selectTrack);

  async function compare() {
    if (!vocalId || !beatId) return;
    setComparing(true);
    setResult(null);
    setTreatment(null);
    setLevelApplied(false);
    setDelayApplied(false);
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

      const vocalDynamics = analyzeDynamics(vocalChannel, vocalBuffer.sampleRate);
      const beatDynamics = analyzeDynamics(beatChannel, beatBuffer.sampleRate);
      const beatTempo = estimateTempo(computeOnsetEnvelope(beatChannel, beatBuffer.sampleRate));
      setTreatment(suggestVocalTreatment(vocalDynamics, beatDynamics, beatTempo));
    } finally {
      setComparing(false);
    }
  }

  /** Same "find or create a track for this sample" pattern as VocalEngineerPanel. */
  async function findOrCreateVocalTrack() {
    let track = project.tracks.find((t) => t.clips.some((c) => c.sampleId === vocalId));
    if (track) return track;

    const buffer = await ensureSampleLoaded(vocalId);
    if (!buffer) return null;
    const sample = samples.find((s) => s.id === vocalId);
    track = addTrack(sample?.name.replace(/\.[^/.]+$/, ""));
    const clip: AudioClip = {
      id: crypto.randomUUID(),
      trackId: track.id,
      sampleId: vocalId,
      name: sample?.name ?? "Vocal",
      startTime: 0,
      duration: buffer.duration,
      sourceOffset: 0,
      gainDb: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      color: track.color,
    };
    addClip(clip);
    return track;
  }

  async function applyLevel() {
    if (!treatment) return;
    const track = await findOrCreateVocalTrack();
    if (!track) return;
    updateTrack(track.id, { volumeDb: track.volumeDb + treatment.levelDeltaDb });
    selectTrack(track.id);
    setLevelApplied(true);
  }

  async function applyDelay() {
    if (!treatment) return;
    const track = await findOrCreateVocalTrack();
    if (!track) return;
    const delay = createEffectInstance("delay");
    if (delay.type === "delay") {
      delay.params.timeMs = treatment.suggestedDelayMs;
      delay.params.feedback = 0.2;
      delay.params.mix = 0.15;
    }
    setEffectChain(track.id, [...track.inserts, delay]);
    selectTrack(track.id);
    setDelayApplied(true);
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-2 text-xs">
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
            <Picker
              value={vocalId}
              options={[{ value: "", label: "Select a sample…" }, ...samples.map((s) => ({ value: s.id, label: s.name }))]}
              title="Vocal sample"
              onChange={setVocalId}
            />
          </label>
          <label className="mb-2 block">
            <span className="mb-1 block text-neutral-500">Beat</span>
            <Picker
              value={beatId}
              options={[{ value: "", label: "Select a sample…" }, ...samples.map((s) => ({ value: s.id, label: s.name }))]}
              title="Beat sample"
              onChange={setBeatId}
            />
          </label>

          <button
            onClick={compare}
            disabled={!vocalId || !beatId || comparing}
            className="min-h-11 rounded bg-cyan-500 px-2 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
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
              {result.compatible ? null : (
                <p className="mt-2 text-neutral-600">
                  Use the Pitch tab to correct the vocal toward {NOTE_NAMES[result.beatKey.key]}{" "}
                  {result.beatKey.scale}.
                </p>
              )}
            </div>
          )}

          {treatment && (
            <div className="mt-2 rounded border border-neutral-800 bg-neutral-950 p-2">
              <div className="mb-1 font-semibold text-neutral-400">LEVEL &amp; SPACE</div>
              <div className="space-y-0.5 text-neutral-400">
                <div className="flex justify-between">
                  <span>Vocal / beat RMS</span>
                  <span className="text-neutral-200">
                    {treatment.vocalRmsDb.toFixed(1)} / {treatment.beatRmsDb.toFixed(1)} dB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Beat tempo</span>
                  <span className="text-neutral-200">
                    {Math.round(treatment.beatBpm)} BPM ({Math.round(treatment.beatTempoConfidence * 100)}%)
                  </span>
                </div>
              </div>
              <button
                onClick={applyLevel}
                disabled={levelApplied || Math.abs(treatment.levelDeltaDb) < 0.3}
                className="mt-2 w-full rounded bg-neutral-800 min-h-11 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
              >
                {levelApplied
                  ? "Level applied"
                  : Math.abs(treatment.levelDeltaDb) < 0.3
                    ? "Level already balanced"
                    : `Apply level (${treatment.levelDeltaDb > 0 ? "+" : ""}${treatment.levelDeltaDb.toFixed(1)}dB)`}
              </button>
              <button
                onClick={applyDelay}
                disabled={delayApplied}
                className="mt-1.5 w-full rounded bg-neutral-800 min-h-11 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
              >
                {delayApplied
                  ? "Delay applied"
                  : `Apply tempo-synced delay (${Math.round(treatment.suggestedDelayMs)}ms)`}
              </button>
              <p className="mt-1.5 text-[10px] text-neutral-600">
                Level trims the vocal track relative to the beat&apos;s loudness. Delay is an eighth-note echo
                synced to the beat&apos;s tempo, subtle by default (15% mix) - a starting point, adjust to taste
                in the FX tab.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
