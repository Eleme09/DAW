import { bounceProject } from "@/audio-engine/bounce";
import { renderMastering } from "@/audio-engine/mastering/renderMastering";
import { stereoLufs } from "@/lib/mix/measureMix";
import type { AudioClip, MasteringSettings, Project } from "@/types/project";
import { MIX_REF_LUFS, targetLufsOf } from "./masterChain";

/** The part of the song measured: its loudest 12 s (a chorus, usually).
 * Long enough for a stable loudness, short enough to render fast: the
 * session's Núcleo and Fx render at ~3x real time on a desktop. */
const WINDOW_SEC = 12;

/** Loudest WINDOW_SEC of the whole mix, from the raw clips weighted by
 * their faders (decimated pass, no effects - only to pick the window). */
export function loudestWindow(project: Project, getBuffer: (id: string) => AudioBuffer | undefined): [number, number] {
  const perSec = new Map<number, number>();
  let end = 0;
  for (const t of project.tracks) {
    if (t.muted) continue;
    const fader = Math.pow(10, t.volumeDb / 10);
    for (const c of t.clips) {
      if (c.muted) continue;
      end = Math.max(end, c.startTime + c.duration);
      const b = getBuffer(c.sampleId);
      if (!b) continue;
      const sr = b.sampleRate;
      const L = b.getChannelData(0);
      const from = Math.floor(c.sourceOffset * sr);
      const to = Math.min(L.length, from + Math.floor(c.duration * sr));
      const w = fader * Math.pow(10, c.gainDb / 10);
      for (let i = from; i < to; i += 16) {
        const sec = Math.floor(c.startTime + (i - from) / sr);
        perSec.set(sec, (perSec.get(sec) ?? 0) + L[i] * L[i] * w);
      }
    }
  }
  if (end <= WINDOW_SEC) return [0, Math.max(1, end)];
  let best = -1;
  let start = 0;
  for (let s0 = 0; s0 + WINDOW_SEC <= Math.ceil(end); s0++) {
    let e = 0;
    for (let s = s0; s < s0 + WINDOW_SEC; s++) e += perSec.get(s) ?? 0;
    if (e > best) {
      best = e;
      start = s0;
    }
  }
  return [start, start + WINDOW_SEC];
}

/** The whole session cropped to [w0, w1] and moved to time 0 (automation
 * off: it is only for measuring). */
export function cropProject(project: Project, w0: number, w1: number): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) => {
      const clips: AudioClip[] = [];
      for (const c of t.clips) {
        const s = Math.max(c.startTime, w0);
        const e = Math.min(c.startTime + c.duration, w1);
        if (e <= s) continue;
        clips.push({ ...c, startTime: s - w0, sourceOffset: c.sourceOffset + (s - c.startTime), duration: e - s, fadeInSec: 0, fadeOutSec: 0 });
      }
      return {
        ...t,
        clips,
        automation: { ...t.automation, volume: { ...t.automation.volume, enabled: false }, pan: { ...t.automation.pan, enabled: false } },
      };
    }),
    masterVolumeDb: 0,
  };
}

function peakDb(b: AudioBuffer): number {
  let p = 0;
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = d[i] < 0 ? -d[i] : d[i];
      if (v > p) p = v;
    }
  }
  return p > 0 ? 20 * Math.log10(p) : -120;
}

export interface MasterMeasurement {
  inputGainDb: number;
  driveDb: number;
  measured: NonNullable<MasteringSettings["measured"]>;
}

/** The rendered mix of the measured window, kept while the session doesn't
 * change: changing the style, tone or target then only re-renders the
 * master (cheap), not every track. */
export interface DryMixCache {
  key: string;
  dry: AudioBuffer;
  mixLufs: number;
}

/** What the dry mix depends on (everything but the mastering). */
export function dryMixKey(project: Project): string {
  return JSON.stringify([project.tracks, project.buses, project.masterInserts]);
}

/**
 * Sets the mastering's input gain (so the mix enters at MIX_REF_LUFS) and
 * the limiter push (so the loudest part lands on the target), by rendering
 * the loudest 12 s offline: the session once without mastering (reused from
 * `cache` while the session is the same), then that mix through the master
 * alone: once without push, once with the estimated push, and up to two
 * corrections while it misses by 0.3 LU or more. Null when nothing sounds.
 */
export async function measureMaster(
  project: Project,
  settings: MasteringSettings,
  getBuffer: (id: string) => AudioBuffer | undefined,
  cache?: { current: DryMixCache | null }
): Promise<MasterMeasurement | null> {
  const key = dryMixKey(project);
  let entry = cache?.current && cache.current.key === key ? cache.current : null;
  if (!entry) {
    const [w0, w1] = loudestWindow(project, getBuffer);
    const dry = await bounceProject({ ...cropProject(project, w0, w1), mastering: undefined }, getBuffer);
    const mixLufs = stereoLufs(dry);
    if (mixLufs === null || mixLufs < -70) return null;
    entry = { key, dry, mixLufs };
    if (cache) cache.current = entry;
  }
  const { dry, mixLufs } = entry;
  const inputGainDb = Math.round((MIX_REF_LUFS - mixLufs) * 10) / 10;
  const target = targetLufsOf(settings);
  const render = async (drive: number) => {
    const wet = await renderMastering(dry, { ...settings, enabled: true, inputGainDb, driveDb: drive });
    return { lufs: stereoLufs(wet) ?? -70, peak: peakDb(wet) };
  };
  // 1) no push: the loudness the chain itself leaves (styles differ by
  //    several LU - a saturated one comes out louder)
  const pre = await render(0);
  // 2) push by the gap, plus what the limiter keeps for itself (calibrated
  //    on real songs: ~12 % of the push near the targets)
  let driveDb = Math.min(24, Math.max(0, (target - pre.lufs) * 1.12));
  let out = await render(driveDb);
  // 3) corrections with the slope measured between the last two renders,
  //    steeper near the target where the limiter works harder (a second
  //    one only when still 0.4 LU off: the loudest target, where the
  //    limiter gives back less and less)
  let last = pre;
  let lastDrive = 0;
  for (let i = 0; i < 2; i++) {
    const err = target - out.lufs;
    if (Math.abs(err) < (i === 0 ? 0.3 : 0.4) || out.lufs - last.lufs < 0.3) break;
    const slope = ((driveDb - lastDrive) / (out.lufs - last.lufs)) * 1.25;
    last = out;
    lastDrive = driveDb;
    driveDb = Math.min(24, Math.max(0, driveDb + err * Math.min(4, slope)));
    out = await render(driveDb);
  }
  return {
    inputGainDb,
    driveDb: Math.round(driveDb * 10) / 10,
    measured: { mixLufs: Math.round(mixLufs * 10) / 10, masterLufs: Math.round(out.lufs * 10) / 10, peakDb: Math.round(out.peak * 10) / 10, at: new Date().toISOString() },
  };
}
