import { bounceProject } from "@/audio-engine/bounce";
import { computeIntegratedLufs } from "@/audio-engine/bs1770";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { listSampleAssets } from "@/lib/storage/sampleIndex";
import { sampleOrigin } from "@/lib/storage/sampleUsage";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { AudioClip, Project, Track } from "@/types/project";
import type { TrackFacts } from "./autoMix";

/** Window measured per track: its loudest 20 s are enough to know its level. */
const WINDOW_SEC = 20;

interface Scan {
  window: [number, number] | null;
  active: number[];
  lowRatio: number;
  silentRatio: number;
  stereo: boolean;
}

/** One pass over the track's audio (decimated): energy per second along the
 * timeline (for the window), the share under 150 Hz, the share of near-
 * silent 50 ms blocks, and whether the two channels really differ. */
function scanTrack(track: Track, buffers: Map<string, AudioBuffer>): Scan {
  const perSec = new Map<number, number>();
  const blocks: number[] = [];
  let total = 0;
  let low = 0;
  let diff = 0;
  let sum = 0;
  for (const c of track.clips) {
    if (c.muted) continue;
    const b = buffers.get(c.sampleId);
    if (!b) continue;
    const sr = b.sampleRate;
    const step = 4;
    const L = b.getChannelData(0);
    const R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
    const from = Math.floor(c.sourceOffset * sr);
    const to = Math.min(L.length, from + Math.floor(c.duration * sr));
    const a = 1 - Math.exp((-2 * Math.PI * 150 * step) / sr);
    let lp = 0;
    let blockE = 0;
    let blockN = 0;
    const blockLen = Math.round((0.05 * sr) / step);
    for (let i = from; i < to; i += step) {
      const m = 0.5 * (L[i] + R[i]);
      lp += (m - lp) * a;
      const e = m * m;
      total += e;
      low += lp * lp;
      const d = L[i] - R[i];
      diff += d * d;
      sum += L[i] * L[i] + R[i] * R[i];
      blockE += e;
      if (++blockN >= blockLen) {
        blocks.push(blockE / blockN);
        blockE = 0;
        blockN = 0;
      }
      const sec = Math.floor(c.startTime + (i - from) / sr);
      perSec.set(sec, (perSec.get(sec) ?? 0) + e);
    }
  }
  let window: [number, number] | null = null;
  if (perSec.size > 0) {
    const secs = [...perSec.keys()].sort((x, y) => x - y);
    let best = -1;
    for (const s0 of secs) {
      let e = 0;
      for (let s = s0; s < s0 + WINDOW_SEC; s++) e += perSec.get(s) ?? 0;
      if (e > best) {
        best = e;
        window = [s0, s0 + WINDOW_SEC];
      }
    }
  }
  const secE = [...perSec.values()].sort((x, y) => x - y);
  const loudSec = secE.length ? secE[Math.floor(secE.length * 0.95)] : 0;
  const active = [...perSec.entries()].filter(([, e]) => e > loudSec * 1e-3).map(([sec]) => sec).sort((x, y) => x - y);
  const sorted = [...blocks].sort((x, y) => x - y);
  const loud = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  const silent = blocks.filter((e) => e < loud * Math.pow(10, -3.5)).length;
  return {
    window,
    active,
    lowRatio: total > 0 ? low / total : 0,
    silentRatio: blocks.length ? silent / blocks.length : 0,
    stereo: sum > 0 && diff / sum > 0.02,
  };
}

/** The track alone (fader 0 dB, centre, no sends/automation), cropped to
 * [w0, w1] and moved to time 0: renders its real chain (AutoPitch + Fx). */
function soloProject(project: Project, track: Track, w0: number, w1: number): Project {
  const clips: AudioClip[] = [];
  for (const c of track.clips) {
    if (c.muted) continue;
    const s = Math.max(c.startTime, w0);
    const e = Math.min(c.startTime + c.duration, w1);
    if (e <= s) continue;
    clips.push({ ...c, startTime: s - w0, sourceOffset: c.sourceOffset + (s - c.startTime), duration: e - s, fadeInSec: 0, fadeOutSec: 0 });
  }
  const automation = {
    ...track.automation,
    volume: { ...track.automation.volume, enabled: false },
    pan: { ...track.automation.pan, enabled: false },
  };
  return {
    ...project,
    tracks: [{ ...track, clips, volumeDb: 0, pan: 0, muted: false, solo: false, sends: [], automation, order: 0 }],
    buses: [],
    masterInserts: [],
    masterVolumeDb: 0,
  };
}

function stereoLufs(buffer: AudioBuffer): number | null {
  const per: number[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const l = computeIntegratedLufs(buffer.getChannelData(ch), buffer.sampleRate);
    if (Number.isFinite(l)) per.push(l);
  }
  if (per.length === 0) return null;
  // BS.1770: channel powers add
  return 10 * Math.log10(per.reduce((s, l) => s + Math.pow(10, l / 10), 0));
}

/** Measures every track (through its own chain) for the Automezcla. */
export async function measureTracks(project: Project, onProgress?: (done: number, total: number) => void): Promise<Map<string, TrackFacts>> {
  const assets = new Map((await listSampleAssets()).map((a) => [a.id, a]));
  const facts = new Map<string, TrackFacts>();
  const tracks = project.tracks.filter((t) => t.clips.some((c) => !c.muted));
  const getBuffer = (id: string) => getAudioEngine().getBuffer(id);
  let done = 0;
  for (const track of tracks) {
    const buffers = new Map<string, AudioBuffer>();
    let recordedSec = 0;
    let seconds = 0;
    for (const c of track.clips) {
      if (c.muted) continue;
      const buffer = await ensureSampleLoaded(c.sampleId);
      if (buffer) buffers.set(c.sampleId, buffer);
      seconds += c.duration;
      const asset = assets.get(c.sampleId);
      if (asset && sampleOrigin(asset) === "recording") recordedSec += c.duration;
    }
    const scan = scanTrack(track, buffers);
    let lufs: number | null = null;
    if (scan.window) {
      try {
        const rendered = await bounceProject(soloProject(project, track, scan.window[0], scan.window[1]), getBuffer);
        lufs = stereoLufs(rendered);
      } catch {
        lufs = null;
      }
    }
    facts.set(track.id, {
      trackId: track.id,
      lufs,
      stereo: scan.stereo,
      seconds,
      recorded: recordedSec > seconds / 2,
      lowRatio: scan.lowRatio,
      silentRatio: scan.silentRatio,
      active: scan.active,
    });
    onProgress?.(++done, tracks.length);
  }
  return facts;
}
