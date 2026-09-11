"use client";

import { useRef, useState, type ComponentType } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset, listSampleAssets } from "@/lib/storage/sampleIndex";
import { deleteProject, listProjects, loadProject as loadProjectFromDisk } from "@/lib/storage/projectStore";
import { hydrateProjectSamples } from "@/lib/audio/sampleLoader";
import { analyzeVocalRecording } from "@/audio-engine/analysis/vocalAnalysis";
import { buildPhoneMicEnhanceChain } from "@/audio-engine/analysis/autoChain";
import { useProjectStore } from "@/state/projectStore";
import { VocalAnalysisPanel } from "./VocalAnalysisPanel";
import { PitchStudioPanel } from "./PitchStudioPanel";
import { DenoisePanel } from "./DenoisePanel";
import { BeatAnalyzerPanel } from "./BeatAnalyzerPanel";
import { VocalBeatMatchPanel } from "./VocalBeatMatchPanel";
import { VocalEngineerPanel } from "./VocalEngineerPanel";
import { MixAssistantPanel } from "./MixAssistantPanel";
import { BeatGeneratorPanel } from "./BeatGeneratorPanel";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { WaveformIcon, MatchIcon, MixIcon, BeatGridIcon, SparkleIcon, FolderIcon } from "./icons";
import type { AudioClip, SampleAsset } from "@/types/project";
import type { VocalAnalysisResult } from "@/types/analysis";

type Tab = "projects" | "audio" | "match" | "mix" | "generate" | "assistant";

const TABS: { id: Tab; label: string; hint: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "audio", label: "Samples", hint: "Import audio and run per-sample tools", Icon: WaveformIcon },
  { id: "match", label: "Vocal Match", hint: "Match a vocal take to a beat's key and tempo", Icon: MatchIcon },
  { id: "mix", label: "AI Mix", hint: "AI-assisted mix balance across all tracks", Icon: MixIcon },
  { id: "generate", label: "Beat Gen", hint: "Generate a new beat pattern", Icon: BeatGridIcon },
  { id: "assistant", label: "AI Assistant", hint: "Ask for changes in plain language", Icon: SparkleIcon },
  { id: "projects", label: "Projects", hint: "Open or save a project", Icon: FolderIcon },
];

export function BrowserPanel() {
  const [tab, setTab] = useState<Tab>("audio");

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 md:w-64">
      <div className="grid grid-cols-3 border-b border-neutral-800">
        {TABS.map(({ id, label, hint, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            title={hint}
            aria-current={tab === id}
            className={`flex flex-col items-center gap-1 border-b-2 px-1 py-2 text-[10px] font-medium leading-tight ${
              tab === id
                ? "border-orange-500 bg-neutral-900 text-orange-400"
                : "border-transparent text-neutral-500 hover:bg-neutral-900/60 hover:text-neutral-300"
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
  const [samples, setSamples] = useState<SampleAsset[]>(() => listSampleAssets());
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
        addSampleAsset(asset);
        setSamples(listSampleAssets());
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
          className="w-full rounded bg-orange-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import Audio"}
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
          <p className="mt-4 text-center text-neutral-600">No audio imported yet.</p>
        )}
        {samples.map((s) => (
          <div key={s.id} className="mb-1 rounded bg-neutral-900 px-2 py-2 text-neutral-300">
            <button
              onClick={() => addSampleToTimeline(s)}
              className="block w-full truncate text-left hover:text-neutral-100"
              title={`Add "${s.name}" to timeline`}
            >
              <div className="truncate font-medium text-neutral-200">{s.name}</div>
              <div className="text-neutral-500">{s.durationSec.toFixed(1)}s</div>
            </button>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <button
                onClick={() => analyzeSample(s)}
                disabled={analyzingId === s.id}
                className="rounded bg-neutral-800 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
              >
                {analyzingId === s.id ? "Analyzing…" : "Analyze"}
              </button>
              <button
                onClick={() => setEngineerOpenId((prev) => (prev === s.id ? null : s.id))}
                className="rounded bg-neutral-800 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700"
              >
                Engineer
              </button>
              <button
                onClick={() => setPitchOpenId((prev) => (prev === s.id ? null : s.id))}
                className="rounded bg-neutral-800 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700"
              >
                Pitch
              </button>
              <button
                onClick={() => setBeatOpenId((prev) => (prev === s.id ? null : s.id))}
                className="rounded bg-neutral-800 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700"
              >
                Beat
              </button>
              <button
                onClick={() => setDenoiseOpenId((prev) => (prev === s.id ? null : s.id))}
                className="rounded bg-neutral-800 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700"
              >
                Denoise
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
              <PitchStudioPanel sample={s} onNewSample={() => setSamples(listSampleAssets())} />
            )}
            {beatOpenId === s.id && <BeatAnalyzerPanel sample={s} />}
            {denoiseOpenId === s.id && (
              <DenoisePanel sample={s} onNewSample={() => setSamples(listSampleAssets())} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsTab() {
  const [entries, setEntries] = useState(() => listProjects());
  const loadProject = useProjectStore((s) => s.loadProject);
  const persist = useProjectStore((s) => s.persist);
  const newProject = useProjectStore((s) => s.newProject);
  const currentId = useProjectStore((s) => s.project.id);

  function refresh() {
    setEntries(listProjects());
  }

  async function openProject(id: string) {
    const project = loadProjectFromDisk(id);
    if (!project) return;
    loadProject(project);
    const sampleIds = Array.from(new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId))));
    await hydrateProjectSamples(sampleIds);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex gap-2 p-2">
        <button
          onClick={() => {
            newProject();
            refresh();
          }}
          className="flex-1 rounded bg-neutral-800 px-2 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700"
        >
          New
        </button>
        <button
          onClick={() => {
            persist();
            refresh();
          }}
          className="flex-1 rounded bg-orange-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-orange-400"
        >
          Save
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 text-xs">
        {entries.length === 0 && (
          <p className="mt-4 text-center text-neutral-600">No saved projects yet.</p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className={`mb-1 flex items-center justify-between rounded px-2 py-2 ${
              e.id === currentId ? "bg-neutral-800" : "bg-neutral-900"
            }`}
          >
            <button onClick={() => openProject(e.id)} className="min-w-0 flex-1 truncate text-left">
              <div className="truncate font-medium text-neutral-200">{e.name}</div>
              <div className="text-neutral-500">{new Date(e.updatedAt).toLocaleString()}</div>
            </button>
            <button
              onClick={() => {
                deleteProject(e.id);
                refresh();
              }}
              className="ml-2 shrink-0 text-neutral-500 hover:text-red-400"
              title="Delete project"
              aria-label="Delete project"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
