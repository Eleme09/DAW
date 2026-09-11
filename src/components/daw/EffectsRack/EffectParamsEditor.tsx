"use client";

import type { EffectInstance, EqBand, MultibandBandParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

interface EffectParamsEditorProps {
  effect: EffectInstance;
  onChange: (params: EffectInstance["params"]) => void;
}

export function EffectParamsEditor({ effect, onChange }: EffectParamsEditorProps) {
  switch (effect.type) {
    case "eq":
      return <EqEditor bands={effect.params.bands} onChange={(bands) => onChange({ bands })} />;

    case "compressor": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Threshold" value={p.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, thresholdDb: v })} />
          <ParamSlider label="Ratio" value={p.ratio} min={1} max={20} step={0.5} unit=":1" onChange={(v) => onChange({ ...p, ratio: v })} />
          <ParamSlider label="Attack" value={p.attackMs} min={0.1} max={100} step={0.1} unit=" ms" onChange={(v) => onChange({ ...p, attackMs: v })} />
          <ParamSlider label="Release" value={p.releaseMs} min={10} max={1000} step={5} unit=" ms" onChange={(v) => onChange({ ...p, releaseMs: v })} />
          <ParamSlider label="Knee" value={p.kneeDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, kneeDb: v })} />
          <ParamSlider label="Makeup" value={p.makeupDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, makeupDb: v })} />
        </>
      );
    }

    case "deesser": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Freq" value={p.freq} min={2000} max={12000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, freq: v })} />
          <ParamSlider label="Threshold" value={p.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, thresholdDb: v })} />
          <ParamSlider label="Ratio" value={p.ratio} min={1} max={20} step={0.5} unit=":1" onChange={(v) => onChange({ ...p, ratio: v })} />
        </>
      );
    }

    case "saturation": {
      const p = effect.params;
      return (
        <>
          <div className="flex gap-1 text-[11px]">
            {(["warm", "neutral", "bright"] as const).map((tone) => (
              <button
                key={tone}
                onClick={() => onChange({ ...p, tone })}
                className={`flex-1 rounded px-1 py-0.5 uppercase ${
                  p.tone === tone ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
          <ParamSlider label="Drive" value={p.driveDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, driveDb: v })} />
          <ParamSlider label="Mix" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "limiter": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Threshold" value={p.thresholdDb} min={-30} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, thresholdDb: v })} />
          <ParamSlider label="Release" value={p.releaseMs} min={10} max={500} step={5} unit=" ms" onChange={(v) => onChange({ ...p, releaseMs: v })} />
          <ParamSlider label="Ceiling" value={p.ceilingDb} min={-3} max={0} step={0.1} unit=" dB" onChange={(v) => onChange({ ...p, ceilingDb: v })} />
        </>
      );
    }

    case "clipper": {
      const p = effect.params;
      return (
        <ParamSlider label="Ceiling" value={p.ceilingDb} min={-6} max={0} step={0.1} unit=" dB" onChange={(v) => onChange({ ...p, ceilingDb: v })} />
      );
    }

    case "noiseGate": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Threshold" value={p.thresholdDb} min={-80} max={0} step={1} unit=" dB" decimals={0} onChange={(v) => onChange({ ...p, thresholdDb: v })} />
          <ParamSlider label="Attack" value={p.attackMs} min={0.1} max={50} step={0.1} unit=" ms" onChange={(v) => onChange({ ...p, attackMs: v })} />
          <ParamSlider label="Release" value={p.releaseMs} min={10} max={1000} step={5} unit=" ms" onChange={(v) => onChange({ ...p, releaseMs: v })} />
          <ParamSlider label="Hold" value={p.holdMs} min={0} max={500} step={5} unit=" ms" onChange={(v) => onChange({ ...p, holdMs: v })} />
        </>
      );
    }

    case "reverb": {
      const p = effect.params;
      return (
        <>
          <div className="flex gap-1 text-[11px]">
            {(["room", "hall", "plate"] as const).map((sizeType) => (
              <button
                key={sizeType}
                onClick={() => onChange({ ...p, sizeType })}
                className={`flex-1 rounded px-1 py-0.5 uppercase ${
                  p.sizeType === sizeType ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {sizeType}
              </button>
            ))}
          </div>
          <ParamSlider label="Decay" value={p.decaySec} min={0.2} max={6} step={0.1} unit=" s" onChange={(v) => onChange({ ...p, decaySec: v })} />
          <ParamSlider label="Mix" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "delay": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Time" value={p.timeMs} min={10} max={2000} step={10} unit=" ms" decimals={0} onChange={(v) => onChange({ ...p, timeMs: v })} />
          <ParamSlider label="Feedback" value={p.feedback * 100} min={0} max={95} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, feedback: v / 100 })} />
          <ParamSlider label="Tone" value={p.filterFreq} min={500} max={12000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, filterFreq: v })} />
          <ParamSlider label="Mix" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "multibandCompressor": {
      const p = effect.params;
      const bandEditor = (label: string, band: MultibandBandParams, key: "low" | "mid" | "high") => (
        <div key={key} className="rounded border border-neutral-800 p-1.5">
          <div className="mb-1 text-[10px] font-semibold uppercase text-neutral-500">{label}</div>
          <ParamSlider label="Threshold" value={band.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, [key]: { ...band, thresholdDb: v } })} />
          <ParamSlider label="Ratio" value={band.ratio} min={1} max={20} step={0.5} unit=":1" onChange={(v) => onChange({ ...p, [key]: { ...band, ratio: v } })} />
          <ParamSlider label="Makeup" value={band.makeupDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, [key]: { ...band, makeupDb: v } })} />
        </div>
      );
      return (
        <>
          <ParamSlider label="Low/Mid" value={p.lowMidFreq} min={40} max={1000} step={10} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, lowMidFreq: v })} />
          <ParamSlider label="Mid/High" value={p.midHighFreq} min={500} max={10000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, midHighFreq: v })} />
          <ParamSlider label="Attack" value={p.attackMs} min={0.1} max={100} step={0.1} unit=" ms" onChange={(v) => onChange({ ...p, attackMs: v })} />
          <ParamSlider label="Release" value={p.releaseMs} min={10} max={1000} step={5} unit=" ms" onChange={(v) => onChange({ ...p, releaseMs: v })} />
          {bandEditor("Low", p.low, "low")}
          {bandEditor("Mid", p.mid, "mid")}
          {bandEditor("High", p.high, "high")}
        </>
      );
    }

    case "chorus": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Rate" value={p.rateHz} min={0.05} max={5} step={0.05} unit=" Hz" decimals={2} onChange={(v) => onChange({ ...p, rateHz: v })} />
          <ParamSlider label="Depth" value={p.depthMs} min={0.5} max={15} step={0.5} unit=" ms" onChange={(v) => onChange({ ...p, depthMs: v })} />
          <ParamSlider label="Mix" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "flanger": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Rate" value={p.rateHz} min={0.05} max={5} step={0.05} unit=" Hz" decimals={2} onChange={(v) => onChange({ ...p, rateHz: v })} />
          <ParamSlider label="Depth" value={p.depthMs} min={0.2} max={10} step={0.2} unit=" ms" onChange={(v) => onChange({ ...p, depthMs: v })} />
          <ParamSlider label="Feedback" value={p.feedback * 100} min={0} max={90} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, feedback: v / 100 })} />
          <ParamSlider label="Mix" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "exciter": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Freq" value={p.freq} min={1500} max={12000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...p, freq: v })} />
          <ParamSlider label="Drive" value={p.driveDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...p, driveDb: v })} />
          <ParamSlider label="Mix" value={p.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, mix: v / 100 })} />
        </>
      );
    }

    case "autoPan": {
      const p = effect.params;
      return (
        <>
          <ParamSlider label="Rate" value={p.rateHz} min={0.05} max={8} step={0.05} unit=" Hz" decimals={2} onChange={(v) => onChange({ ...p, rateHz: v })} />
          <ParamSlider label="Depth" value={p.depth * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...p, depth: v / 100 })} />
        </>
      );
    }

    case "stereoWidth": {
      const p = effect.params;
      return (
        <ParamSlider label="Width" value={p.width * 100} min={0} max={200} step={5} unit="%" decimals={0} onChange={(v) => onChange({ ...p, width: v / 100 })} />
      );
    }
  }
}

