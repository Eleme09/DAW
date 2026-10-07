import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { perfJobsActive, perfLastAction, perfLog, perfLogClear, setPerfContext, setPerfLogOn } from "./perfLog";
import { workletProfiler } from "./workletProfiler";

/**
 * Performance diagnostic for a real phone (Ajustes > Rendimiento): runs in
 * the background while the user records and plays, and counts
 *  - audio falling behind: the audio clock advancing less than the real
 *    clock while the context runs. When the audio thread can't finish its
 *    work in time the sound drops out and its clock slips - an estimate:
 *    how faithfully each browser's clock reflects a dropout isn't verified
 *    (checked against an artificial overload in Chromium only);
 *  - the screen freezing: animation frames that took over 50 / 200 ms;
 *  - what each audio processor really costs on this device (workletProfiler);
 *  - an event log: each cut / freeze with the time and what the app was
 *    doing (see perfLog).
 * Off by default; the switch is remembered on the device.
 */

const STORAGE_KEY = "daw.perfMonitor";
const AUDIO_TICK_MS = 500;
/** Slips smaller than this are the clock's own granularity, not a dropout. */
const DROP_MIN_MS = 30;
/** Cuts and freezes this long get their own line in the event log. */
const DROP_LOG_MS = 60;
const FREEZE_LOG_MS = 200;

export interface PerfCounters {
  since: number; // performance.now() when counting (re)started
  audioRunningSec: number;
  audioDrops: number;
  audioLostMs: number;
  worstDropMs: number;
  frames: number;
  slowFrames: number; // > 50 ms
  frozenFrames: number; // > 200 ms
  worstFrameMs: number;
}

function zero(): PerfCounters {
  return { since: performance.now(), audioRunningSec: 0, audioDrops: 0, audioLostMs: 0, worstDropMs: 0, frames: 0, slowFrames: 0, frozenFrames: 0, worstFrameMs: 0 };
}

/** What the app is doing right now, in words, for the event log. */
function describeNow(): string {
  const engine = getAudioEngine();
  const state = engine.isRecording() ? "grabando" : engine.isPlaying() ? "sonando" : "parado";
  const jobs = perfJobsActive();
  const last = perfLastAction();
  const parts = [state];
  if (jobs.length) parts.push(`trabajando: ${jobs.join(", ")}`);
  if (last && last.agoMs < 5000) parts.push(`${last.kind} hace ${(last.agoMs / 1000).toFixed(1)} s`);
  return parts.join(" · ");
}

class PerfMonitor {
  private c: PerfCounters = zero();
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private lastWall = 0;
  private lastCtx = 0;
  private lastFrame = 0;

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null || typeof window === "undefined") return;
    setPerfContext(describeNow);
    setPerfLogOn(true);
    workletProfiler.setEnabled(true);
    this.timer = setInterval(() => this.tickAudio(), AUDIO_TICK_MS);
    this.watchSystem();
    const frame = (t: number) => {
      if (this.lastFrame && document.visibilityState === "visible") {
        const dt = t - this.lastFrame;
        this.c.frames++;
        if (dt > 50) this.c.slowFrames++;
        if (dt > FREEZE_LOG_MS) {
          this.c.frozenFrames++;
          perfLog("pantalla", `congelada ${Math.round(dt)} ms`);
        }
        if (dt > this.c.worstFrameMs) this.c.worstFrameMs = dt;
      }
      this.lastFrame = t;
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private systemWatched = false;

  /** iOS's own word on the audio (interrupted by a call, Siri, another app...)
   * and the page going to the background, in the event log. */
  private watchSystem(): void {
    if (this.systemWatched) return;
    this.systemWatched = true;
    document.addEventListener("visibilitychange", () => perfLog("estado", `página ${document.visibilityState}`));
    const session = (navigator as unknown as { audioSession?: EventTarget & { state?: string } }).audioSession;
    session?.addEventListener("statechange", () => perfLog("estado", `sesión de audio del sistema: ${session.state ?? "?"}`));
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.raf);
    this.lastFrame = 0;
    this.lastWall = 0;
    setPerfLogOn(false);
    workletProfiler.setEnabled(false);
  }

  reset(): void {
    this.c = zero();
    this.lastWall = 0;
    this.lastFrame = 0;
    perfLogClear();
    workletProfiler.reset();
  }

  counters(): PerfCounters {
    return { ...this.c };
  }

  private tickAudio(): void {
    const ctx = getAudioEngine().getContext();
    const now = performance.now();
    if (!ctx || ctx.state !== "running" || document.visibilityState !== "visible") {
      this.lastWall = 0;
      return;
    }
    const ct = ctx.currentTime * 1000;
    if (this.lastWall) {
      const dWall = now - this.lastWall;
      const lost = dWall - (ct - this.lastCtx);
      this.c.audioRunningSec += dWall / 1000;
      if (lost > DROP_MIN_MS) {
        this.c.audioDrops++;
        this.c.audioLostMs += lost;
        if (lost > this.c.worstDropMs) this.c.worstDropMs = lost;
        if (lost >= DROP_LOG_MS) perfLog("corte", `${Math.round(lost)} ms`);
      }
    }
    this.lastWall = now;
    this.lastCtx = ct;
  }
}

export const perfMonitor = new PerfMonitor();

export function perfMonitorEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPerfMonitorEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode: works until the page closes
  }
  if (on) perfMonitor.start();
  else perfMonitor.stop();
}
