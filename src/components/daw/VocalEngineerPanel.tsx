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
      <div className="mb-1 font-semibold text-neutral-400">VOCAL ENGINEER</div>

      {analyzing && <p className="text-neutral-600">Analyzing…</p>}

      {analysis && (
        <>
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value as StyleChoice)}
            className="w-full rounded bg-neutral-900 px-2 py-1.5 text-neutral-300"
          >
            <optgroup label="Character">
              {Object.entries(VOCAL_CHARACTER_PRESETS).map(([id, preset]) => (
                <option key={id} value={`character:${id}`}>
                  {preset.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Genre-inspired">
              {Object.entries(GENRE_STYLE_PRESETS).map(([id, preset]) => (
                <option key={id} value={`genre:${id}`}>
                  {preset.label}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="mt-1 text-neutral-500">{style.description}</p>

          <p className="mt-2 text-neutral-600">
            Corrects what was measured (noise/mud/harshness/sibilance/dynamics), then shapes tone to the
            selected style. Pitch correction is separate — use the Pitch tab. Creates or updates a track for
            this sample.
          </p>

          <button
            onClick={makeProfessional}
            disabled={applying}
            className="mt-2 w-full rounded bg-orange-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
          >
            {applying ? "Applying…" : "Make Vocal Professional"}
          </button>
        </>
      )}
    </div>
  );
}
