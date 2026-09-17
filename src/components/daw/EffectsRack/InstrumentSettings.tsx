"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { listSampleAssets } from "@/lib/storage/sampleIndex";
import { oscillatorSample } from "@/audio-engine/waveformShapes";
import { createDefaultInstrument, createDefaultSamplerInstrument, type SampleAsset, type Track } from "@/types/project";
import { ParamSlider } from "./ParamSlider";
import { EnvelopeEditor } from "./EnvelopeEditor";
import { FilterCurveEditor } from "./FilterCurveEditor";
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

const WAVE_WIDTH = 300;
const WAVE_HEIGHT = 70;
const WAVE_CYCLES = 2;

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

  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveform = instrument?.type === "synth" ? instrument.waveform : null;

  useEffect(() => {
    const canvas = waveCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !waveform) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WAVE_WIDTH * dpr;
    canvas.height = WAVE_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WAVE_WIDTH, WAVE_HEIGHT);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(0, WAVE_HEIGHT / 2);
    ctx.lineTo(WAVE_WIDTH, WAVE_HEIGHT / 2);
    ctx.stroke();

    ctx.strokeStyle = "#f2ede4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const phase = (i / steps) * WAVE_CYCLES;
      const v = oscillatorSample(waveform, phase);
      const x = (i / steps) * WAVE_WIDTH;
      const y = WAVE_HEIGHT / 2 - v * (WAVE_HEIGHT / 2 - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [waveform]);

  if (!instrument) return null;

  return (
    <div className="space-y-2 border-b border-line p-2">
      <div className="flex gap-1 text-[11px] font-medium">
        <button
          onClick={() => setInstrument(track.id, createDefaultInstrument())}
          className={`min-h-11 flex-1 rounded px-2 ${
            instrument.type === "synth" ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
          }`}
        >
          Synth
        </button>
        <button
          onClick={() => setInstrument(track.id, createDefaultSamplerInstrument())}
          className={`min-h-11 flex-1 rounded px-2 ${
            instrument.type === "sampler" ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
          }`}
        >
          Sampler
        </button>
      </div>

      {instrument.type === "synth" ? (
        <div className="space-y-2">
          <SegmentedControl
            value={instrument.waveform}
            options={WAVEFORM_OPTIONS}
            onChange={(waveform) => setInstrument(track.id, { ...instrument, waveform })}
          />
          <canvas
            ref={waveCanvasRef}
            className="block rounded bg-ink"
            style={{ width: WAVE_WIDTH, height: WAVE_HEIGHT }}
          />
          <FilterCurveEditor
            cutoff={instrument.filterCutoff}
            resonance={instrument.filterResonance}
            onChange={(patch) => setInstrument(track.id, { ...instrument, ...patch })}
          />
        </div>
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

      <EnvelopeEditor
        attack={instrument.attack}
        decay={instrument.decay}
        sustain={instrument.sustain}
        release={instrument.release}
        onChange={(patch) => updateInstrumentEnvelope(track.id, patch)}
      />
    </div>
  );
}
