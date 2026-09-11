"use client";

import { useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { hydrateProjectSamples } from "@/lib/audio/sampleLoader";
import { analyzeMix } from "@/audio-engine/analysis/mixAnalysis";
import { PLATFORM_LABELS, suggestMasteringGain, type MasteringPlatform } from "@/audio-engine/masteringTargets";
import { createEffectInstance } from "@/types/effects";
import { useProjectStore } from "@/state/projectStore";
import type { MixAnalysisResult, MixSuggestion } from "@/types/mixAnalysis";
import type { Severity } from "@/types/analysis";

const PLATFORMS = Object.keys(PLATFORM_LABELS) as MasteringPlatform[];

const SEVERITY_COLOR: Record<Severity, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-red-400",
};
const SEVERITY_LABEL: Record<Severity, string> = { low: "Low", medium: "Medium", high: "High" };

export function MixAssistantPanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<MixAnalysisResult | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<MasteringPlatform>("spotify");
  const [masterGainApplied, setMasterGainApplied] = useState(false);

  const project = useProjectStore((s) => s.project);
  const setEffectChain = useProjectStore((s) => s.setEffectChain);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  const hasEnoughAudio = project.tracks.filter((t) => t.clips.length > 0).length > 0;

  async function runAnalysis() {
    setError(null);
    setAnalyzing(true);
    setResult(null);
    setAppliedIds(new Set());
    setMasterGainApplied(false);
    try {
      const sampleIds = Array.from(
        new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)))
      );
      await hydrateProjectSamples(sampleIds);
      const engine = getAudioEngine();
      const analysis = await analyzeMix(project, (id) => engine.getBuffer(id));
      setResult(analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mix analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function applySuggestion(suggestion: MixSuggestion) {
    const track = project.tracks.find((t) => t.id === suggestion.trackId);
    if (!track) return;
    if (suggestion.kind === "eqCut") {
      setEffectChain(track.id, [...track.inserts, suggestion.effect]);
    } else {
      updateTrack(track.id, { volumeDb: track.volumeDb + suggestion.deltaDb });
    }
    setAppliedIds((prev) => new Set(prev).add(suggestion.id));
  }

  function applyMasterGain(deltaDb: number) {
    // A ratio-1 compressor is just a makeup-gain stage — no compression happens at 1:1, so this is
    // purely a master gain trim, reusing an existing effect type instead of adding a dedicated one.
    const gainStage = createEffectInstance("compressor");
    if (gainStage.type === "compressor") {
      gainStage.params.ratio = 1;
      gainStage.params.thresholdDb = 0;
      gainStage.params.makeupDb = deltaDb;
    }
    setEffectChain("master", [...project.masterInserts, gainStage]);
    setMasterGainApplied(true);
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-2 text-xs">
      <button
        onClick={runAnalysis}
        disabled={analyzing || !hasEnoughAudio}
        className="w-full rounded bg-orange-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
      >
        {analyzing ? "Analyzing mix…" : "Analyze Mix"}
      </button>
      {!hasEnoughAudio && (
        <p className="mt-2 text-center text-neutral-600">Add audio to the timeline first.</p>
      )}
      {error && <p className="mt-2 text-red-400">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          <section className="rounded border border-neutral-800 bg-neutral-950 p-2">
            <div className="mb-1 font-semibold text-neutral-400">FULL MIX READ</div>
            <div className="space-y-0.5 text-[11px]">
              {(
                [
                  ["Low-end", result.mix.lowEnd],
                  ["Mud", result.mix.mud],
                  ["Harshness", result.mix.harshness],
                  ["Sibilance", result.mix.sibilance],
                ] as Array<[string, Severity]>
              ).map(([label, severity]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-neutral-500">{label}</span>
                  <span className={SEVERITY_COLOR[severity]}>{SEVERITY_LABEL[severity]}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-neutral-500">Peak / RMS</span>
                <span className="text-neutral-300">
                  {result.mix.peakDb.toFixed(1)} / {result.mix.rmsDb.toFixed(1)} dB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Integrated LUFS</span>
                <span className="text-neutral-300">
                  {Number.isFinite(result.mix.integratedLufs) ? result.mix.integratedLufs.toFixed(1) : "-∞"}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded border border-neutral-800 bg-neutral-950 p-2">
            <div className="mb-1 font-semibold text-neutral-400">MASTERING</div>
            <p className="mb-2 text-[11px] text-neutral-600">
              Published streaming-normalization targets, not a guarantee of exact platform behavior.
              Applies as a master-bus gain trim (a 1:1-ratio compressor stage used purely for its
              makeup gain) — review before exporting.
            </p>
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value as MasteringPlatform);
                setMasterGainApplied(false);
              }}
              className="mb-2 w-full rounded bg-neutral-900 px-2 py-1.5 text-[11px] text-neutral-300"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
            {(() => {
              const suggestion = suggestMasteringGain(result.mix.integratedLufs, platform);
              return (
                <>
                  <div className="mb-2 flex justify-between text-[11px]">
                    <span className="text-neutral-500">Target</span>
                    <span className="text-neutral-300">{suggestion.targetLufs} LUFS</span>
                  </div>
                  <button
                    onClick={() => applyMasterGain(suggestion.deltaDb)}
                    disabled={masterGainApplied || Math.abs(suggestion.deltaDb) < 0.1}
                    className="w-full rounded bg-neutral-800 py-1 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
                  >
                    {masterGainApplied
                      ? "Applied"
                      : Math.abs(suggestion.deltaDb) < 0.1
                        ? "Already at target"
                        : `Apply ${suggestion.deltaDb > 0 ? "+" : ""}${suggestion.deltaDb.toFixed(1)}dB master gain`}
                  </button>
                </>
              );
            })()}
          </section>

          <section className="rounded border border-neutral-800 bg-neutral-950 p-2">
            <div className="mb-1 font-semibold text-neutral-400">
              MASKING {result.masking.length > 0 && `(${result.masking.length})`}
            </div>
            {result.masking.length === 0 ? (
              <p className="text-[11px] text-neutral-600">No significant frequency masking detected.</p>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {result.masking.map((f, i) => (
                  <li key={i} className="text-neutral-400">
                    <span className="text-neutral-200">{f.trackAName}</span> vs{" "}
                    <span className="text-neutral-200">{f.trackBName}</span> around{" "}
                    {Math.round(f.freqHz)}Hz ({f.band})
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded border border-neutral-800 bg-neutral-950 p-2">
            <div className="mb-1 font-semibold text-neutral-400">
              GAIN STAGING {result.gainStaging.length > 0 && `(${result.gainStaging.length})`}
            </div>
            {result.gainStaging.length === 0 ? (
              <p className="text-[11px] text-neutral-600">Track levels look reasonably balanced.</p>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {result.gainStaging.map((f) => (
                  <li key={f.trackId} className="text-neutral-400">
                    <span className="text-neutral-200">{f.trackName}</span> is{" "}
                    {Math.abs(f.deltaFromMedianDb).toFixed(1)}dB {f.direction} than typical
                  </li>
                ))}
              </ul>
            )}
          </section>

          {result.suggestions.length > 0 && (
            <section className="rounded border border-neutral-800 bg-neutral-950 p-2">
              <div className="mb-1 font-semibold text-neutral-400">SUGGESTIONS</div>
              <p className="mb-2 text-[11px] text-neutral-600">
                Nothing here is applied automatically — pick what actually makes sense for your mix.
              </p>
              <ul className="space-y-2">
                {result.suggestions.map((s) => (
                  <li key={s.id} className="rounded bg-neutral-900 p-2 text-[11px]">
                    <p className="text-neutral-400">{s.reason}</p>
                    <button
                      onClick={() => applySuggestion(s)}
                      disabled={appliedIds.has(s.id)}
                      className="mt-1.5 w-full rounded bg-neutral-800 py-1 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
                    >
                      {appliedIds.has(s.id)
                        ? "Applied"
                        : s.kind === "eqCut"
                          ? `Cut ${Math.round(s.freqHz)}Hz on ${s.trackName}`
                          : `Trim ${s.trackName} ${s.deltaDb > 0 ? "+" : ""}${s.deltaDb.toFixed(1)}dB`}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.limitations.length > 0 && (
            <section className="space-y-1 border-t border-neutral-800 pt-2">
              {result.limitations.map((msg, i) => (
                <p key={i} className="text-[11px] text-neutral-600">
                  ⚠ {msg}
                </p>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
