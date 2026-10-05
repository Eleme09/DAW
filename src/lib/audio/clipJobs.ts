import type { PitchFrame, ScaleName } from "@/types/pitch";

/**
 * Messages between the app and clipWorker.ts. The heavy region actions
 * (key detection, harmonies, transpose, time-stretch, noise removal) run in a
 * Web Worker so the screen never freezes and "cancel" can really stop them
 * (the worker is terminated).
 */

export type ClipJob =
  | { kind: "analyze"; mono: Float32Array; sampleRate: number }
  | {
      kind: "harmony";
      mono: Float32Array;
      sampleRate: number;
      key: number;
      scale: ScaleName;
      /** The pitch track from "analyze"; analysed here when missing. */
      frames?: PitchFrame[];
      steps: number[];
      humanize: boolean;
    }
  | { kind: "transpose"; channels: Float32Array[]; sampleRate: number; semitones: number }
  | { kind: "stretch"; channels: Float32Array[]; sampleRate: number; speed: number }
  | { kind: "denoise"; channels: Float32Array[]; sampleRate: number };

export type ClipJobResult =
  | { kind: "analyze"; frames: PitchFrame[]; key: number; scale: ScaleName; detected: boolean }
  | { kind: "channels"; channels: Float32Array[] };

export type WorkerMessage =
  | { type: "progress"; fraction: number }
  | { type: "done"; result: ClipJobResult }
  | { type: "error"; message: string };

/** Buffers to hand over to the worker instead of copying. */
export function transferListFor(job: ClipJob): Transferable[] {
  if (job.kind === "analyze" || job.kind === "harmony") return [job.mono.buffer];
  return job.channels.map((c) => c.buffer);
}
