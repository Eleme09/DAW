import type { EffectInstance } from "./effects";
import type { AutoPitchSettings } from "./autoPitch";

export type TrackId = string;
export type ClipId = string;
export type ProjectId = string;
export type SampleId = string;

export interface AudioClip {
  id: ClipId;
  trackId: TrackId;
  /** Reference into the audio buffer store (IndexedDB), not the raw audio. */
  sampleId: SampleId;
  name: string;
  /** Position on the timeline, in seconds. */
  startTime: number;
  /** Audible length, in seconds. */
  duration: number;
  /** Offset into the source buffer where playback starts, in seconds (trim). */
  sourceOffset: number;
  gainDb: number;
  fadeInSec: number;
  fadeOutSec: number;
  color: string;
  /** Set when this clip overlaps another take of the same region (see
   * `addClip` in the store) - all clips sharing a takeGroupId are
   * alternate takes. `selectTake` only mutes/unmutes takes that still
   * time-overlap the one being chosen, so splitting takes at different
   * points (existing "split at playhead") and picking a different active
   * take per fragment produces real fragment-level comping - exactly one
   * take is audible at any given point in time within the group, not
   * necessarily the same take across its whole original span. */
  takeGroupId?: string;
  /** Per-clip mute, distinct from the track's own mute - used to hide
   * non-active takes within a group without deleting them. */
  muted?: boolean;
  /** BandLab "Loop": when set, the source region [sourceOffset,
   * sourceOffset + loopLengthSec) repeats to fill `duration` (4/8/16 times
   * from the region action, or any length by dragging the end handle). */
  loopLengthSec?: number;
}

export type AutomationParam = "volume" | "pan";

export interface AutomationPoint {
  id: string;
  /** Absolute timeline position, in seconds. */
  time: number;
  /** Same units/range as the parameter it automates: dB for volume, -1..1 for pan. */
  value: number;
}

/** A breakpoint curve for one parameter. While `enabled` is false, or there
 * are no points, playback uses the track's static value (`volumeDb`/`pan`)
 * exactly as if automation didn't exist - this is purely additive. */
export interface AutomationLane {
  enabled: boolean;
  points: AutomationPoint[];
}

export interface TrackAutomation {
  volume: AutomationLane;
  pan: AutomationLane;
}

/** Input monitoring while armed - "off" never routes the mic to the output,
 * "auto" only while stopped or actively recording (so playback of already-
 * recorded material isn't doubled with live input), "on" always while
 * armed regardless of transport state. See AudioEngine's refreshMonitoring. */
export type MonitorMode = "off" | "auto" | "on";

export type BusId = string;

/** One auxiliary send from a track to a bus - a parallel tap, not a
 * reroute (the track's own dry signal keeps going to master exactly as
 * before). Post-fader by convention (tapped after the track's own
 * volume/pan/mute in AudioEngine), same as every mainstream DAW's default
 * send point - so muting or trimming a track also affects what it sends,
 * instead of the two silently diverging. */
export interface Send {
  id: string;
  busId: BusId;
  levelDb: number;
}

export interface Track {
  id: TrackId;
  name: string;
  color: string;
  volumeDb: number;
  pan: number; // -1 (L) .. 1 (R)
  muted: boolean;
  solo: boolean;
  armed: boolean;
  monitorMode: MonitorMode;
  clips: AudioClip[];
  automation: TrackAutomation;
  order: number;
  /** Insert effect chain, applied in array order at the track's input point. */
  inserts: EffectInstance[];
  /** Up to 2 auxiliary sends (PROMPT_MAESTRO FASE 3) - UI caps it there,
   * the array itself isn't hard-limited by the type. */
  sends: Send[];
  /** BandLab AutoPitch (types/autoPitch.ts) - processed before the Fx chain,
   * live and on playback; the recording itself stays dry. Absent until the
   * track's AutoPitch is first opened. */
  autoPitch?: AutoPitchSettings;
}

/** A return/group channel: tracks send to it (via Track.sends) and/or it
 * can hold a shared effect (e.g. one reverb three vocals share instead of
 * three separate instances). Has its own fader/pan/mute/solo/inserts and
 * feeds master exactly like a track does - the same "en tira más" the
 * Mixer already renders for tracks, just for a bus instead. */
