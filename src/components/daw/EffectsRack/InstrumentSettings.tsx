"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { listSampleAssets } from "@/lib/storage/sampleIndex";
import { createDefaultInstrument, createDefaultSamplerInstrument, type SampleAsset, type Track } from "@/types/project";
import { ParamSlider } from "./ParamSlider";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Picker } from "../ui/Picker";

interface InstrumentSettingsProps {
  track: Track;
}

const WAVEFORM_OPTIONS: { value: OscillatorType; label: string }[] = [
  { value: "sine", label: "Seno" },
  { value: "square", label: "Cuad" },
  { value: "sawtooth", label: "Sierra" },
  { value: "triangle", label: "Tri" },
];

/** Per-track instrument editor (synth waveform or sampler assignment, plus
 * the shared ADSR envelope) - shown above the insert chain in EffectsRackPanel
 * when the selected track is an instrument track. Lives here rather than as
 * its own tab since it's still "this track's sound", the same scope the
 * panel already covers. */
export function InstrumentSettings({ track }: InstrumentSettingsProps) {
  const instrument = track.instrument;
  const setInstrument = useProjectStore((s) => s.setInstrument);
  const updateInstrumentEnvelope = useProjectStore((s) => s.updateInstrumentEnvelope);
  const [samples, setSamples] = useState<SampleAsset[]>([]);

  useEffect(() => {
    listSampleAssets()
      .then(setSamples)
      .catch(() => {});
  }, []);

  if (!instrument) return null;

  return (
    <div className="space-y-2 border-b border-neutral-800 p-2">
      <div className="flex gap-1 text-[11px] font-medium">
        <button
          onClick={() => setInstrument(track.id, createDefaultInstrument())}
          className={`min-h-11 flex-1 rounded px-2 ${
            instrument.type === "synth" ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          Synth
        </button>
        <button
          onClick={() => setInstrument(track.id, createDefaultSamplerInstrument())}
          className={`min-h-11 flex-1 rounded px-2 ${
            instrument.type === "sampler" ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          Sampler
        </button>
      </div>

      {instrument.type === "synth" ? (
        <SegmentedControl
          value={instrument.waveform}
          options={WAVEFORM_OPTIONS}
          onChange={(waveform) => setInstrument(track.id, { ...instrument, waveform })}
        />
      ) : (
        <div className="space-y-2">
          <Picker
            value={instrument.sampleId ?? ""}
            options={[{ value: "", label: "Sin muestra asignada" }, ...samples.map((s) => ({ value: s.id, label: s.name }))]}
            title="Muestra"
            onChange={(sampleId) => {
              setInstrument(track.id, { ...instrument, sampleId: sampleId || null });
              if (sampleId) void ensureSampleLoaded(sampleId);
            }}
          />
          <ParamSlider
            label="Nota raíz"
            value={instrument.rootNote}
            min={24}
            max={96}
            step={1}
            decimals={0}
            onChange={(v) => setInstrument(track.id, { ...instrument, rootNote: v })}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-2">
        <ParamSlider
          label="Ataque"
          value={instrument.attack}
          min={0.001}
          max={2}
          step={0.001}
          unit=" s"
          decimals={3}
          onChange={(v) => updateInstrumentEnvelope(track.id, { attack: v })}
        />
        <ParamSlider
          label="Caída"
          value={instrument.decay}
          min={0}
          max={2}
          step={0.01}
          unit=" s"
          decimals={2}
          onChange={(v) => updateInstrumentEnvelope(track.id, { decay: v })}
        />
        <ParamSlider
          label="Sostenido"
          value={instrument.sustain}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateInstrumentEnvelope(track.id, { sustain: v })}
        />
        <ParamSlider
          label="Liberación"
          value={instrument.release}
          min={0.001}
          max={3}
          step={0.01}
          unit=" s"
          decimals={2}
          onChange={(v) => updateInstrumentEnvelope(track.id, { release: v })}
        />
      </div>
    </div>
  );
}
