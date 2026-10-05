"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { listSampleAssets } from "@/lib/storage/sampleIndex";
import { IMPORT_ACCEPT, importAudioFile } from "@/lib/audio/importFile";
import { analyzeVocalRecording } from "@/audio-engine/analysis/vocalAnalysis";
import { buildPhoneMicEnhanceChain } from "@/audio-engine/analysis/autoChain";
import { useProjectStore, type BrowserTab } from "@/state/projectStore";
import { VocalAnalysisPanel } from "./VocalAnalysisPanel";
import { PitchStudioPanel } from "./PitchStudioPanel";
import { DenoisePanel } from "./DenoisePanel";
import { MixAssistantPanel } from "./MixAssistantPanel";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { WaveformIcon, MixIcon, SparkleIcon } from "./icons";
import type { AudioClip, SampleAsset } from "@/types/project";
import type { VocalAnalysisResult } from "@/types/analysis";

type TabDef = { id: BrowserTab; label: string; hint: string; Icon: ComponentType<{ className?: string }> };

// Every "beat" surface (Generar beat, Ajustar voz - vocal-to-beat matching,
// and the per-sample Beat analyzer button below) is hidden per explicit
// request - not deleted, not reachable from any tab/button, but the
// components/store fields/routes still exist for later. "Proyectos" moved
// out entirely (not hidden) - it's ProjectHomeScreen.tsx now, the picker
// shown before the editor even opens, not a tab buried inside it.
const CORE_TABS: TabDef[] = [
  { id: "audio", label: "Muestras", hint: "Importa audio y usa herramientas por muestra", Icon: WaveformIcon },
  { id: "assistant", label: "Asistente IA", hint: "Pide cambios en lenguaje natural", Icon: SparkleIcon },
  { id: "mix", label: "Mezcla IA", hint: "Balance de mezcla asistido por IA en todas las pistas", Icon: MixIcon },
];

