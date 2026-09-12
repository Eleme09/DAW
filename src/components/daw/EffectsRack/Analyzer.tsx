"use client";

import { useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { computeMeanSquare, computePeakDb, computeRmsDb, meanSquareToLufsApprox } from "@/audio-engine/loudness";
import { useRafLoop } from "@/hooks/useRafLoop";

const SPECTRUM_BARS = 48;
const LOUDNESS_SMOOTHING = 0.95; // higher = slower-moving "momentary-ish" reading

export function Analyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const loudnessTimeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const smoothedMeanSquareRef = useRef(0);
  const [peakDb, setPeakDb] = useState(-Infinity);
  const [rmsDb, setRmsDb] = useState(-Infinity);
  const [lufsApprox, setLufsApprox] = useState(-Infinity);

  useRafLoop(() => {
    const engine = getAudioEngine();
    const masterAnalyser = engine.getMasterAnalyser();
    const loudnessAnalyser = engine.getLoudnessAnalyser();
    const canvas = canvasRef.current;
    if (!masterAnalyser || !canvas) return;

    if (!timeDataRef.current || timeDataRef.current.length !== masterAnalyser.fftSize) {
      timeDataRef.current = new Float32Array(masterAnalyser.fftSize);
    }
    if (!freqDataRef.current || freqDataRef.current.length !== masterAnalyser.frequencyBinCount) {
      freqDataRef.current = new Uint8Array(masterAnalyser.frequencyBinCount);
    }
    masterAnalyser.getFloatTimeDomainData(timeDataRef.current);
    masterAnalyser.getByteFrequencyData(freqDataRef.current);

    setPeakDb(computePeakDb(timeDataRef.current));
    setRmsDb(computeRmsDb(timeDataRef.current));

    if (loudnessAnalyser) {
      if (!loudnessTimeDataRef.current || loudnessTimeDataRef.current.length !== loudnessAnalyser.fftSize) {
        loudnessTimeDataRef.current = new Float32Array(loudnessAnalyser.fftSize);
      }
      loudnessAnalyser.getFloatTimeDomainData(loudnessTimeDataRef.current);
      const instantMeanSquare = computeMeanSquare(loudnessTimeDataRef.current);
      smoothedMeanSquareRef.current =
        LOUDNESS_SMOOTHING * smoothedMeanSquareRef.current + (1 - LOUDNESS_SMOOTHING) * instantMeanSquare;
      setLufsApprox(meanSquareToLufsApprox(smoothedMeanSquareRef.current));
    }

    drawSpectrum(canvas, freqDataRef.current);
  }, true);

  return (
    <div className="border-b border-neutral-800 p-2">
      <canvas ref={canvasRef} width={288} height={64} className="block w-full rounded bg-black" />
      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
        <Readout label="Pico" value={peakDb} />
        <Readout label="RMS" value={rmsDb} />
        <Readout label="LUFS (aprox.)" value={lufsApprox} />
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-neutral-900 px-1 py-1">
      <div className="text-neutral-500">{label}</div>
      <div className="tabular-nums text-neutral-200">{Number.isFinite(value) ? value.toFixed(1) : "-∞"}</div>
    </div>
  );
}

function drawSpectrum(canvas: HTMLCanvasElement, freqData: Uint8Array): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const barWidth = width / SPECTRUM_BARS;
  // Log-scale bucketing so low end isn't squeezed into a couple of pixels.
  for (let bar = 0; bar < SPECTRUM_BARS; bar++) {
    const t0 = bar / SPECTRUM_BARS;
    const t1 = (bar + 1) / SPECTRUM_BARS;
    const startBin = Math.floor(Math.pow(t0, 2) * freqData.length);
    const endBin = Math.max(startBin + 1, Math.floor(Math.pow(t1, 2) * freqData.length));
    let sum = 0;
    let count = 0;
    for (let i = startBin; i < endBin && i < freqData.length; i++) {
      sum += freqData[i];
      count++;
    }
    const avg = count > 0 ? sum / count : 0;
    const barHeight = (avg / 255) * height;
    ctx.fillStyle = "#f2ede4";
    ctx.fillRect(bar * barWidth, height - barHeight, barWidth - 1, barHeight);
  }
}
