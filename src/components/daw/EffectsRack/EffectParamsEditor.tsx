"use client";

import type { EffectTarget } from "@/state/projectStore";
import type { EffectInstance } from "@/types/effects";
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
import { ExciterPanel } from "./ExciterPanel";
import { MultibandPanel } from "./MultibandPanel";

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

    case "multibandCompressor":
      return <MultibandPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "chorus":
      return <ChorusPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "flanger":
      return <FlangerPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "exciter":
      return <ExciterPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "autoPan":
      return <AutoPanPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;

    case "stereoWidth":
      return <StereoWidthPanel target={target} effectId={effect.id} params={effect.params} onChange={onChange} />;
  }
}

