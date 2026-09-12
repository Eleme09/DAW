"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { listSampleAssets } from "@/lib/storage/sampleIndex";
import { createDefaultInstrument, createDefaultSamplerInstrument, type SampleAsset, type Track } from "@/types/project";
import { ParamSlider } from "./ParamSlider";

interface InstrumentSettingsProps {
  track: Track;
}

const WAVEFORMS: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];

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
    <div className="space-y-1.5 border-b border-neutral-800 p-2">
      <div className="flex gap-1 text-[11px] font-medium">
        <button
          onClick={() => setInstrument(track.id, createDefaultInstrument())}
          className={`flex-1 rounded px-2 py-1 ${
            instrument.type === "synth" ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          Synth
        </button>
        <button
          onClick={() => setInstrument(track.id, createDefaultSamplerInstrument())}
          className={`flex-1 rounded px-2 py-1 ${
            instrument.type === "sampler" ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          Sampler
        </button>
      </div>

      {instrument.type === "synth" ? (
        <div className="flex gap-1 text-[10px]">
          {WAVEFORMS.map((wf) => (
            <button
              key={wf}
              onClick={() => setInstrument(track.id, { ...instrument, waveform: wf })}
              className={`flex-1 rounded px-1 py-1 capitalize ${
                instrument.waveform === wf ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {wf}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          <select
            value={instrument.sampleId ?? ""}
            onChange={(e) => {
              const sampleId = e.target.value || null;
              setInstrument(track.id, { ...instrument, sampleId });
              if (sampleId) void ensureSampleLoaded(sampleId);
            }}
            title="Sample this instrument plays, pitch-shifted per note"
            className="w-full rounded bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200"
          >
            <option value="">No sample assigned</option>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <ParamSlider
            label="Root note"
            value={instrument.rootNote}
            min={24}
            max={96}
            step={1}
            decimals={0}
            onChange={(v) => setInstrument(track.id, { ...instrument, rootNote: v })}
          />
        </div>
      )}

      <ParamSlider
        label="Attack"
        value={instrument.attack}
        min={0.001}
        max={2}
        step={0.001}
        unit=" s"
        decimals={3}
        onChange={(v) => updateInstrumentEnvelope(track.id, { attack: v })}
      />
      <ParamSlider
        label="Decay"
        value={instrument.decay}
        min={0}
        max={2}
        step={0.01}
        unit=" s"
        decimals={2}
        onChange={(v) => updateInstrumentEnvelope(track.id, { decay: v })}
      />
      <ParamSlider
        label="Sustain"
        value={instrument.sustain}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => updateInstrumentEnvelope(track.id, { sustain: v })}
      />
      <ParamSlider
        label="Release"
        value={instrument.release}
        min={0.001}
        max={3}
        step={0.01}
        unit=" s"
        decimals={2}
        onChange={(v) => updateInstrumentEnvelope(track.id, { release: v })}
      />
    </div>
  );
}