function TabButton({ id, label, hint, Icon, active, onClick }: TabDef & { active: boolean; onClick: () => void }) {
  return (
    <button
      key={id}
      onClick={onClick}
      title={hint}
      aria-current={active}
      className={`flex flex-col items-center gap-1 border-b-2 px-1 py-2 text-[10px] font-medium leading-tight ${
        active ? "border-bone bg-surf text-bone" : "border-transparent text-bone-3 hover:bg-surf/60 hover:text-bone-2"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export function BrowserPanel() {
  const tab = useProjectStore((s) => s.browserTab);
  const setTab = useProjectStore((s) => s.setBrowserTab);

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-r border-line bg-ink md:w-64">
      <div className="grid grid-cols-3 border-b border-line">
        {CORE_TABS.map((t) => (
          <TabButton key={t.id} {...t} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>
      {tab === "audio" && <AudioTab />}
      {tab === "mix" && <MixAssistantPanel />}
      {tab === "assistant" && <AiAssistantPanel />}
    </div>
  );
}

function AudioTab() {
  const [samples, setSamples] = useState<SampleAsset[]>([]);
  const [importing, setImporting] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<Record<string, VocalAnalysisResult>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [enhancingId, setEnhancingId] = useState<string | null>(null);
  const [pitchOpenId, setPitchOpenId] = useState<string | null>(null);
  const [denoiseOpenId, setDenoiseOpenId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = useProjectStore((s) => s.project);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const setEffectChain = useProjectStore((s) => s.setEffectChain);

  useEffect(() => {
    listSampleAssets().then(setSamples);
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportError(null);
    const failed: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          await importAudioFile(file);
          setSamples(await listSampleAssets());
        } catch {
          // One bad file (wrong/unsupported format, corrupted data) doesn't
          // abort the rest of the batch - but it must never fail silently
          // either, which is what happened before this: decodeAudioData
          // rejecting a file threw past this function with no UI feedback
          // at all, reading as "nothing happened" / "doesn't accept this
          // format" to whoever just tried to import something.
          failed.push(file.name);
        }
      }
      if (failed.length > 0) {
        setImportError(
          `No se pudo importar: ${failed.join(", ")} — el navegador no pudo decodificar este archivo como audio (formato no soportado o archivo dañado).`
        );
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function addSampleToTimeline(sample: SampleAsset) {
    const buffer = await ensureSampleLoaded(sample.id);
    if (!buffer) return;

    let track = project.tracks.find((t) => t.id === selectedTrackId);
    if (!track) track = addTrack(sample.name.replace(/\.[^/.]+$/, ""));

    const lastEnd = track.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
    const clip: AudioClip = {
      id: crypto.randomUUID(),
      trackId: track.id,
      sampleId: sample.id,
      name: sample.name,
      startTime: lastEnd,
      duration: buffer.duration,
      sourceOffset: 0,
      gainDb: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      color: track.color,
    };
    addClip(clip);
    return { track, clip };
  }

  async function analyzeSample(sample: SampleAsset) {
    setAnalyzingId(sample.id);
    try {
      const buffer = await ensureSampleLoaded(sample.id);
      if (!buffer) return;
      const result = analyzeVocalRecording(buffer);
      setAnalysisResults((prev) => ({ ...prev, [sample.id]: result }));
    } finally {
      setAnalyzingId(null);
    }
  }

  async function enhanceSample(sample: SampleAsset) {
    const result = analysisResults[sample.id];
    if (!result) return;
    setEnhancingId(sample.id);
    try {
      let track = project.tracks.find((t) => t.clips.some((c) => c.sampleId === sample.id));
      if (!track) {
        const created = await addSampleToTimeline(sample);
        if (!created) return;
        track = created.track;
      }
      const chain = buildPhoneMicEnhanceChain(result);
      setEffectChain(track.id, chain);
      selectTrack(track.id);
    } finally {
      setEnhancingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="p-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="w-full rounded bg-bone px-2 py-1.5 text-xs font-semibold text-ink hover:opacity-90 disabled:opacity-50"
        >
          {importing ? "Importando…" : "Importar audio"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        {importError && <p className="mt-1.5 text-[11px] text-red-400">{importError}</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 text-xs">
        {samples.length === 0 && (
          <p className="mt-4 text-center text-bone-3">Todavía no importaste audio.</p>
        )}
        {samples.map((s) => (
          <div key={s.id} className="mb-1 rounded bg-surf px-2 py-2 text-bone-2">
            <button
              onClick={() => addSampleToTimeline(s)}
              className="block w-full truncate text-left hover:text-bone"
              title={`Agregar "${s.name}" a la sesión`}
            >
              <div className="truncate font-medium text-bone">{s.name}</div>
              <div className="text-bone-2">{s.durationSec.toFixed(1)}s</div>
            </button>
            {/* Etiquetas descriptivas, no una palabra suelta - "Analizar",
               "Ingeniero", "Tono" solos no dicen qué hace el botón ni qué
               son los números que muestra después (reportado directo: "solo
               es letras y botones diciendo decibeles que no se sabe para
               qué son"). */}
            <div className="mt-1 grid grid-cols-3 gap-1">
              <button
                onClick={() => analyzeSample(s)}
                disabled={analyzingId === s.id}
                title="Mide sonoridad, pico y ruido de esta muestra"
                className="rounded bg-surf-2 py-1 text-[11px] text-bone-2 hover:bg-surf-3 disabled:opacity-50"
              >
                {analyzingId === s.id ? "Analizando…" : "Analizar calidad"}
              </button>
              <button
                onClick={() => setPitchOpenId((prev) => (prev === s.id ? null : s.id))}
                title="Corrige la afinación de esta muestra (autotune)"
                className="rounded bg-surf-2 py-1 text-[11px] text-bone-2 hover:bg-surf-3"
              >
                Afinar voz
              </button>
              <button
                onClick={() => setDenoiseOpenId((prev) => (prev === s.id ? null : s.id))}
                title="Quita ruido de fondo constante (aire acondicionado, zumbido)"
                className="rounded bg-surf-2 py-1 text-[11px] text-bone-2 hover:bg-surf-3"
              >
                Quitar ruido
              </button>
            </div>
            {analysisResults[s.id] && (
              <VocalAnalysisPanel
                result={analysisResults[s.id]}
                onEnhance={() => enhanceSample(s)}
                enhancing={enhancingId === s.id}
              />
            )}
            {pitchOpenId === s.id && (
              <PitchStudioPanel sample={s} onNewSample={() => listSampleAssets().then(setSamples)} />
            )}
            {denoiseOpenId === s.id && (
              <DenoisePanel sample={s} onNewSample={() => listSampleAssets().then(setSamples)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

