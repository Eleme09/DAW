"use client";

import { useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { collectProjectSampleIds, hydrateProjectSamples } from "@/lib/audio/sampleLoader";
import { analyzeMix } from "@/audio-engine/analysis/mixAnalysis";
import { PLATFORM_LABELS, suggestMasteringGain, type MasteringPlatform } from "@/audio-engine/masteringTargets";
import { createEffectInstance } from "@/types/effects";
import { useProjectStore } from "@/state/projectStore";
import { httpAssistantProvider } from "@/lib/ai/assistantProvider";
import { applyEffectAction } from "@/lib/ai/applyAssistantAction";
import type { MixAnalysisResult, MixSuggestion } from "@/types/mixAnalysis";
import type { Severity } from "@/types/analysis";
import type { AssistantProposedAction, AssistantTurnResult } from "@/types/assistant";
import { MixIcon, SparkleIcon, WarningIcon } from "./icons";
import { Picker } from "./ui/Picker";

const PLATFORMS = Object.keys(PLATFORM_LABELS) as MasteringPlatform[];

const SEVERITY_COLOR: Record<Severity, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-red-400",
};
const SEVERITY_LABEL: Record<Severity, string> = { low: "Baja", medium: "Media", high: "Alta" };

export function MixAssistantPanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<MixAnalysisResult | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<MasteringPlatform>("spotify");
  const [masterGainApplied, setMasterGainApplied] = useState(false);
  const [aiTurn, setAiTurn] = useState<AssistantTurnResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAppliedIds, setAiAppliedIds] = useState<Set<string>>(new Set());

  const project = useProjectStore((s) => s.project);
  const setEffectChain = useProjectStore((s) => s.setEffectChain);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  const hasEnoughAudio = project.tracks.some((t) => t.clips.length > 0 || t.midiClips.length > 0);

  async function runAnalysis() {
    setError(null);
    setAnalyzing(true);
    setResult(null);
    setAppliedIds(new Set());
    setMasterGainApplied(false);
    setAiTurn(null);
    setAiAppliedIds(new Set());
    try {
      await hydrateProjectSamples(collectProjectSampleIds(project));
      const engine = getAudioEngine();
      const analysis = await analyzeMix(project, (id) => engine.getBuffer(id));
      setResult(analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo analizar la mezcla");
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

  /** Sends the DSP analysis already computed above to the same Claude-backed
   * assistant AiAssistantPanel uses, asking for a natural-language read
   * grounded in those real numbers (see route.ts's buildMixSection) rather
   * than a second, disconnected "AI opinion". */
  async function askAiForMixRead() {
    if (!result) return;
    setAiLoading(true);
    setAiTurn(null);
    setAiAppliedIds(new Set());
    try {
      const context = {
        bpm: project.bpm,
        tracks: project.tracks.map((t) => ({ id: t.id, name: t.name })),
        mix: {
          lowEnd: result.mix.lowEnd,
          mud: result.mix.mud,
          harshness: result.mix.harshness,
          sibilance: result.mix.sibilance,
          peakDb: result.mix.peakDb,
          rmsDb: result.mix.rmsDb,
          integratedLufs: result.mix.integratedLufs,
          masking: result.masking.map((m) => ({
            trackAName: m.trackAName,
            trackBName: m.trackBName,
            band: m.band,
            freqHz: m.freqHz,
          })),
          gainStaging: result.gainStaging.map((g) => ({
            trackName: g.trackName,
            deltaFromMedianDb: g.deltaFromMedianDb,
            direction: g.direction,
          })),
        },
      };
      const turn = await httpAssistantProvider.sendCommand(
        "Dame una lectura profesional de esta mezcla y propón arreglos concretos.",
        context
      );
      setAiTurn(turn);
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiAction(proposed: AssistantProposedAction) {
    const track = project.tracks.find((t) => t.id === proposed.action.trackId);
    if (!track) return;
    const { action } = proposed;
    switch (action.kind) {
      case "setTrackVolume":
        updateTrack(track.id, { volumeDb: action.volumeDb });
        break;
      case "setTrackPan":
        updateTrack(track.id, { pan: action.pan });
        break;
      case "setTrackMute":
        updateTrack(track.id, { muted: action.muted });
        break;
      case "setTrackSolo":
        updateTrack(track.id, { solo: action.solo });
        break;
      default:
        setEffectChain(track.id, applyEffectAction(track.inserts, action));
        break;
    }
    setAiAppliedIds((prev) => new Set(prev).add(proposed.id));
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-2 text-xs">
      <div className="mb-2 flex items-center gap-1.5 border-b border-line pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-bone-2">
        <MixIcon className="h-3.5 w-3.5 text-bone" />
        Asistente de mezcla IA
      </div>
      <button
        onClick={runAnalysis}
        disabled={analyzing || !hasEnoughAudio}
        className="w-full rounded bg-bone px-2 py-1.5 text-xs font-semibold text-ink hover:opacity-90 disabled:opacity-50"
      >
        {analyzing ? "Analizando mezcla…" : "Analizar mezcla"}
      </button>
      {!hasEnoughAudio && (
        <p className="mt-2 text-center text-bone-3">Agrega audio a la sesión primero.</p>
      )}
      {error && <p className="mt-2 text-red-400">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          <section className="rounded border border-line bg-ink p-2">
            <div className="mb-1 font-semibold text-bone-2">LECTURA DE LA MEZCLA</div>
            <div className="space-y-0.5 text-[11px]">
              {(
                [
                  ["Graves", result.mix.lowEnd],
                  ["Barro", result.mix.mud],
                  ["Aspereza", result.mix.harshness],
                  ["Sibilancia", result.mix.sibilance],
                ] as Array<[string, Severity]>
              ).map(([label, severity]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-bone-2">{label}</span>
                  <span className={SEVERITY_COLOR[severity]}>{SEVERITY_LABEL[severity]}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-bone-2">Pico / RMS</span>
                <span className="text-bone-2">
                  {result.mix.peakDb.toFixed(1)} / {result.mix.rmsDb.toFixed(1)} dB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-bone-2">LUFS integrado</span>
                <span className="text-bone-2">
                  {Number.isFinite(result.mix.integratedLufs) ? result.mix.integratedLufs.toFixed(1) : "-∞"}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded border border-line bg-ink p-2">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-bone-2">
              <SparkleIcon className="h-3 w-3 text-bone" />
              LECTURA DE IA
            </div>
            {!aiTurn ? (
              <button
                onClick={askAiForMixRead}
                disabled={aiLoading}
                className="w-full rounded bg-surf-2 py-1.5 text-[11px] font-semibold text-bone hover:bg-surf-3 disabled:opacity-50"
              >
                {aiLoading ? "Preguntando…" : "Pedir lectura de IA"}
              </button>
            ) : !aiTurn.configured ? (
              <p className="text-[11px] text-bone-2">
                El asistente de IA no está configurado. Define <code className="text-bone-2">ANTHROPIC_API_KEY</code> en
                tu entorno para activarlo — el análisis de arriba funciona igual sin él.
              </p>
            ) : aiTurn.errorMessage ? (
              <p className="text-[11px] text-red-400">{aiTurn.errorMessage}</p>
            ) : (
              <div className="space-y-2">
                {aiTurn.reply && <p className="text-[11px] text-bone-2">{aiTurn.reply}</p>}
                {aiTurn.proposedActions.length > 0 && (
                  <ul className="space-y-1.5">
                    {aiTurn.proposedActions.map((proposed) => (
                      <li key={proposed.id} className="rounded bg-surf p-2 text-[11px]">
                        <p className="text-bone-2">{proposed.description}</p>
                        <button
                          onClick={() => applyAiAction(proposed)}
                          disabled={aiAppliedIds.has(proposed.id)}
                          className="mt-1.5 w-full rounded bg-surf-2 py-1 text-[11px] font-semibold text-bone hover:bg-surf-3 disabled:opacity-40"
                        >
                          {aiAppliedIds.has(proposed.id) ? "Aplicado" : "Aplicar"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="rounded border border-line bg-ink p-2">
            <div className="mb-1 font-semibold text-bone-2">MASTERIZACIÓN</div>
            <p className="mb-2 text-[11px] text-bone-3">
              Objetivos de normalización publicados por cada plataforma, no una garantía exacta de
              su comportamiento real. Se aplica como un ajuste de ganancia en el bus master (un
              compresor 1:1 usado solo por su ganancia de compensación) — revísalo antes de exportar.
            </p>
            <div className="mb-2">
              <Picker
                value={platform}
                options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
                title="Objetivo de masterización"
                onChange={(p) => {
                  setPlatform(p);
                  setMasterGainApplied(false);
                }}
              />
            </div>
            {(() => {
              const suggestion = suggestMasteringGain(result.mix.integratedLufs, platform);
              return (
                <>
                  <div className="mb-2 flex justify-between text-[11px]">
                    <span className="text-bone-2">Objetivo</span>
                    <span className="text-bone-2">{suggestion.targetLufs} LUFS</span>
                  </div>
                  <button
                    onClick={() => applyMasterGain(suggestion.deltaDb)}
                    disabled={masterGainApplied || Math.abs(suggestion.deltaDb) < 0.1}
                    className="w-full rounded bg-surf-2 py-1 text-[11px] font-semibold text-bone hover:bg-surf-3 disabled:opacity-40"
                  >
                    {masterGainApplied
                      ? "Aplicado"
                      : Math.abs(suggestion.deltaDb) < 0.1
                        ? "Ya está en el objetivo"
                        : `Aplicar ${suggestion.deltaDb > 0 ? "+" : ""}${suggestion.deltaDb.toFixed(1)}dB de ganancia master`}
                  </button>
                </>
              );
            })()}
          </section>

          <section className="rounded border border-line bg-ink p-2">
            <div className="mb-1 font-semibold text-bone-2">
              ENMASCARAMIENTO {result.masking.length > 0 && `(${result.masking.length})`}
            </div>
            {result.masking.length === 0 ? (
              <p className="text-[11px] text-bone-3">No se detectó enmascaramiento de frecuencias significativo.</p>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {result.masking.map((f, i) => (
                  <li key={i} className="text-bone-2">
                    <span className="text-bone">{f.trackAName}</span> vs{" "}
                    <span className="text-bone">{f.trackBName}</span> cerca de{" "}
                    {Math.round(f.freqHz)}Hz ({f.band})
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded border border-line bg-ink p-2">
            <div className="mb-1 font-semibold text-bone-2">
              NIVELES DE GANANCIA {result.gainStaging.length > 0 && `(${result.gainStaging.length})`}
            </div>
            {result.gainStaging.length === 0 ? (
              <p className="text-[11px] text-bone-3">Los niveles de las pistas se ven razonablemente equilibrados.</p>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {result.gainStaging.map((f) => (
                  <li key={f.trackId} className="text-bone-2">
                    <span className="text-bone">{f.trackName}</span> está{" "}
                    {Math.abs(f.deltaFromMedianDb).toFixed(1)}dB {f.direction === "louder" ? "más alta" : "más baja"} de lo habitual
                  </li>
                ))}
              </ul>
            )}
          </section>

          {result.suggestions.length > 0 && (
            <section className="rounded border border-line bg-ink p-2">
              <div className="mb-1 font-semibold text-bone-2">SUGERENCIAS</div>
              <p className="mb-2 text-[11px] text-bone-3">
                Nada de esto se aplica automáticamente — elige lo que tenga sentido para tu mezcla.
              </p>
              <ul className="space-y-2">
                {result.suggestions.map((s) => (
                  <li key={s.id} className="rounded bg-surf p-2 text-[11px]">
                    <p className="text-bone-2">{s.reason}</p>
                    <button
                      onClick={() => applySuggestion(s)}
                      disabled={appliedIds.has(s.id)}
                      className="mt-1.5 w-full rounded bg-surf-2 py-1 text-[11px] font-semibold text-bone hover:bg-surf-3 disabled:opacity-40"
                    >
                      {appliedIds.has(s.id)
                        ? "Aplicado"
                        : s.kind === "eqCut"
                          ? `Cortar ${Math.round(s.freqHz)}Hz en ${s.trackName}`
                          : `Ajustar ${s.trackName} ${s.deltaDb > 0 ? "+" : ""}${s.deltaDb.toFixed(1)}dB`}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.limitations.length > 0 && (
            <section className="space-y-1 border-t border-line pt-2">
              {result.limitations.map((msg, i) => (
                <p key={i} className="flex items-start gap-1.5 text-[11px] text-bone-3">
                  <WarningIcon className="h-3.5 w-3.5 shrink-0 translate-y-px" /> {msg}
                </p>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
