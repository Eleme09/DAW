import type { Bus, Project, Track, TrackId } from "@/types/project";
import { createBus } from "@/types/project";
import { createEffectInstance, type EffectInstance } from "@/types/effects";

/**
 * Automezcla: a starting balance for a rap/trap session, by rules a mixing
 * engineer would follow - not "AI". Each track gets a role (beat, lead
 * vocal, double, ad-lib, other), its real loudness is measured THROUGH its
 * own chain (AutoPitch + Fx), and the faders are set so:
 *
 * - the beat sits at -14 LUFS (headroom for the vocals and the master),
 * - the lead vocal 1.5 LU over the beat (rap: the words in front),
 * - parts of the lead recorded on another track at the same level,
 * - doubles 6 LU under the lead, panned a little left/right,
 * - ad-libs 5 LU under the lead, panned the other way,
 * - anything else 3 LU under the beat.
 *
 * Vocals without a reverb in their chain get a send to one shared plate
 * ("Espacio" bus), like a real session: one room for every voice.
 */

export type MixRole = "beat" | "lead" | "double" | "adlib" | "other";

export const ROLE_LABEL: Record<MixRole, string> = {
  beat: "Beat",
  lead: "Voz principal",
  double: "Doble",
  adlib: "Ad-lib",
  other: "Otro",
};

const BEAT_TARGET_LUFS = -14;
const OFFSET_FROM_BEAT: Record<MixRole, number> = { beat: 0, lead: 1.5, double: -4.5, adlib: -3.5, other: -3 };
const SEND_DB: Partial<Record<MixRole, number>> = { lead: -15, double: -11, adlib: -9 };
const FADER_MIN = -30;
const FADER_MAX = 6;
export const SHARED_REVERB_BUS = "Espacio";

export interface TrackFacts {
  trackId: TrackId;
  /** Loudness through its own chain at a 0 dB fader (null: silent/empty). */
  lufs: number | null;
  /** Most of its audio is stereo. */
  stereo: boolean;
  /** Seconds of audio on the track. */
  seconds: number;
  /** Most of its audio was recorded in the app. */
  recorded: boolean;
  /** Share of its energy under 150 Hz: a beat (808, kick) ~0.8, a voice ~0.02. */
  lowRatio: number;
  /** Share of 50 ms blocks 35 dB under its loud parts: a beat ~0, a voice
   * recorded in parts 0.5+. */
  silentRatio: number;
  /** Timeline seconds where it really sounds (not just where a clip is):
   * two parts of a verse recorded on two tracks don't overlap here. */
  active?: number[];
}

export interface MixPlanItem {
  trackId: TrackId;
  role: MixRole;
  volumeDb: number;
  pan: number;
  /** Send level to the shared reverb, when the track gets one. */
  reverbSendDb: number | null;
  /** Measured loudness (for the summary). */
  lufs: number | null;
}

function clipOverlapSec(a: Track, b: Track): number {
  let total = 0;
  for (const x of a.clips) {
    for (const y of b.clips) {
      const s = Math.max(x.startTime, y.startTime);
      const e = Math.min(x.startTime + x.duration, y.startTime + y.duration);
      if (e > s) total += e - s;
    }
  }
  return total;
}

function clipSec(t: Track): number {
  return t.clips.reduce((s, c) => s + (c.muted ? 0 : c.duration), 0);
}

/** Seconds where both really sound (measured activity when there is one,
 * else clip extents). */
function overlapSec(a: Track, b: Track, facts: Map<TrackId, TrackFacts>): number {
  const fa = facts.get(a.id)?.active;
  const fb = facts.get(b.id)?.active;
  if (!fa || !fb) return clipOverlapSec(a, b);
  const set = new Set(fb);
  return fa.filter((s) => set.has(s)).length;
}

function activeOf(t: Track, facts: Map<TrackId, TrackFacts>): number {
  return facts.get(t.id)?.active?.length ?? clipSec(t);
}

const BEAT_NAME = /\b(beat|instrumental|instru|prod|type ?beat|pista)\b/i;
const ADLIB_NAME = /(ad-?lib|adl|hype|grito)/i;
const DOUBLE_NAME = /(doble|double|dub|coro|backs?|harm)/i;

