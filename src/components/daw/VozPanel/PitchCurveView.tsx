"use client";

import { useEffect, useRef } from "react";
import { frequencyToMidi, nearestScaleMidi } from "@/audio-engine/pitch/noteUtils";
import { NOTE_NAMES, type DetectedKeyResult, type PitchFrame } from "@/types/pitch";

interface PitchCurveViewProps {
  frames: PitchFrame[];
  durationSec: number;
  detectedKey: DetectedKeyResult;
  color: string;
  width: number;
  height?: number;
  /** Seconds into this take the transport is currently at, or null when
   * outside its range - a real position marker (tied to actual playback),
   * not the decorative fixed line the design mock uses. */
  playheadSec: number | null;
}

const VOICED_CONFIDENCE_MIN = 0.5;
/** Caps how many semitone rows get drawn for a take with a very wide range,
 * so one wild note doesn't squash every other row unreadably thin. */
const MAX_ROWS = 14;

function noteLabel(midi: number): string {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

/** Real pitch-vs-key curve for a single take: the YIN-detected pitch per
 * analysis frame, drawn over rows for the semitones it actually touched
 * (labeled by note name), with a faint scale-snapped target and gaps left
 * wherever the take was unvoiced - no interpolating over silence, no
 * synthesized curve when detection found nothing. */
export function PitchCurveView({ frames, durationSec, detectedKey, color, width, height = 126, playheadSec }: PitchCurveViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, width * dpr);
    canvas.height = Math.max(1, height * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const voiced = frames.filter(
      (f): f is PitchFrame & { frequencyHz: number } => f.frequencyHz !== null && f.confidence >= VOICED_CONFIDENCE_MIN
    );

    if (voiced.length === 0) {
      ctx.fillStyle = "#5E5B57";
      ctx.font = "10px 'DM Mono', monospace";
      ctx.fillText("Sin tono detectable en esta toma", 10, height / 2);
      return;
    }

    const midis = voiced.map((f) => frequencyToMidi(f.frequencyHz));
    let minMidi = Math.floor(Math.min(...midis)) - 1;
    let maxMidi = Math.ceil(Math.max(...midis)) + 1;
    if (maxMidi - minMidi + 1 > MAX_ROWS) {
      const mid = (minMidi + maxMidi) / 2;
      minMidi = Math.floor(mid - MAX_ROWS / 2);
      maxMidi = Math.ceil(mid + MAX_ROWS / 2);
    }
    const rowCount = maxMidi - minMidi + 1;
    const rowHeight = height / rowCount;
    const midiToY = (midi: number) => height - (midi - minMidi) * rowHeight - rowHeight / 2;
    const timeToX = (t: number) => (durationSec > 0 ? (t / durationSec) * width : 0);

    for (let i = 0; i < rowCount; i++) {
      const midi = minMidi + i;
      const y = height - (i + 1) * rowHeight;
      ctx.fillStyle = i % 2 === 0 ? "#0C0C0E" : "#131316";
      ctx.fillRect(0, y, width, rowHeight);
      ctx.fillStyle = "#5E5B57";
      ctx.font = "9px 'DM Mono', monospace";
      ctx.fillText(noteLabel(midi), 4, y + rowHeight / 2 + 3);
    }

    // Scale-snapped target, faint - derived from the actual detected key
    // and the actually-sung pitch of each frame, not filler.
    const scaleName = detectedKey.scale === "minor" ? "naturalMinor" : "major";
    const segWidth = Math.max(2, width / frames.length);
    ctx.fillStyle = color + "22";
    for (const f of voiced) {
      const targetMidi = nearestScaleMidi(frequencyToMidi(f.frequencyHz), detectedKey.key, scaleName);
      ctx.fillRect(timeToX(f.timeSec), midiToY(targetMidi) - rowHeight / 2, segWidth, rowHeight);
    }

    // Sung curve - breaks the path at every unvoiced gap instead of
    // interpolating a fake connection across it.
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let drawing = false;
    for (const f of frames) {
      if (f.frequencyHz === null || f.confidence < VOICED_CONFIDENCE_MIN) {
        drawing = false;
        continue;
      }
      const x = timeToX(f.timeSec);
      const y = midiToY(frequencyToMidi(f.frequencyHz));
      if (drawing) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        drawing = true;
      }
    }
    ctx.stroke();

    if (playheadSec !== null && playheadSec >= 0 && playheadSec <= durationSec) {
      ctx.strokeStyle = "#F2EDE4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = timeToX(playheadSec);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [frames, durationSec, detectedKey, color, width, height, playheadSec]);

  return (
    <div className="relative border-b border-line" style={{ height, background: "#0C0C0E" }}>
      <canvas ref={canvasRef} style={{ width, height }} className="block" />
      <div className="pointer-events-none absolute right-2.5 top-2 font-mono text-[9.5px] tracking-wide text-bone-3">
        AFINACIÓN
      </div>
    </div>
  );
}
