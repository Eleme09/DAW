"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset, listSampleAssets } from "@/lib/storage/sampleIndex";
import { deleteProject, listProjects } from "@/lib/storage/projectStore";
import { analyzeVocalRecording } from "@/audio-engine/analysis/vocalAnalysis";
import { buildPhoneMicEnhanceChain } from "@/audio-engine/analysis/autoChain";
import { useProjectStore, type BrowserTab } from "@/state/projectStore";
import { VocalAnalysisPanel } from "./VocalAnalysisPanel";
import { PitchStudioPanel } from "./PitchStudioPanel";
import { DenoisePanel } from "./DenoisePanel";
import { BeatAnalyzerPanel } from "./BeatAnalyzerPanel";
import { VocalBeatMatchPanel } from "./VocalBeatMatchPanel";
import { VocalEngineerPanel } from "./VocalEngineerPanel";
import { MixAssistantPanel } from "./MixAssistantPanel";
import { BeatGeneratorPanel } from "./BeatGeneratorPanel";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { WaveformIcon, MatchIcon, MixIcon, BeatGridIcon, SparkleIcon, FolderIcon, CloseIcon } from "./icons";
import type { AudioClip, SampleAsset } from "@/types/project";
import type { VocalAnalysisResult } from "@/types/analysis";

const TABS: { id: BrowserTab; label: string; hint: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "audio", label: "Muestras", hint: "Importa audio y usa herramientas por muestra", Icon: WaveformIcon },
  { id: "match", label: "Ajustar voz", hint: "Ajusta una toma vocal a la tonalidad y tempo del beat", Icon: MatchIcon },
  { id: "mix", label: "Mezcla IA", hint: "Balance de mezcla asistido por IA en todas las pistas", Icon: MixIcon },
  { id: "generate", label: "Generar beat", hint: "Genera un nuevo patrón de beat", Icon: BeatGridIcon },
  { id: "assistant", label: "Asistente IA", hint: "Pide cambios en lenguaje natural", Icon: SparkleIcon },
  { id: "projects", label: "Proyectos", hint: "Abre o guarda un proyecto", Icon: FolderIcon },
];