function EqEditor({ bands, onChange }: { bands: EqBand[]; onChange: (bands: EqBand[]) => void }) {
  function updateBand(id: string, patch: Partial<EqBand>) {
    onChange(bands.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function addBand() {
    onChange([...bands, { id: crypto.randomUUID(), type: "peaking", freq: 1000, gainDb: 0, q: 1, enabled: true }]);
  }
  function removeBand(id: string) {
    onChange(bands.filter((b) => b.id !== id));
  }

  return (
    <div className="space-y-2">
      {bands.map((band) => (
        <div key={band.id} className="rounded border border-neutral-800 p-1.5">
          <div className="mb-1 flex items-center gap-1">
            <input
              type="checkbox"
              checked={band.enabled}
              onChange={(e) => updateBand(band.id, { enabled: e.target.checked })}
            />
            <select
              value={band.type}
              onChange={(e) => updateBand(band.id, { type: e.target.value as EqBand["type"] })}
              className="flex-1 rounded bg-neutral-800 px-1 py-0.5 text-[10px] text-neutral-300"
            >
              <option value="highpass">High-pass</option>
              <option value="lowshelf">Low shelf</option>
              <option value="peaking">Peaking</option>
              <option value="highshelf">High shelf</option>
              <option value="lowpass">Low-pass</option>
            </select>
            <button onClick={() => removeBand(band.id)} className="text-neutral-600 hover:text-red-400">
              ✕
            </button>
          </div>
          <ParamSlider label="Freq" value={band.freq} min={20} max={20000} step={10} unit=" Hz" decimals={0} onChange={(v) => updateBand(band.id, { freq: v })} />
          <ParamSlider label="Gain" value={band.gainDb} min={-24} max={24} step={0.5} unit=" dB" onChange={(v) => updateBand(band.id, { gainDb: v })} />
          <ParamSlider label="Q" value={band.q} min={0.1} max={10} step={0.1} onChange={(v) => updateBand(band.id, { q: v })} />
        </div>
      ))}
      <button
        onClick={addBand}
        className="w-full rounded bg-neutral-800 py-1 text-[10px] text-neutral-300 hover:bg-neutral-700"
      >
        + Add Band
      </button>
    </div>
  );
}
