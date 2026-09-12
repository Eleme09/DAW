"use client";

import { useCallback } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { WEB_AUDIO_FILTER_TYPE } from "@/audio-engine/effects/EqEffect";
import { CurveEditor, type CurvePoint } from "../ui/CurveEditor";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Knob } from "../ui/Knob";
import type { EqBand } from "@/types/effects";

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GAIN_MIN = -24;
const GAIN_MAX = 24;
const WIDTH = 300;
const HEIGHT = 170;
const RESPONSE_STEPS = 100;
const SPECTRUM_BARS = 40;

const TYPE_OPTIONS: { value: EqBand["type"]; label: string }[] = [
  { value: "highpass", label: "HP" },
  { value: "lowshelf", label: "LS" },
  { value: "peaking", label: "PK" },
  { value: "highshelf", label: "HS" },
  { value: "lowpass", label: "LP" },
];

function freqToX(freq: number): number {
  return Math.log10(freq / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN);
}
function xToFreq(x: number): number {
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, Math.min(1, Math.max(0, x)));
}
function gainToY(db: number): number {
  return (db - GAIN_MIN) / (GAIN_MAX - GAIN_MIN);
}
function yToGain(y: number): number {
  return GAIN_MIN + Math.min(1, Math.max(0, y)) * (GAIN_MAX - GAIN_MIN);
}

/** Real EQ visualization: a live spectrum analyzer, the exact combined
 * frequency response (computed via real BiquadFilterNode.getFrequencyResponse
 * - not an approximation, the same math Web Audio applies to the actual
 * signal), and draggable band nodes on a canvas - replacing the old
 * checkbox + native select + three sliders per band. Per PROMPT_MAESTRO
 * FASE 9 section 4's EQ spec. */
export function EqPanel({ bands, onChange }: { bands: EqBand[]; onChange: (bands: EqBand[]) => void }) {
  const drawBackground = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const engine = getAudioEngine();
      const audioCtx = engine.getContext();

      // Spectrum analyzer backdrop (master - the closest live signal
      // available in this context; a per-insert-point tap isn't wired here).
      const analyser = engine.getMasterAnalyser();
      if (analyser) {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);
        const nyquist = (audioCtx?.sampleRate ?? 44100) / 2;
        ctx.fillStyle = "rgba(34,211,238,0.12)";
        for (let bar = 0; bar < SPECTRUM_BARS; bar++) {
          const f0 = xToFreq(bar / SPECTRUM_BARS);
          const f1 = xToFreq((bar + 1) / SPECTRUM_BARS);
          const bin0 = Math.floor((f0 / nyquist) * freqData.length);
          const bin1 = Math.max(bin0 + 1, Math.floor((f1 / nyquist) * freqData.length));
          let sum = 0;
          let count = 0;
          for (let i = bin0; i < bin1 && i < freqData.length; i++) {
            sum += freqData[i];
            count++;
          }
          const avg = count > 0 ? sum / count : 0;
          const barH = (avg / 255) * height;
          const x0 = (bar / SPECTRUM_BARS) * width;
          const x1 = ((bar + 1) / SPECTRUM_BARS) * width;
          ctx.fillRect(x0, height - barH, Math.max(1, x1 - x0 - 1), barH);
        }
      }

      // Frequency grid (log-spaced).
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "9px monospace";
      for (const f of [100, 1000, 10000]) {
        const x = freqToX(f) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, height - 2);
      }
      // dB grid.
      for (const db of [-12, 0, 12]) {
        const y = height - gainToY(db) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.strokeStyle = db === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)";
        ctx.stroke();
        ctx.fillText(`${db > 0 ? "+" : ""}${db}`, 2, y - 2);
      }

      // Exact combined response, via real BiquadFilterNode math.
      if (audioCtx) {
        const freqs = new Float32Array(RESPONSE_STEPS);
        for (let i = 0; i < RESPONSE_STEPS; i++) freqs[i] = xToFreq(i / (RESPONSE_STEPS - 1));
        const totalDb = new Float32Array(RESPONSE_STEPS);
        const magOut = new Float32Array(RESPONSE_STEPS);
        const phaseOut = new Float32Array(RESPONSE_STEPS);
        for (const band of bands) {
          if (!band.enabled) continue;
          const filter = audioCtx.createBiquadFilter();
          filter.type = WEB_AUDIO_FILTER_TYPE[band.type];
          filter.frequency.value = band.freq;
          filter.Q.value = band.q;
          filter.gain.value = band.gainDb;
          filter.getFrequencyResponse(freqs, magOut, phaseOut);
          for (let i = 0; i < RESPONSE_STEPS; i++) totalDb[i] += 20 * Math.log10(Math.max(1e-6, magOut[i]));
        }
        ctx.beginPath();
        for (let i = 0; i < RESPONSE_STEPS; i++) {
          const x = (i / (RESPONSE_STEPS - 1)) * width;
          const y = height - gainToY(totalDb[i]) * height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    },
    [bands]
  );

  const points: CurvePoint[] = bands.map((b) => ({ id: b.id, x: freqToX(b.freq), y: gainToY(b.gainDb) }));

  function handlePointsChange(next: CurvePoint[]) {
    onChange(
      bands.map((b) => {
        const p = next.find((n) => n.id === b.id);
        return p ? { ...b, freq: Math.round(xToFreq(p.x)), gainDb: Math.round(yToGain(p.y) * 10) / 10 } : b;
      })
    );
  }

  function handleAddPoint(x: number, y: number) {
    onChange([
      ...bands,
      { id: crypto.randomUUID(), type: "peaking", freq: Math.round(xToFreq(x)), gainDb: Math.round(yToGain(y) * 10) / 10, q: 1, enabled: true },
    ]);
  }

  function handleRemovePoint(id: string) {
    onChange(bands.filter((b) => b.id !== id));
  }

  function updateBand(id: string, patch: Partial<EqBand>) {
    onChange(bands.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  return (
    <div className="space-y-2">
      <CurveEditor
        width={WIDTH}
        height={HEIGHT}
        points={points}
        onPointsChange={handlePointsChange}
        onAddPoint={handleAddPoint}
        onRemovePoint={handleRemovePoint}
        drawBackground={drawBackground}
        drawCurve={false}
      />
      <p className="text-[9px] text-neutral-600">Double-tap to add a band, drag a node off the graph to remove it.</p>
      <div className="space-y-2">
        {bands.map((band) => (
          <div key={band.id} className="space-y-1.5 rounded border border-neutral-800 p-1.5">
            <SegmentedControl value={band.type} options={TYPE_OPTIONS} onChange={(type) => updateBand(band.id, { type })} />
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateBand(band.id, { enabled: !band.enabled })}
                title={band.enabled ? "Disable band" : "Enable band"}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                  band.enabled ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-500"
                }`}
              >
                {band.enabled ? "ON" : "OFF"}
              </button>
              <Knob value={band.q} min={0.1} max={10} defaultValue={1} decimals={1} label="Q" size={36} onChange={(q) => updateBand(band.id, { q })} />
              <button
                onClick={() => handleRemovePoint(band.id)}
                title="Remove band"
                className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded text-neutral-600 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
