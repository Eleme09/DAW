"use client";

import type { EffectTarget } from "@/state/projectStore";
import type { EffectInstance, MultibandBandParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";
import { EqPanel } from "./EqPanel";
import { PitchCorrectionPanel } from "./PitchCorrectionPanel";
import { CompressorPanel } from "./CompressorPanel";
import { LimiterPanel } from "./LimiterPanel";
import { NoiseGatePanel } from "./NoiseGatePanel";
import { DeEsserPanel } from "./DeEsserPanel";
import { SaturationPanel } from "./SaturationPanel";

const SIZE_LABEL: Record<"room" | "hall" | "plate", string> = { room: "sala", hall: "auditorio", plate: "placa" };

interface EffectParamsEditorProps {
  target: EffectTarget;
  effect: EffectInstance;
  onChange: (params: EffectInstance["params"]) => void;
}

export function EffectParamsEditor({ target, effect, onChange }: EffectParamsEditorProps) {
  switch (effect.type) {
    case "eq":
      return <EqPanel bands={effect.params.bands} onChange={(bands) => onChange({ bands })} />;

    case "pitchCorrection":
      return <PitchCorrectionPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "compressor":
      return <CompressorPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "deesser":
      return <DeEsserPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "saturation":
      return <SaturationPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "limiter":
      return <LimiterPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "clipper": {
      const p = effect.params;
      return (
        <ParamSlider label="Techo" value={p.ceilingDb} min={-6} max={0} step={0.1} unit=" dB" onChange={(v) => onChange({ ...p, ceilingDb: v })} />
      );
    }

    case "noiseGate":
      return <NoiseGatePanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "reverb": {
      const p = effect.params;
      return (
        <>
          <div className="flex w-full gap-1 text-[11px]">
            {(["room", "hall", "plate"] as const).map((sizeType) => (
              <button
                key={sizeType}
                onClick={() => onChange({ ...p, sizeType })}
                className={`min-h-11 flex-1 rounded px-1 uppercase ${
                  p.sizeType === sizeType ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
                }`}
              >
                {SIZE_LABEL[sizeType]}
              </button>
            ))}
          </div>
          <ParamSlider label="Caída" value={p.decaySec} min={0.2} max={6} step={0.1} unit=" s" onChange={(v) => onChange({ ...p, decaySec: v })} />
          <ParamSlider label="Mezcla" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "delay": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Tiempo" value={p.timeMs} min={10} max={2000} step={10} unit=" ms" decimals={0} onChange={(v) => onChange({ ...p, timeMs: v })} />
          <ParamSlider label="Feedback" value={p.feedback * 100} min={0} max={95} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, feedback: v / 100 })} />
          <ParamSlider label="Tono" value={p.filterFreq} min={500} max={12000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, filterFreq: v })} />
          <ParamSlider label="Mezcla" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "multibandCompressor": {
      const p = effect.params;
      const bandEditor = (label: string, band: MultibandBandParams, key: "low" | "mid" | "high") => (
        <div key={key} className="rounded border border-line p-1.5">
          <div className="mb-1 text-[10px] font-semibold uppercase text-bone-2">{label}</div>
          <ParamSlider label="Threshold" value={band.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, [key]: { ...band, thresholdDb: v } })} />
          <ParamSlider label="Ratio" value={band.ratio} min={1} max={20} step={0.5} unit=":1" onChange={(v) => onChange({ ...p, [key]: { ...band, ratio: v } })} />
          <ParamSlider label="Makeup" value={band.makeupDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, [key]: { ...band, makeupDb: v } })} />
        </div>
      );
      return (
        <>
          <ParamSlider label="Grave/Medio" value={p.lowMidFreq} min={40} max={1000} step={10} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, lowMidFreq: v })} />
          <ParamSlider label="Medio/Agudo" value={p.midHighFreq} min={500} max={10000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, midHighFreq: v })} />
          <ParamSlider label="Ataque" value={p.attackMs} min={0.1} max={100} step={0.1} unit=" ms" onChange={(v) => onChange({ ...p, attackMs: v })} />
          <ParamSlider label="Liberación" value={p.releaseMs} min={10} max={1000} step={5} unit=" ms" onChange={(v) => onChange({ ...p, releaseMs: v })} />
          {bandEditor("Graves", p.low, "low")}
          {bandEditor("Medios", p.mid, "mid")}
          {bandEditor("Agudos", p.high, "high")}
        </>
      );
    }

    case "chorus": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Velocidad" value={p.rateHz} min={0.05} max={5} step={0.05} unit=" Hz" decimals={2} onChange={(v) => onChange({ ...p, rateHz: v })} />
          <ParamSlider label="Profundidad" value={p.depthMs} min={0.5} max={15} step={0.5} unit=" ms" onChange={(v) => onChange({ ...p, depthMs: v })} />
          <ParamSlider label="Mezcla" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "flanger": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Velocidad" value={p.rateHz} min={0.05} max={5} step={0.05} unit=" Hz" decimals={2} onChange={(v) => onChange({ ...p, rateHz: v })} />
          <ParamSlider label="Profundidad" value={p.depthMs} min={0.2} max={10} step={0.2} unit=" ms" onChange={(v) => onChange({ ...p, depthMs: v })} />
          <ParamSlider label="Feedback" value={p.feedback * 100} min={0} max={90} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, feedback: v / 100 })} />
          <ParamSlider label="Mezcla" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "exciter": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Frec" value={p.freq} min={1500} max={12000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, freq: v })} />
          <ParamSlider label="Drive" value={p.driveDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, driveDb: v })} />
          <ParamSlider label="Mezcla" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "autoPan": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Velocidad" value={p.rateHz} min={0.05} max={8} step={0.05} unit=" Hz" decimals={2} onChange={(v) => onChange({ ...p, rateHz: v })} />
          <ParamSlider label="Profundidad" value={p.depth * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, depth: v / 100 })} />
        </>
      );
    }

    case "stereoWidth": {
      const p = effect.params;
      return (
        <ParamSlider label="Ancho" value={p.width * 100} min={0} max={200} step={5} unit="%" decimals={0} onChange={(v) => onChange({ ...p, width: v / 100 })} />
      );
    }
  }
}

