"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { VocoderEffect } from "@/audio-engine/effects/VocoderEffect";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { VocoderParams } from "@/types/effects";
import { Knob } from "../ui/Knob";
import { SegmentedControl } from "../ui/SegmentedControl";

const WIDTH = 300;
const HEIGHT = 110;

const CARRIER_OPTIONS: { value: VocoderParams["carrierType"]; label: string }[] = [
  { value: "sawtooth", label: "Sierra" },
  { value: "square", label: "Cuadrada" },
];

/**
 * Real-time spectrum of the vocoder's own post-effect output (VocoderEffect's
 * in-series outputAnalyser, same "analyser must sit in the actual signal
 * path" convention as every other effect panel here) - a working vocoder
 * shows a comb of energy at the fixed band centers rather than a smooth
 * envelope, because that's structurally what a bank of bandpass-filtered
 * carrier bands produces. No reference product named in the brief for
 * this mode - reuses the plain "draw the real spectrum" pattern instead
 * of inventing a themed visualization.
 */
export function VocoderPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: VocoderParams;
  onChange: (params: VocoderParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as VocoderEffect | undefined;
    const analyser = typeof node?.getOutputAnalyser === "function" ? node.getOutputAnalyser() : null;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || WIDTH;
    const h = canvas.clientHeight || HEIGHT;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!analyser) return;
    if (!freqRef.current || freqRef.current.length !== analyser.frequencyBinCount) {
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(freqRef.current);
    const data = freqRef.current;

    ctx.strokeStyle = "#f2ede4";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Only the first quarter or so of bins carries the vocoder's relevant
    // range (its bands top out at 6kHz, see VocoderEffect's MAX_HZ) -
    // stretching that slice across the canvas keeps the comb structure
    // visible instead of compressed into the plot's left sliver.
    const usableBins = Math.floor(data.length * 0.3);
    for (let i = 0; i < usableBins; i++) {
      const x = (i / (usableBins - 1)) * w;
      const y = h - (data[i] / 255) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, true);

  return (
    <div className="w-full space-y-2">
      <canvas
        ref={canvasRef}
        style={{ width: WIDTH, height: HEIGHT }}
        className="w-full max-w-full rounded bg-ink"
      />
      <p className="text-[9px] text-bone-3">
        Espectro real de la salida del vocoder - el peine de picos es la estructura de bandas del propio efecto, no
        un adorno.
      </p>

      <SegmentedControl
        value={params.carrierType}
        options={CARRIER_OPTIONS}
        onChange={(carrierType) => onChange({ ...params, carrierType })}
      />

      <div className="flex flex-wrap gap-x-3 gap-y-2">
        <Knob
          value={params.carrierFreqHz}
          min={55}
          max={440}
          defaultValue={110}
          decimals={0}
          unit=" Hz"
          label="Portadora"
          onChange={(v) => onChange({ ...params, carrierFreqHz: v })}
        />
        <Knob
          value={params.mix * 100}
          min={0}
          max={100}
          defaultValue={100}
          decimals={0}
          unit="%"
          label="Mezcla"
          onChange={(v) => onChange({ ...params, mix: v / 100 })}
        />
      </div>
      <p className="text-[9px] text-bone-3">
        La portadora no sigue el tono de quien canta - es una nota fija, como un sintetizador &quot;hablando&quot; a
        través de la voz. Sube &quot;Portadora&quot; para un timbre más agudo/robótico, baja para uno más grave.
      </p>
    </div>
  );
}
