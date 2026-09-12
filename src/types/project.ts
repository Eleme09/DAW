import type { EffectInstance } from "./effects";

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
   * alternate takes, exactly one of which has `muted` false/undefined. */
  takeGroupId?: string;
  /** Per-clip mute, distinct from the track's own mute - used to hide
   * non-active takes within a group without deleting them. */
  muted?: boolean;
}

export interface Note {
  id: string;
  /** MIDI pitch, 0-127 (60 = middle C). */
  pitch: number;
  /** Position within the clip, in seconds. */
  startTime: number;
  duration: number;
  /** 0..1 */
  velocity: number;
}

/** A programmed pattern on an instrument track - the MIDI counterpart to
 * AudioClip. Kept as a separate per-track array (`midiClips`) rather than
 * merged into `clips`, so every existing audio-only consumer (export,
 * bounce, mix analysis, the AI panels) keeps working against `clips`
 * unchanged instead of having to filter a mixed-kind array. */
export interface MidiClip {
  id: ClipId;
  trackId: TrackId;
  name: string;
  startTime: number;
  duration: number;
  notes: Note[];
  color: string;
}

export interface SynthInstrument {
  type: "synth";
  waveform: OscillatorType;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface SamplerInstrument {
  type: "sampler";
  sampleId: SampleId | null;
  /** MIDI note the sample plays back at its original recorded pitch. */
  rootNote: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export type Instrument = SynthInstrument | SamplerInstrument;

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

export interface Track {
  id: TrackId;
  name: string;
  type: "audio" | "instrument";
  color: string;
  volumeDb: number;
  pan: number; // -1 (L) .. 1 (R)
  muted: boolean;
  solo: boolean;
  armed: boolean;
  monitorMode: MonitorMode;
  clips: AudioClip[];
  /** Only used when type === "instrument". */
  midiClips: MidiClip[];
  instrument: Instrument | null;
  automation: TrackAutomation;
  order: number;
  /** Insert effect chain, applied in array order at the track's input point. */
  inserts: EffectInstance[];
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

export interface Project {
  id: ProjectId;
  name: string;
  bpm: number;
  timeSignature: [number, number];
  tracks: Track[];
  loop: LoopRegion;
  markers: Marker[];
  metronomeEnabled: boolean;
  /** Master bus insert effect chain, applied after all tracks are summed. */
  masterInserts: EffectInstance[];
  /** Final output trim, applied after the master insert chain. */
  masterVolumeDb: number;
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

export function createEmptyProject(name = "Untitled Project"): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    bpm: 140,
    timeSignature: [4, 4],
    tracks: [],
    loop: { enabled: false, startTime: 0, endTime: 8 },
    markers: [],
    metronomeEnabled: false,
    masterInserts: [],
    masterVolumeDb: 0,
    createdAt: now,
    updatedAt: now,
  };
}

const TRACK_COLORS = [
  "#ec4899",
  "#22c55e",
  "#38bdf8",
  "#a855f7",
  "#f43f5e",
  "#eab308",
  "#14b8a6",
  "#6366f1",
];

export function nextTrackColor(existingCount: number): string {
  return TRACK_COLORS[existingCount % TRACK_COLORS.length];
}

export function createTrack(name: string, order: number, type: Track["type"] = "audio"): Track {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    color: nextTrackColor(order),
    volumeDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    armed: false,
    monitorMode: "auto",
    clips: [],
    midiClips: [],
    instrument: type === "instrument" ? createDefaultInstrument() : null,
    automation: createDefaultAutomation(),
    order,
    inserts: [],
  };
}

export function createDefaultAutomation(): TrackAutomation {
  return {
    volume: { enabled: false, points: [] },
    pan: { enabled: false, points: [] },
  };
}

export function createDefaultInstrument(): SynthInstrument {
  return { type: "synth", waveform: "sawtooth", attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.2 };
}

export function createDefaultSamplerInstrument(): SamplerInstrument {
  return { type: "sampler", sampleId: null, rootNote: 60, attack: 0.002, decay: 0.05, sustain: 1, release: 0.05 };
}

export function createMidiClip(trackId: TrackId, startTime: number, duration: number, name = "Pattern"): MidiClip {
  return { id: crypto.randomUUID(), trackId, name, startTime, duration, notes: [], color: "#a78bfa" };
}

export function createNote(pitch: number, startTime: number, duration: number, velocity = 0.85): Note {
  return { id: crypto.randomUUID(), pitch, startTime, duration, velocity };
}
