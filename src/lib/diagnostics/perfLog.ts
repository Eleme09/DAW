/**
 * The performance diagnostic's event log (Ajustes > Rendimiento): what the
 * user did and what the app was busy with, with the time, so that a report
 * can say "the audio cut out 2 s after the preset was applied while an
 * offline render was running" instead of only counting cuts. No imports on
 * purpose: the audio engine and the stores write to it, so it must not
 * depend on either.
 */

export interface PerfEvent {
  /** performance.now() when it happened. */
  at: number;
  kind: string;
  detail: string;
  /** What the app was doing then (transport + background jobs). */
  note: string;
  /** Times it repeated within COALESCE_MS (a scrub, a knob). */
  count: number;
}

const MAX_EVENTS = 80;
const COALESCE_MS = 600;

let on = false;
let events: PerfEvent[] = [];
const jobs = new Map<string, number>();
let describe: () => string = () => "";

/** Recording happens only while the diagnostic switch is on. */
export function setPerfLogOn(value: boolean): void {
  on = value;
}

/** The monitor says how to describe "what the app is doing" (playing,
 * recording, jobs); the log can't ask the engine itself. */
export function setPerfContext(fn: () => string): void {
  describe = fn;
}

export function perfLog(kind: string, detail = ""): void {
  if (!on) return;
  const now = performance.now();
  const last = events[events.length - 1];
  if (last && last.kind === kind && last.detail === detail && now - last.at < COALESCE_MS) {
    last.count++;
    last.at = now;
    return;
  }
  events.push({ at: now, kind, detail, note: describe(), count: 1 });
  if (events.length > MAX_EVENTS) events.shift();
}

/** Marks a heavy background job (an offline render, decoding audio) as
 * running or finished. Always counted - jobs are cheap to track - so an
 * event can say what was going on. Returns a function that ends it. */
export function perfJob(name: string): () => void {
  jobs.set(name, (jobs.get(name) ?? 0) + 1);
  perfLog("trabajo", `${name} empieza`);
  const started = performance.now();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    jobs.set(name, Math.max(0, (jobs.get(name) ?? 1) - 1));
    perfLog("trabajo", `${name} termina (${Math.round(performance.now() - started)} ms)`);
  };
}

export function perfJobsActive(): string[] {
  return [...jobs].filter(([, n]) => n > 0).map(([name]) => name);
}

export function perfEvents(): PerfEvent[] {
  return events.map((e) => ({ ...e }));
}

/** The latest event that is something the user did (not a symptom or a job). */
export function perfLastAction(): { kind: string; detail: string; agoMs: number } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind !== "corte" && e.kind !== "pantalla" && e.kind !== "trabajo" && e.kind !== "estado") {
      return { kind: e.kind, detail: e.detail, agoMs: performance.now() - e.at };
    }
  }
  return null;
}

export function perfLogClear(): void {
  events = [];
}
