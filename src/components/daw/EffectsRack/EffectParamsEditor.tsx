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
import { StereoWidthPanel } from "./StereoWidthPanel";
import { ReverbPanel } from "./ReverbPanel";
import { DelayPanel } from "./DelayPanel";
import { ClipperPanel } from "./ClipperPanel";
import { ChorusPanel } from "./ChorusPanel";
import { FlangerPanel } from "./FlangerPanel";
import { AutoPanPanel } from "./AutoPanPanel";

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

    case "clipper":
      return <ClipperPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "noiseGate":
      return <NoiseGatePanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "reverb":
      return <ReverbPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "delay":
      return <DelayPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

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

    case "chorus":
      return <ChorusPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "flanger":
      return <FlangerPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

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

    case "autoPan":
      return <AutoPanPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "stereoWidth":
      return <StereoWidthPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;
  }
}

