/// <reference lib="webworker" />
import { analyzeMelody, renderHarmonyChannels } from "@/audio-engine/pitch/harmonyJob";
import { pitchShift, timeStretch } from "@/audio-engine/timeStretch";
import { reduceNoiseBuffer } from "@/audio-engine/analysis/spectralNoiseReduction";
import type { ClipJob, WorkerMessage } from "./clipJobs";

/**
 * Runs one region job off the main thread (see clipJobs.ts). It only does
 * numbers - no storage, no AudioContext - and the app cancels it simply by
 * terminating the worker.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

function send(message: WorkerMessage, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

scope.onmessage = (event: MessageEvent<ClipJob>) => {
  const job = event.data;
  try {
    switch (job.kind) {
      case "analyze": {
        const analysis = analyzeMelody(job.mono, job.sampleRate, { onProgress: (fraction) => send({ type: "progress", fraction }) });
        send({ type: "done", result: { kind: "analyze", ...analysis } });
        break;
      }
      case "harmony": {
        let frames = job.frames;
        const analysisShare = frames ? 0 : 0.7;
        if (!frames) {
          frames = analyzeMelody(job.mono, job.sampleRate, {
            onProgress: (fraction) => send({ type: "progress", fraction: fraction * analysisShare }),
          }).frames;
        }
        const channels = renderHarmonyChannels(job.mono, job.sampleRate, job.key, job.scale, frames, job.steps, job.humanize, {
          onProgress: (fraction) => send({ type: "progress", fraction: analysisShare + fraction * (1 - analysisShare) }),
        });
        send({ type: "done", result: { kind: "channels", channels } }, channels.map((c) => c.buffer));
        break;
      }
      case "transpose": {
        const channels = pitchShift(job.channels, job.sampleRate, job.semitones);
        send({ type: "done", result: { kind: "channels", channels } }, channels.map((c) => c.buffer));
        break;
      }
      case "stretch": {
        const channels = timeStretch(job.channels, job.sampleRate, job.speed);
        send({ type: "done", result: { kind: "channels", channels } }, channels.map((c) => c.buffer));
        break;
      }
      case "denoise": {
        const channels = reduceNoiseBuffer(job.channels, { strength: 0.6 });
        send({ type: "done", result: { kind: "channels", channels } }, channels.map((c) => c.buffer));
        break;
      }
    }
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : "No se pudo procesar" });
  }
};