/** First guess of every track's role from what is on it. */
export function guessRoles(tracks: Track[], facts: Map<TrackId, TrackFacts>): Map<TrackId, MixRole> {
  const roles = new Map<TrackId, MixRole>();
  const withAudio = tracks.filter((t) => (facts.get(t.id)?.seconds ?? 0) > 0);
  for (const t of withAudio) {
    const f = facts.get(t.id)!;
    // measured on the user's own files: beat 0.79 low / 0.005 silent, the
    // vocals 0.02 / 0.55-0.69 (and dual-mono "stereo")
    const sounds = f.lowRatio > 0.25 && f.silentRatio < 0.2;
    const looksBeat = !f.recorded && !t.autoPitch && (BEAT_NAME.test(t.name) || sounds);
    roles.set(t.id, looksBeat ? "beat" : "lead");
  }
  // among the vocals, the one with the most audio leads; the others are
  // either more of the lead (other verses, recorded in parts) or layers on top
  const vocals = withAudio.filter((t) => roles.get(t.id) === "lead").sort((a, b) => activeOf(b, facts) - activeOf(a, facts));
  const main = vocals[0];
  for (const t of vocals.slice(1)) {
    if (ADLIB_NAME.test(t.name)) roles.set(t.id, "adlib");
    else if (DOUBLE_NAME.test(t.name)) roles.set(t.id, "double");
    else {
      const share = overlapSec(t, main, facts) / Math.max(0.01, activeOf(t, facts));
      // mostly on top of the lead: a layer; short layered bits are ad-libs
      if (share > 0.5) roles.set(t.id, activeOf(t, facts) < 0.35 * activeOf(main, facts) ? "adlib" : "double");
    }
  }
  return roles;
}

function hasReverb(inserts: EffectInstance[]): boolean {
  return inserts.some((i) => i.type === "reverb" && !i.bypassed);
}

export function planMix(tracks: Track[], facts: Map<TrackId, TrackFacts>, roles: Map<TrackId, MixRole>): MixPlanItem[] {
  const plan: MixPlanItem[] = [];
  let doubleSide = -1;
  let adlibSide = 1;
  // with no beat on the session, the vocals still balance against each other
  const anyBeat = [...roles.values()].includes("beat");
  for (const t of tracks) {
    const role = roles.get(t.id);
    const f = facts.get(t.id);
    if (!role || !f) continue;
    const target = BEAT_TARGET_LUFS + OFFSET_FROM_BEAT[role] - (anyBeat ? 0 : OFFSET_FROM_BEAT.lead);
    const volumeDb = f.lufs === null ? t.volumeDb : Math.round(Math.min(FADER_MAX, Math.max(FADER_MIN, target - f.lufs)) * 10) / 10;
    let pan = role === "beat" || role === "lead" || role === "other" ? 0 : t.pan;
    if (role === "double") {
      pan = 0.3 * doubleSide;
      doubleSide = -doubleSide;
    } else if (role === "adlib") {
      pan = 0.4 * adlibSide;
      adlibSide = -adlibSide;
    }
    const send = SEND_DB[role];
    plan.push({
      trackId: t.id,
      role,
      volumeDb,
      pan,
      reverbSendDb: send !== undefined && !hasReverb(t.inserts) ? send : null,
      lufs: f.lufs,
    });
  }
  return plan;
}

/** The shared plate: wet only, lows and harsh highs out, short pre-delay
 * so the words stay clear. */
export function sharedReverbInserts(): EffectInstance[] {
  const reverb = createEffectInstance("reverb");
  if (reverb.type === "reverb") {
    reverb.params = { ...reverb.params, mix: 1, decaySec: 1.6, sizeType: "plate", predelayMs: 35, lowCutHz: 300, highCutHz: 8000 };
  }
  return [reverb];
}

/** The project with the plan applied (one undo step for the caller). */
export function applyMixPlan(project: Project, plan: MixPlanItem[]): Project {
  let buses: Bus[] = project.buses;
  let busId = buses.find((b) => b.name === SHARED_REVERB_BUS)?.id ?? null;
  if (!busId && plan.some((p) => p.reverbSendDb !== null)) {
    const bus = { ...createBus(SHARED_REVERB_BUS, buses.length), inserts: sharedReverbInserts() };
    buses = [...buses, bus];
    busId = bus.id;
  }
  const byId = new Map(plan.map((p) => [p.trackId, p]));
  const tracks = project.tracks.map((t) => {
    const p = byId.get(t.id);
    if (!p) return t;
    let sends = t.sends;
    if (p.reverbSendDb !== null && busId) {
      const existing = sends.find((s) => s.busId === busId);
      sends = existing
        ? sends.map((s) => (s.busId === busId ? { ...s, levelDb: p.reverbSendDb! } : s))
        : sends.length < 2
          ? [...sends, { id: crypto.randomUUID(), busId, levelDb: p.reverbSendDb }]
          : sends;
    }
    return { ...t, volumeDb: p.volumeDb, pan: p.pan, sends };
  });
  return { ...project, tracks, buses };
}
