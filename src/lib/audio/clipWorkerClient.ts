import { transferListFor, type ClipJob, type ClipJobResult, type WorkerMessage } from "./clipJobs";

export interface JobOptions {
  /** Aborting terminates the worker at once - the job really stops. */
  signal?: AbortSignal;
  /** 0..1 when the job can tell how far along it is. */
  onProgress?: (fraction: number) => void;
}

export function abortError(): DOMException {
  return new DOMException("Cancelado", "AbortError");
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Runs `job` in a fresh worker (one per job, so cancelling never leaves a
 * half-finished worker behind). Rejects with an AbortError when cancelled. */
export function runClipJob(job: ClipJob, options: JobOptions = {}): Promise<ClipJobResult> {
  return new Promise((resolve, reject) => {
    const { signal, onProgress } = options;
    if (signal?.aborted) return reject(abortError());

    let worker: Worker;
    try {
      worker = new Worker(new URL("./clipWorker.ts", import.meta.url));
    } catch {
      return reject(new Error("Este navegador no puede procesar audio en segundo plano"));
    }

    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.(message.fraction);
      } else if (message.type === "done") {
        finish();
        resolve(message.result);
      } else {
        finish();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "No se pudo procesar el audio"));
    };

    worker.postMessage(job, transferListFor(job));
  });
}