export function BrowserPanel() {
  const tab = useProjectStore((s) => s.browserTab);
  const setTab = useProjectStore((s) => s.setBrowserTab);

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-r border-line bg-ink md:w-64">
      <div className="grid grid-cols-3 border-b border-line">
        {TABS.map(({ id, label, hint, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            title={hint}
            aria-current={tab === id}
            className={`flex flex-col items-center gap-1 border-b-2 px-1 py-2 text-[10px] font-medium leading-tight ${
              tab === id
                ? "border-bone bg-surf text-bone"
                : "border-transparent text-bone-3 hover:bg-surf/60 hover:text-bone-2"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {tab === "audio" && <AudioTab />}
      {tab === "match" && <VocalBeatMatchPanel />}
      {tab === "mix" && <MixAssistantPanel />}
      {tab === "generate" && <BeatGeneratorPanel />}
      {tab === "assistant" && <AiAssistantPanel />}
      {tab === "projects" && <ProjectsTab />}
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
  const [beatOpenId, setBeatOpenId] = useState<string | null>(null);
  const [engineerOpenId, setEngineerOpenId] = useState<string | null>(null);
  const [denoiseOpenId, setDenoiseOpenId] = useState<string | null>(null);
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
    try {
      for (const file of Array.from(files)) {
        const arrayBuffer = await file.arrayBuffer();
        const id = crypto.randomUUID();
        const buffer = await getAudioEngine().decodeAndCache(id, arrayBuffer);
        await putSample(id, file.name, new Blob([arrayBuffer], { type: file.type }));
        const asset: SampleAsset = {
          id,
          name: file.name,
          durationSec: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          createdAt: new Date().toISOString(),
        };
        await addSampleAsset(asset);
        setSamples(await listSampleAssets());
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
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
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
            <div className="mt-1 grid grid-cols-2 gap-1">
              <button
                onClick={() => analyzeSample(s)}
                disabled={analyzingId === s.id}
                className="rounded bg-surf-2 py-1 text-[11px] text-bone-2 hover:bg-surf-3 disabled:opacity-50"
              >
                {analyzingId === s.id ? "Analizando…" : "Analizar"}
              </button>
              <button
                onClick={() => setEngineerOpenId((prev) => (prev === s.id ? null : s.id))}
                className="rounded bg-surf-2 py-1 text-[11px] text-bone-2 hover:bg-surf-3"
              >
                Ingeniero
              </button>
              <button
                onClick={() => setPitchOpenId((prev) => (prev === s.id ? null : s.id))}
                className="rounded bg-surf-2 py-1 text-[11px] text-bone-2 hover:bg-surf-3"
              >
                Tono
              </button>
              <button
                onClick={() => setBeatOpenId((prev) => (prev === s.id ? null : s.id))}
                className="rounded bg-surf-2 py-1 text-[11px] text-bone-2 hover:bg-surf-3"
              >
                Beat
              </button>
              <button
                onClick={() => setDenoiseOpenId((prev) => (prev === s.id ? null : s.id))}
                className="rounded bg-surf-2 py-1 text-[11px] text-bone-2 hover:bg-surf-3"
              >
                Reducir ruido
              </button>
            </div>
            {analysisResults[s.id] && (
              <VocalAnalysisPanel
                result={analysisResults[s.id]}
                onEnhance={() => enhanceSample(s)}
                enhancing={enhancingId === s.id}
              />
            )}
            {engineerOpenId === s.id && <VocalEngineerPanel sample={s} />}
            {pitchOpenId === s.id && (
              <PitchStudioPanel sample={s} onNewSample={() => listSampleAssets().then(setSamples)} />
            )}
            {beatOpenId === s.id && <BeatAnalyzerPanel sample={s} />}
            {denoiseOpenId === s.id && (
              <DenoisePanel sample={s} onNewSample={() => listSampleAssets().then(setSamples)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsTab() {
  const [entries, setEntries] = useState<Array<{ id: string; name: string; updatedAt: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openProjectById = useProjectStore((s) => s.openProjectById);
  const persist = useProjectStore((s) => s.persist);
  const newProject = useProjectStore((s) => s.newProject);
  const currentId = useProjectStore((s) => s.project.id);

  const refresh = useCallback(async () => {
    try {
      setEntries(await listProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los proyectos");
    } finally {
      setLoaded(true);
    }
  }, []);

  // Initial load is inlined (rather than calling `refresh` from the effect)
  // so the effect body is a plain fetch-and-set, not a call into a function
  // with its own try/catch/finally control flow.
  useEffect(() => {
    listProjects()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los proyectos"))
      .finally(() => setLoaded(true));
  }, []);

  async function openProject(id: string) {
    setError(null);
    try {
      await openProjectById(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el proyecto");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteProject(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el proyecto");
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex gap-2 p-2">
        <button
          onClick={() => {
            newProject();
            refresh();
          }}
          className="flex-1 rounded bg-surf-2 px-2 py-1.5 text-xs font-semibold text-bone hover:bg-surf-3"
        >
          Nuevo
        </button>
        <button
          onClick={async () => {
            setError(null);
            try {
              await persist();
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo guardar el proyecto");
            }
          }}
          className="flex-1 rounded bg-bone px-2 py-1.5 text-xs font-semibold text-ink hover:opacity-90"
        >
          Guardar
        </button>
      </div>
      {error && <p className="px-2 pb-2 text-[11px] text-red-400">{error}</p>}
      <div className="flex-1 overflow-y-auto px-2 pb-2 text-xs">
        {loaded && entries.length === 0 && (
          <p className="mt-4 text-center text-bone-3">Todavía no hay proyectos guardados.</p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className={`mb-1 flex items-center justify-between rounded px-2 py-2 ${
              e.id === currentId ? "bg-surf-2" : "bg-surf"
            }`}
          >
            <button onClick={() => openProject(e.id)} className="min-w-0 flex-1 truncate text-left">
              <div className="truncate font-medium text-bone">{e.name}</div>
              <div className="text-bone-2">{new Date(e.updatedAt).toLocaleString()}</div>
            </button>
            <button
              onClick={() => handleDelete(e.id)}
              className="ml-2 shrink-0 text-bone-2 hover:text-red-400"
              title="Eliminar proyecto"
              aria-label="Eliminar proyecto"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