export interface Bus {
  id: BusId;
  name: string;
  color: string;
  volumeDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  inserts: EffectInstance[];
  order: number;
}

export interface LoopRegion {
  enabled: boolean;
  startTime: number;
  endTime: number;
}

export interface Marker {
  id: string;
  name: string;
  time: number;
}

export interface ProjectKey {
  /** Pitch class 0=Do .. 11=Si. */
  tonic: number;
  scale: "major" | "minor";
}

export interface Project {
  id: ProjectId;
  name: string;
  bpm: number;
  timeSignature: [number, number];
  tracks: Track[];
  buses: Bus[];
  loop: LoopRegion;
  markers: Marker[];
  metronomeEnabled: boolean;
  /** Master bus insert effect chain, applied after all tracks are summed. */
  masterInserts: EffectInstance[];
  /** Final output trim, applied after the master insert chain. */
  masterVolumeDb: number;
  /** Free-form lyrics for the song, shown large on VozPanel while
   * recording (a real teleprompter guide, not just a place to jot notes). */
  lyrics: string;
  /** Project key (Settings → "Clave del proyecto"); a track's AutoPitch
   * starts from it. */
  key: ProjectKey;
  /** Count-in before recording, in bars (0 = off). */
  countInBars: number;
  /** Metronome click level, 0..1. */
  metronomeVolume: number;
  createdAt: string;
  updatedAt: string;
}

/** Metadata for an imported/recorded audio source, decoded once and cached by id. */
export interface SampleAsset {
  id: SampleId;
  name: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  createdAt: string;
}

export function createEmptyProject(name = "Sin título"): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    bpm: 140,
    timeSignature: [4, 4],
    tracks: [],
    buses: [],
    loop: { enabled: false, startTime: 0, endTime: 8 },
    markers: [],
    metronomeEnabled: false,
    masterInserts: [],
    masterVolumeDb: 0,
    lyrics: "",
    key: { tonic: 0, scale: "major" },
    countInBars: 1,
    metronomeVolume: 1,
    createdAt: now,
    updatedAt: now,
  };
}

// Paleta de señal saturada, no la "Cabina" desaturada/fílmica de FASE 10B -
// el usuario pidió explícitamente copiar la interfaz real de BandLab, no
// solo sus funciones ("me refiero a todo. Interfaz, cómo interactúa, como
// todo"). Verificado contra capturas reales de la app (no supuesto): cada
// pista en BandLab tiene un color saturado que tiñe TODA su fila (cabecera +
// carril, no solo un borde), no un tono apagado tipo "cine". Seis colores
// fijos, igual que antes - lo que cambió es la saturación, no la cantidad.
export const TRACK_COLORS = [
  "#e8423f",
  "#2bbf9e",
  "#e8b13f",
  "#9b6fe0",
  "#3f8fe8",
  "#e0638f",
];

export function nextTrackColor(existingCount: number): string {
  return TRACK_COLORS[existingCount % TRACK_COLORS.length];
}

export function createTrack(name: string, order: number): Track {
  return {
    id: crypto.randomUUID(),
    name,
    color: nextTrackColor(order),
    volumeDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    armed: false,
    monitorMode: "auto",
    clips: [],
    automation: createDefaultAutomation(),
    order,
    inserts: [],
    sends: [],
  };
}

// Distinct from TRACK_COLORS on purpose - a bus is not a track (no signal
// source of its own, no clips) and should read as visually different in a
// mixer row at a glance, not just another color in the same rotation.
const BUS_COLORS = ["#a67c52", "#5c7a8a", "#7a6a8a"];

export function nextBusColor(existingCount: number): string {
  return BUS_COLORS[existingCount % BUS_COLORS.length];
}

export function createBus(name: string, order: number): Bus {
  return {
    id: crypto.randomUUID(),
    name,
    color: nextBusColor(order),
    volumeDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    inserts: [],
    order,
  };
}

export function createDefaultAutomation(): TrackAutomation {
  return {
    volume: { enabled: false, points: [] },
    pan: { enabled: false, points: [] },
  };
}
