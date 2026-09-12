"use client";

import { useEffect, useState } from "react";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { analyzeVocalRecording } from "@/audio-engine/analysis/vocalAnalysis";
import { buildVocalEngineerChain } from "@/audio-engine/analysis/vocalEngineerChain";
import { GENRE_STYLE_PRESETS, VOCAL_CHARACTER_PRESETS } from "@/audio-engine/analysis/vocalStylePresets";
import { useProjectStore } from "@/state/projectStore";
import type { VocalAnalysisResult } from "@/types/analysis";
import type { GenreStyle, VocalCharacter } from "@/types/vocalStyle";
import type { AudioClip, SampleAsset } from "@/types/project";
import { SparkleIcon } from "./icons";
import { Picker } from "./ui/Picker";

interface VocalEngineerPanelProps {
  sample: SampleAsset;
}

type StyleChoice = `character:${VocalCharacter}` | `genre:${GenreStyle}`;

export function VocalEngineerPanel({ sample }: VocalEngineerPanelProps) {
  const [analyzing, setAnalyzing] = useState(true);
  const [analysis, setAnalysis] = useState<VocalAnalysisResult | null>(null);
  const [choice, setChoice] = useState<StyleChoice>("character:natural");
  const [applying, setApplying] = useState(false);

  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const setEffectChain = useProjectStore((s) => s.setEffectChain);

  useEffect(() => {
    let cancelled = false;
    ensureSampleLoaded(sample.id).then((buffer) => {
      if (cancelled || !buffer) return;
      setAnalysis(analyzeVocalRecording(buffer));
      setAnalyzing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sample.id]);

  const [kind, key] = choice.split(":") as ["character" | "genre", string];
  const style = kind === "character" ? VOCAL_CHARACTER_PRESETS[key as VocalCharacter] : GENRE_STYLE_PRESETS[key as GenreStyle];

  async function makeProfessional() {
    if (!analysis) return;
    setApplying(true);
    try {
      const buffer = await ensureSampleLoaded(sample.id);
      if (!buffer) return;

      let track = project.tracks.find((t) => t.clips.some((c) => c.sampleId === sample.id));
      if (!track) {
        track = addTrack(sample.name.replace(/\.[^/.]+$/, ""));
        const clip: AudioClip = {
          id: crypto.randomUUID(),
          trackId: track.id,
          sampleId: sample.id,
          name: sample.name,
          startTime: 0,
          duration: buffer.duration,
          sourceOffset: 0,
          gainDb: 0,
          fadeInSec: 0,
          fadeOutSec: 0,
          color: track.color,
        };
        addClip(clip);
      }

      const chain = buildVocalEngineerChain(analysis, style);
      setEffectChain(track.id, chain);
      selectTrack(track.id);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mt-1 rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px]">
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-neutral-800 pb-1.5 font-semibold uppercase tracking-wide text-neutral-400">
        <SparkleIcon className="h-3.5 w-3.5 text-cyan-400" />
        Ingeniero vocal
      </div>

      {analyzing && <p className="text-neutral-600">Analizando…</p>}

      {analysis && (
        <>
          <Picker
            value={choice}
            options={[
              ...Object.entries(VOCAL_CHARACTER_PRESETS).map(([id, preset]) => ({
                value: `character:${id}` as StyleChoice,
                label: preset.label,
                group: "Carácter",
              })),
              ...Object.entries(GENRE_STYLE_PRESETS).map(([id, preset]) => ({
                value: `genre:${id}` as StyleChoice,
                label: preset.label,
                group: "Inspirado en género",
              })),
            ]}
            title="Estilo"
            onChange={setChoice}
          />
          <p className="mt-1 text-neutral-500">{style.description}</p>

          <p className="mt-2 text-neutral-600">
            Corrige lo que se midió (ruido/barro/aspereza/sibilancia/dinámica), y luego moldea el tono
            hacia el estilo elegido. La corrección de tono es aparte — usa la pestaña Tono. Crea o
            actualiza una pista para esta muestra.
          </p>

          <button
            onClick={makeProfessional}
            disabled={applying}
            className="mt-2 min-h-11 w-full rounded bg-cyan-500 px-2 text-[11px] font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
          >
            {applying ? "Aplicando…" : "Profesionalizar voz"}
          </button>
        </>
      )}
    </div>
  );
}
