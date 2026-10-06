import { TEMPO_DIVISIONS, divisionToMs } from "@/audio-engine/effects/tempoGrid";
import { instantiateChain, serializeChain, type FxChainPreset, type TrackFxState } from "@/types/fxPresets";
import { create } from "zustand";
import { splitCyclePasses } from "@/lib/timeline/cyclePasses";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { listProjects, loadProject as loadProjectFromDisk, saveProject } from "@/lib/storage/projectStore";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import { collectProjectSampleIds, ensureSampleLoaded, hydrateProjectSamples } from "@/lib/audio/sampleLoader";
import { runClipJob } from "@/lib/audio/clipWorkerClient";
import {
  createEmptyProject,
  createDefaultAutomation,
  createTrack,
  createBus,
  type AudioClip,
  type AutomationParam,
  type AutomationPoint,
  type Bus,
  type BusId,
  type Project,
  type ProjectKey,
  type BeatInfo,
  type SampleAsset,
  type Send,
  type Track,
  type TrackId,
} from "@/types/project";
import { createEffectInstance, type EffectInstance, type EffectType } from "@/types/effects";
import { createAutoPitchSettings, type AutoPitchSettings } from "@/types/autoPitch";
import { migrateLegacyTuner } from "@/lib/migrations/legacyTuner";
import type { GridResolution } from "@/lib/timing/grid";
import { DEFAULT_PIXELS_PER_SECOND, MIN_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND } from "@/components/daw/Timeline/constants";

/** A bus's id is also a valid EffectTarget - both TrackId and BusId are
 * plain strings (uuids that never collide across the two arrays), so the
 * type union doesn't distinguish them structurally; `mutateInserts` below
 * resolves which one by actually looking it up in `project.tracks` then
 * `project.buses`. */
/** Rewrites the time of every delay that follows a note value (params.sync)
 * from `bpm` - the engine only reads timeMs. Unchanged chains keep identity. */
export function syncDelaysToTempo(inserts: EffectInstance[], bpm: number): EffectInstance[] {
  let changed = false;
  const next = inserts.map((e) => {
    if (e.type !== "delay" || !e.params.sync) return e;
    const division = TEMPO_DIVISIONS.find((d) => d.label === e.params.sync);
    if (!division) return e;
    const timeMs = Math.min(4000, divisionToMs(division.beats, bpm));
    if (Math.abs(timeMs - e.params.timeMs) < 0.01) return e;
    changed = true;
    return { ...e, params: { ...e.params, timeMs } };
  });
  return changed ? next : inserts;
}

export type EffectTarget = TrackId | BusId | "master";
/** Which single pane is full-width on mobile - see DawShell. Unused at `md`+,
 * where every pane renders simultaneously. */
export type ClipEditMode = "shift" | "gain" | "transpose" | "stretch" | "fade" | "loop" | "harmonize";

export type MobileView = "voz" | "browser" | "timeline" | "mixer" | "effects" | "autopitch";
/** Which sub-tab BrowserPanel is showing - lifted out of that component so
 * a track/effect's "Ask AI" button can jump straight to the Assistant tab. */
export type BrowserTab = "audio" | "mix" | "assistant";

interface ProjectState {
  /** Whether the editor (Sesión/Mezcla/FX/...) is showing, vs the project
   * picker home screen - the gate BandLab itself has (you always land on
   * your library, you choose/tap a project to enter its Studio) that this
   * app was missing entirely: it used to silently auto-open the most
   * recent project on every launch instead, so there was never a real
   * "choose a project" moment. False until the user explicitly opens or
   * creates one. */
  projectOpen: boolean;
  closeProject: () => void;
  project: Project;
  /** Undo/redo history of `project` snapshots. Continuous edits (dragging a
   * fader, typing a name) coalesce into one entry — see `setProject`. */
  past: Project[];
  future: Project[];
  currentTime: number;
  isPlaying: boolean;
  selectedTrackId: TrackId | null;
  isRecording: boolean;
  /** Timeline position where the current take started - drives the live
   * "growing take" drawn while recording (BandLab shows it in a pale tint). */
  recordStartTime: number | null;
  /** True while the pre-recording count-in is playing (recording hasn't started yet). */
  isCountingIn: boolean;
  /** Beats left in the count-in, including the current one (4,3,2,1), or null when not counting in. */
  countInBeats: number | null;
  recordingError: string | null;
  /** Timeline UI state, not project data - deliberately not part of
   * undo/redo or persistence. */
  snapResolution: GridResolution;
  setSnapResolution: (resolution: GridResolution) => void;
  /** Timeline zoom (pixels per second of timeline width) - the single
   * shared value every Timeline-family component (Ruler, TrackLane,
   * ClipView, LoopRegion, AutomationEditor) reads instead of
   * a fixed constant, so the whole timeline always scales together. View
   * state, same category as snapResolution - not undoable, not persisted. */
  pixelsPerSecond: number;
  setPixelsPerSecond: (value: number) => void;
  mobileView: MobileView;
  setMobileView: (view: MobileView) => void;
  /** The region tapped in the phone Studio (BandLab: white outline + trim
   * circles + Region Action Menu). View state, not project data. */
  selectedClip: { trackId: TrackId; clipId: string } | null;
  selectClip: (sel: { trackId: TrackId; clipId: string } | null) => void;
  /** Which valued region action is open in the bottom panel (slider + ✓). */
  clipEditMode: ClipEditMode | null;
  setClipEditMode: (mode: ClipEditMode | null) => void;
  clipboard: AudioClip | null;
  copyClip: (trackId: TrackId, clipId: string) => void;
  /** Pastes the copied region on the selected track at the playhead. */
  pasteClip: () => void;
  toast: string | null;
  showToast: (message: string) => void;
  /** Which chain the EffectsRackPanel is showing - lifted out of that
   * component so the Mixer's per-strip/master/bus "FX" buttons can jump to
   * it. */
  effectsRackMode: "track" | "master" | "bus";
  setEffectsRackMode: (mode: "track" | "master" | "bus") => void;
  /** Which bus effectsRackMode: "bus" is currently showing - the bus
   * counterpart of selectedTrackId. */
  selectedBusId: BusId | null;
  selectBus: (busId: BusId | null) => void;
  /** Which track's automation bottom sheet is showing - null when closed. */
  automationTrackId: TrackId | null;
  setAutomationTrackId: (trackId: TrackId | null) => void;
  /** Which parameter's lane the automation editor is showing. */
  automationParam: AutomationParam;
  setAutomationParam: (param: AutomationParam) => void;
  browserTab: BrowserTab;
  setBrowserTab: (tab: BrowserTab) => void;
  /** The Assistant tab's message draft - lives here (not local component
   * state) so a track/effect's "Ask AI" button can pre-fill it directly
   * before jumping to the tab, the same way every other cross-panel UI
   * state in this store works (mobileView, effectsRackMode, ...). */
  assistantDraftMessage: string;
  setAssistantDraftMessage: (text: string) => void;

  undo: () => void;
  redo: () => void;

  addTrack: (name?: string) => Track;
  removeTrack: (trackId: TrackId) => void;
  /** Removes every track with no clips in it, in one undo step -
   * the bulk cleanup for a session that accumulated empty tracks (e.g. from
   * repeated taps before the addTrack debounce existed). No-op if none are
   * empty. */
  removeEmptyTracks: () => void;
  updateTrack: (trackId: TrackId, patch: Partial<Track>) => void;
  /** Swaps a track with its immediate left/right neighbor in channel order. */
  moveTrack: (trackId: TrackId, direction: -1 | 1) => void;
  armTrack: (trackId: TrackId) => void;

  addBus: (name?: string) => Bus;
  removeBus: (busId: BusId) => void;
  updateBus: (busId: BusId, patch: Partial<Bus>) => void;
  /** Automezcla: a whole new balance (faders, pans, the shared reverb bus
   * and sends) in one undo step. */
  applyMix: (next: Project) => void;
  /** Swaps a bus with its immediate left/right neighbor in channel order. */
  moveBus: (busId: BusId, direction: -1 | 1) => void;
  /** Sets or updates a track's send to `busId` at `levelDb` - creates the
   * send if the track doesn't already have one to that bus (up to the 2
   * the UI offers), otherwise updates its level in place. */
  setTrackSend: (trackId: TrackId, busId: BusId, levelDb: number) => void;
  removeTrackSend: (trackId: TrackId, busId: BusId) => void;
  addClip: (clip: AudioClip) => void;
  updateClip: (trackId: TrackId, clipId: string, patch: Partial<AudioClip>) => void;
  removeClip: (trackId: TrackId, clipId: string) => void;
  /** Moves a clip to a different track, keeping its timeline position - the
   * clip leaves the source track's `clips` array and joins the target's. */
  moveClipToTrack: (trackId: TrackId, clipId: string, targetTrackId: TrackId) => void;
  /** Drops a dragged region: new start time and, optionally, another track
   * ("new" = a new track below the last one). One undo step; the region
   * stays selected and takes the target track's color. */
  placeClip: (trackId: TrackId, clipId: string, startTime: number, target?: TrackId | "new") => void;
  /** Makes one take in a group the active (audible) one, muting its siblings. */
  selectTake: (trackId: TrackId, takeGroupId: string, activeClipId: string) => void;
  splitClipAtPlayhead: () => void;
  /** Duplicates the clip under the playhead on the selected track, placing
   * the copy immediately after the original. */
  duplicateClipAtPlayhead: () => void;
  duplicateClip: (trackId: TrackId, clipId: string) => void;
  selectTrack: (trackId: TrackId | null) => void;

  setAutomationLaneEnabled: (trackId: TrackId, param: AutomationParam, enabled: boolean) => void;
  addAutomationPoint: (trackId: TrackId, param: AutomationParam, point: Omit<AutomationPoint, "id">) => void;
  updateAutomationPoint: (
    trackId: TrackId,
    param: AutomationParam,
    pointId: string,
    patch: Partial<AutomationPoint>
  ) => void;
  removeAutomationPoint: (trackId: TrackId, param: AutomationParam, pointId: string) => void;

  addEffect: (target: EffectTarget, type: EffectType) => void;
  setEffectChain: (target: EffectTarget, inserts: EffectInstance[]) => void;
  /** Replaces a track's chain with a fresh copy of `preset` (BandLab: tap a
   * preset tile). `null` clears the chain ("Ninguno"). */
  applyFxPreset: (trackId: TrackId, preset: FxChainPreset | null) => void;
  /** The chain's Blend (0 = dry, 1 = full chain). */
  setFxBlend: (trackId: TrackId, blend: number) => void;
  /** After saving: the track's chain now IS this preset (no unsaved edits). */
  markFxSaved: (trackId: TrackId, preset: FxChainPreset) => void;
  removeEffect: (target: EffectTarget, effectId: string) => void;
  moveEffect: (target: EffectTarget, effectId: string, direction: -1 | 1) => void;
  updateEffectParams: (target: EffectTarget, effectId: string, params: EffectInstance["params"]) => void;
  toggleEffectBypass: (target: EffectTarget, effectId: string) => void;

  setBpm: (bpm: number) => void;
  setTimeSignature: (num: number, den: number) => void;
  setLoop: (patch: Partial<Project["loop"]>) => void;
  toggleMetronome: () => void;
  setMasterVolume: (db: number) => void;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;

  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  /** Aborts a count-in in progress, or discards an active recording without
   * creating a clip - the "cancelar" path stopRecording() doesn't cover
   * (that one always keeps whatever was captured). */
  cancelRecording: () => void;

  renameProject: (name: string) => void;
  setLyrics: (lyrics: string) => void;
  setProjectKey: (key: ProjectKey) => void;
  /** The first beat imported into a project sets its tempo and key (and
   * every AutoPitch's key). No-op once the project has a beatInfo. */
  analyzeFirstBeat: (sampleId: string, name: string) => Promise<void>;
  beatAnalyzing: boolean;
  /** Shown once after the analysis (the studio's banner). */
  beatNotice: BeatInfo | null;
  dismissBeatNotice: () => void;
  setCountInBars: (bars: number) => void;
  setMetronomeVolume: (volume: number) => void;
  /** Creates the track's AutoPitch (from the project key) on first use.
   * Knob/slider moves coalesce into one undo step. */
  setAutoPitch: (trackId: TrackId, patch: Partial<AutoPitchSettings>) => void;
  loadProject: (project: Project) => void;
  /** Loads a saved project by id from disk and hydrates its samples into
   * the audio engine cache. Returns false if the project no longer exists
   * (e.g. deleted from another tab). */
  openProjectById: (id: string) => Promise<boolean>;
  /** Loads the most recently saved project, if any - used to resume the
   * last session on startup. Returns false if there's nothing to recover. */
  recoverLastProject: () => Promise<boolean>;
  newProject: () => void;
  persist: () => Promise<void>;
}

/** The track the track-level controls (mic, Fx, AutoPitch, arm, monitor)
 * should act on when nothing is chosen yet: the armed one, else the first. A
 * freshly opened project used to start with no track selected, which left
 * that whole row greyed out until a clip was tapped. */
export function defaultTrackId(tracks: Track[]): TrackId | null {
  return (tracks.find((t) => t.armed) ?? tracks[0])?.id ?? null;
}

/** After the project is swapped under the selection (undo/redo), keep the
 * selected track/region only if they still exist, else fall back. */
function validSelection(state: { selectedTrackId: TrackId | null; selectedClip: { trackId: TrackId; clipId: string } | null }, project: Project) {
  const trackStillThere = project.tracks.some((t) => t.id === state.selectedTrackId);
  const clipStillThere =
    state.selectedClip !== null &&
    project.tracks.some((t) => t.id === state.selectedClip!.trackId && t.clips.some((c) => c.id === state.selectedClip!.clipId));
  return {
    selectedTrackId: trackStillThere ? state.selectedTrackId : defaultTrackId(project.tracks),
    ...(clipStillThere ? {} : { selectedClip: null, clipEditMode: null }),
  };
}

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

const MIN_CLIP_SEC = 0.05;

/** Consecutive coalesced edits (dragging a fader, typing a field) that land
 * within this window collapse into a single undo step. */
const COALESCE_MS = 400;
/** Cap history length so an hours-long session doesn't grow this unbounded —
 * project snapshots are plain JSON (no audio data), so this is cheap. */
const HISTORY_LIMIT = 200;

/** Debounce window for autosave: a burst of edits (dragging a fader, typing
 * a name) writes to IndexedDB once, shortly after the user stops, rather
 * than on every keystroke/tick. */
const AUTOSAVE_DEBOUNCE_MS = 1200;

/** Beats of audible count-in (click track) played before recording starts. */

/** Beat or not, from the mono mix: share of energy under 150 Hz and share
 * of near-silent 50 ms blocks. */
function looksLikeBeat(mono: Float32Array, sr: number): boolean {
  const step = 4;
  const a = 1 - Math.exp((-2 * Math.PI * 150 * step) / sr);
  let lp = 0;
  let total = 0;
  let low = 0;
  const blockLen = Math.round((0.05 * sr) / step);
  const blocks: number[] = [];
  let be = 0;
  let bn = 0;
  for (let i = 0; i < mono.length; i += step) {
    const x = mono[i];
    lp += (x - lp) * a;
    total += x * x;
    low += lp * lp;
    be += x * x;
    if (++bn >= blockLen) {
      blocks.push(be / bn);
      be = 0;
      bn = 0;
    }
  }
  if (total <= 0 || blocks.length < 20) return false;
  const sorted = [...blocks].sort((x, y) => x - y);
  const loud = sorted[Math.floor(sorted.length * 0.95)];
  const silent = blocks.filter((e) => e < loud * Math.pow(10, -3.5)).length / blocks.length;
  return low / total > 0.25 && silent < 0.2;
}

export const useProjectStore = create<ProjectState>((set, get, api) => {
  let unsubscribeTime: (() => void) | null = null;
  let lastPushAt = 0;
  let lastPushWasCoalescible = false;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: Project | null = null;

  const attachEngineClock = () => {
    unsubscribeTime?.();
    unsubscribeTime = getAudioEngine().onTimeUpdate((t) => set({ currentTime: t }));
  };
  attachEngineClock();

  const attachAutosave = () => {
    api.subscribe((state, prevState) => {
      if (state.project === prevState.project) return;
      pendingSave = state.project;
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        const toSave = pendingSave;
        pendingSave = null;
        autosaveTimer = null;
        if (toSave) saveProject(toSave).catch((err) => console.error("Autosave failed:", err));
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    if (typeof window !== "undefined") {
      // Best-effort flush for a quick tab close right after an edit, before
      // the debounce timer above would otherwise fire. A hard crash bypasses
      // this regardless - the short debounce window is what bounds that risk.
      window.addEventListener("beforeunload", () => {
        if (pendingSave) void saveProject(pendingSave);
      });
    }
  };
  attachAutosave();

  /** The single funnel every project-data mutation goes through, so
   * undo/redo covers all of them uniformly. `coalesce: true` merges this
   * change into the in-progress edit instead of creating a new undo step —
   * use it for continuous input (drag, typing), never for discrete actions
   * (add/remove, toggles) where every call must be its own step. */
  function setProject(next: Project, opts?: { coalesce?: boolean; extra?: Partial<ProjectState> }) {
    const { past, project: current } = get();
    const now = Date.now();
    const coalesce = Boolean(opts?.coalesce) && lastPushWasCoalescible && now - lastPushAt < COALESCE_MS;
    const nextPast = coalesce ? past : [...past, current].slice(-HISTORY_LIMIT);
    set({ project: next, past: nextPast, future: [], ...opts?.extra });
    lastPushAt = now;
    lastPushWasCoalescible = Boolean(opts?.coalesce);
  }

  function mutateInserts(
    target: EffectTarget,
    updater: (inserts: EffectInstance[]) => EffectInstance[],
    opts?: { coalesce?: boolean }
  ): void {
    const project = get().project;
    if (target === "master") {
      const nextProject = touch({ ...project, masterInserts: updater(project.masterInserts) });
      setProject(nextProject, opts);
      getAudioEngine().syncMasterInserts(nextProject.masterInserts);
      return;
    }
    if (project.tracks.some((t) => t.id === target)) {
      const nextProject = touch({
        ...project,
        tracks: project.tracks.map((t) => (t.id === target ? { ...t, inserts: updater(t.inserts) } : t)),
      });
      setProject(nextProject, opts);
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
      return;
    }
    const nextProject = touch({
      ...project,
      buses: project.buses.map((b) => (b.id === target ? { ...b, inserts: updater(b.inserts) } : b)),
    });
    setProject(nextProject, opts);
    getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
  }

  return {
    projectOpen: false,
    closeProject: () => {
      // Same reasoning loadProject()/newProject() already have for
      // cancelRecording()/engine.stop() - leaving a project without
      // stopping a live take or the transport would strand both running
      // underneath the now-hidden editor.
      get().cancelRecording();
      getAudioEngine().stop();
      set({ projectOpen: false, isPlaying: false });
    },
    project: createEmptyProject(),
    past: [],
    future: [],
    currentTime: 0,
    isPlaying: false,
    selectedTrackId: null,
    isRecording: false,
    recordStartTime: null,
    isCountingIn: false,
    countInBeats: null,
    recordingError: null,
    snapResolution: "1/16",
    setSnapResolution: (resolution) => set({ snapResolution: resolution }),
    pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
    setPixelsPerSecond: (value) =>
      set({ pixelsPerSecond: Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, value)) }),
    // On the phone Studio this is no longer a tab: "timeline" = nothing open
    // over the Studio; "voz"/"effects" = the selected track's bottom panel;
    // "mixer" = Mix View; "browser" = sample library (see MobileStudio.tsx).
    mobileView: "timeline",
    setMobileView: (view) => set({ mobileView: view }),
    selectedClip: null,
    selectClip: (sel) =>
      set(sel ? { selectedClip: sel, selectedTrackId: sel.trackId, clipEditMode: null } : { selectedClip: null, clipEditMode: null }),
    clipEditMode: null,
    setClipEditMode: (mode) => set({ clipEditMode: mode }),
    clipboard: null,
    copyClip: (trackId, clipId) => {
      const clip = get().project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
      if (clip) set({ clipboard: clip });
    },
    pasteClip: () => {
      const { clipboard, selectedTrackId, currentTime, project } = get();
      const track = project.tracks.find((t) => t.id === selectedTrackId);
      if (!clipboard || !track) return;
      const pasted: AudioClip = {
        ...clipboard,
        id: crypto.randomUUID(),
        trackId: track.id,
        startTime: currentTime,
        color: track.color,
        takeGroupId: undefined,
        muted: undefined,
      };
      setProject(
        touch({ ...project, tracks: project.tracks.map((t) => (t.id !== track.id ? t : { ...t, clips: [...t.clips, pasted] })) }),
        { extra: { selectedClip: { trackId: track.id, clipId: pasted.id } } }
      );
    },
    toast: null,
    showToast: (message) => {
      set({ toast: message });
      window.setTimeout(() => {
        if (get().toast === message) set({ toast: null });
      }, 1600);
    },
    effectsRackMode: "track",
    setEffectsRackMode: (mode) => set({ effectsRackMode: mode }),
    selectedBusId: null,
    selectBus: (busId) => set({ selectedBusId: busId }),
    automationTrackId: null,
    setAutomationTrackId: (trackId) => set({ automationTrackId: trackId }),
    automationParam: "volume",
    setAutomationParam: (param) => set({ automationParam: param }),
    browserTab: "audio",
    setBrowserTab: (tab) => set({ browserTab: tab }),
    assistantDraftMessage: "",
    setAssistantDraftMessage: (text) => set({ assistantDraftMessage: text }),

    undo: () => {
      const { past, project, future } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set({
        project: previous,
        past: past.slice(0, -1),
        future: [project, ...future],
        ...validSelection(get(), previous),
      });
      getAudioEngine().syncTracks(previous.tracks, previous.buses);
      getAudioEngine().syncMasterInserts(previous.masterInserts);
      lastPushWasCoalescible = false;
    },
    redo: () => {
      const { past, project, future } = get();
      const next = future[0];
      if (!next) return;
      set({ project: next, past: [...past, project], future: future.slice(1), ...validSelection(get(), next) });
      getAudioEngine().syncTracks(next.tracks, next.buses);
      getAudioEngine().syncMasterInserts(next.masterInserts);
      lastPushWasCoalescible = false;
    },

    addTrack: (name) => {
      const project = get().project;
      const track = createTrack(name ?? `Pista ${project.tracks.length + 1}`, project.tracks.length);
      setProject(touch({ ...project, tracks: [...project.tracks, track] }), {
        extra: { selectedTrackId: track.id },
      });
      return track;
    },

    removeTrack: (trackId) => {
      const project = get().project;
      const remaining = project.tracks.filter((t) => t.id !== trackId);
      const selectedTrackId = get().selectedTrackId === trackId ? defaultTrackId(remaining) : get().selectedTrackId;
      setProject(touch({ ...project, tracks: remaining }), {
        extra: { selectedTrackId },
      });
    },

    removeEmptyTracks: () => {
      const project = get().project;
      const isEmpty = (t: Track) => t.clips.length === 0;
      if (!project.tracks.some(isEmpty)) return;
      const remaining = project.tracks.filter((t) => !isEmpty(t));
      const selectedTrackId = get().selectedTrackId;
      const keepSelection = remaining.some((t) => t.id === selectedTrackId);
      setProject(touch({ ...project, tracks: remaining }), {
        extra: { selectedTrackId: keepSelection ? selectedTrackId : defaultTrackId(remaining) },
      });
    },

    updateTrack: (trackId, patch) => {
      const project = get().project;
      const coalesce = Object.keys(patch).every((k) => k === "volumeDb" || k === "pan" || k === "name");
      setProject(
        touch({ ...project, tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) }),
        { coalesce }
      );
      getAudioEngine().syncTracks(get().project.tracks, get().project.buses);
    },

    moveTrack: (trackId, direction) => {
      const project = get().project;
      const index = project.tracks.findIndex((t) => t.id === trackId);
      const newIndex = index + direction;
      if (index === -1 || newIndex < 0 || newIndex >= project.tracks.length) return;
      const reordered = [...project.tracks];
      [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
      setProject(touch({ ...project, tracks: reordered.map((t, i) => ({ ...t, order: i })) }));
    },

    armTrack: (trackId) => {
      // Only one track records at a time - keep arming exclusive.
      const project = get().project;
      const target = project.tracks.find((t) => t.id === trackId);
      const nextArmed = !target?.armed;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => ({ ...t, armed: t.id === trackId ? nextArmed : false })),
        })
      );
    },

    addBus: (name) => {
      const project = get().project;
      const bus = createBus(name ?? `Bus ${project.buses.length + 1}`, project.buses.length);
      const nextProject = touch({ ...project, buses: [...project.buses, bus] });
      setProject(nextProject, { extra: { selectedBusId: bus.id } });
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
      return bus;
    },

    removeBus: (busId) => {
      const project = get().project;
      const selectedBusId = get().selectedBusId === busId ? null : get().selectedBusId;
      // A send pointing at a bus that no longer exists is dead data, not a
      // harmless leftover - clean it up here rather than leaving every
      // consumer (the engine, the Mixer's send UI) to guard against it.
      const nextProject = touch({
        ...project,
        buses: project.buses.filter((b) => b.id !== busId),
        tracks: project.tracks.map((t) => ({ ...t, sends: t.sends.filter((s) => s.busId !== busId) })),
      });
      setProject(nextProject, { extra: { selectedBusId } });
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
    },

    applyMix: (next) => {
      const nextProject = touch(next);
      setProject(nextProject);
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
    },

    updateBus: (busId, patch) => {
      const project = get().project;
      const coalesce = Object.keys(patch).every((k) => k === "volumeDb" || k === "pan" || k === "name");
      const nextProject = touch({
        ...project,
        buses: project.buses.map((b) => (b.id === busId ? { ...b, ...patch } : b)),
      });
      setProject(nextProject, { coalesce });
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
    },

    moveBus: (busId, direction) => {
      const project = get().project;
      const index = project.buses.findIndex((b) => b.id === busId);
      const newIndex = index + direction;
      if (index === -1 || newIndex < 0 || newIndex >= project.buses.length) return;
      const reordered = [...project.buses];
      [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
      setProject(touch({ ...project, buses: reordered.map((b, i) => ({ ...b, order: i })) }));
    },

    setTrackSend: (trackId, busId, levelDb) => {
      const project = get().project;
      const nextProject = touch({
        ...project,
        tracks: project.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const existing = t.sends.find((s) => s.busId === busId);
          if (existing) {
            return { ...t, sends: t.sends.map((s) => (s.busId === busId ? { ...s, levelDb } : s)) };
          }
          const send: Send = { id: crypto.randomUUID(), busId, levelDb };
          return { ...t, sends: [...t.sends, send] };
        }),
      });
      setProject(nextProject, { coalesce: true });
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
    },

    removeTrackSend: (trackId, busId) => {
      const project = get().project;
      const nextProject = touch({
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, sends: t.sends.filter((s) => s.busId !== busId) } : t
        ),
      });
      setProject(nextProject);
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
    },

    addClip: (clip) => {
      const project = get().project;
      const track = project.tracks.find((t) => t.id === clip.trackId);
      const newEnd = clip.startTime + clip.duration;
      const overlapping =
        track?.clips.filter((c) => clip.startTime < c.startTime + c.duration && c.startTime < newEnd) ?? [];

      if (overlapping.length === 0) {
        setProject(
          touch({
            ...project,
            tracks: project.tracks.map((t) => (t.id === clip.trackId ? { ...t, clips: [...t.clips, clip] } : t)),
          })
        );
        return;
      }

      // Overlapping an existing clip on the same track means this is an
      // alternate take of the same region (e.g. re-recording a vocal punch-
      // in), not two clips meant to play at once - group them as takes and
      // make the new one the active (audible) one instead of silently
      // stacking simultaneous audio. See PROGRESS.md "comping".
      const takeGroupId = overlapping.find((c) => c.takeGroupId)?.takeGroupId ?? crypto.randomUUID();
      const activeClip: AudioClip = { ...clip, takeGroupId, muted: false };
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== clip.trackId
              ? t
              : {
                  ...t,
                  clips: [
                    ...t.clips.map((c) =>
                      overlapping.some((o) => o.id === c.id) ? { ...c, takeGroupId, muted: true } : c
                    ),
                    activeClip,
                  ],
                }
          ),
        })
      );
    },

    updateClip: (trackId, clipId, patch) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
          ),
        }),
        { coalesce: true }
      );
    },

    removeClip: (trackId, clipId) => {
      const project = get().project;
      const track = project.tracks.find((t) => t.id === trackId);
      const removed = track?.clips.find((c) => c.id === clipId);
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => {
            if (t.id !== trackId) return t;
            let clips = t.clips.filter((c) => c.id !== clipId);
            // Deleting the active take of a fragment would otherwise
            // silently drop that time range from the arrangement - promote
            // the most recent remaining take that overlaps the SAME range
            // (not just any clip sharing the group id - a comped fragment
            // elsewhere in the group is a different decision entirely).
            if (removed?.takeGroupId && !removed.muted) {
              const removedEnd = removed.startTime + removed.duration;
              const siblings = clips.filter(
                (c) =>
                  c.takeGroupId === removed.takeGroupId &&
                  c.startTime < removedEnd &&
                  removed.startTime < c.startTime + c.duration
              );
              const stillHasActive = siblings.some((c) => !c.muted);
              if (!stillHasActive && siblings.length > 0) {
                const promoteId = siblings[siblings.length - 1].id;
                clips = clips.map((c) => (c.id === promoteId ? { ...c, muted: false } : c));
              }
            }
            return { ...t, clips };
          }),
        })
      );
    },

    moveClipToTrack: (trackId, clipId, targetTrackId) => {
      if (trackId === targetTrackId) return;
      const project = get().project;
      const sourceTrack = project.tracks.find((t) => t.id === trackId);
      const clip = sourceTrack?.clips.find((c) => c.id === clipId);
      const targetTrack = project.tracks.find((t) => t.id === targetTrackId);
      if (!clip || !targetTrack) return;
      // A take group only means something among clips recorded on the same
      // track region - carrying it across tracks would compare this clip
      // against an unrelated track's takes, so it's dropped on the move,
      // same as how removeClip above only ever promotes a sibling within
      // one track's own clips array.
      const moved = { ...clip, trackId: targetTrackId, color: targetTrack.color, takeGroupId: undefined };
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => {
            if (t.id === trackId) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
            if (t.id === targetTrackId) return { ...t, clips: [...t.clips, moved] };
            return t;
          }),
        }),
        { extra: { selectedTrackId: targetTrackId } }
      );
    },

    placeClip: (trackId, clipId, startTime, target) => {
      const project = get().project;
      const source = project.tracks.find((t) => t.id === trackId);
      const clip = source?.clips.find((c) => c.id === clipId);
      if (!source || !clip) return;
      const start = Math.max(0, startTime);
      let tracks = project.tracks;
      let targetId = target ?? trackId;
      if (target === "new") {
        const created = createTrack(`Pista ${tracks.length + 1}`, tracks.length);
        tracks = [...tracks, created];
        targetId = created.id;
      }
      const targetTrack = tracks.find((t) => t.id === targetId);
      if (!targetTrack) return;
      if (targetId === trackId && Math.abs(start - clip.startTime) < 1e-6) return;
      const moved =
        targetId === trackId
          ? { ...clip, startTime: start }
          : // a take group only means something on the track it was recorded on
            { ...clip, startTime: start, trackId: targetId, color: targetTrack.color, takeGroupId: undefined };
      setProject(
        touch({
          ...project,
          tracks: tracks.map((t) => {
            if (t.id === trackId && t.id === targetId) return { ...t, clips: t.clips.map((c) => (c.id === clipId ? moved : c)) };
            if (t.id === trackId) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
            if (t.id === targetId) return { ...t, clips: [...t.clips, moved] };
            return t;
          }),
        }),
        { extra: { selectedTrackId: targetId, selectedClip: { trackId: targetId, clipId } } }
      );
    },

    // Fragment-level comping: only mutes takes that still overlap the newly
    // chosen clip's time range, not every clip in the group. Combined with
    // splitClipAtPlayhead (which preserves takeGroupId across the cut),
    // this lets each fragment of a comped region carry its own active take
    // instead of one choice applying to the whole original recording span.
    selectTake: (trackId, takeGroupId, activeClipId) => {
      const project = get().project;
      const track = project.tracks.find((t) => t.id === trackId);
      const activeClip = track?.clips.find((c) => c.id === activeClipId);
      if (!activeClip) return;
      const activeEnd = activeClip.startTime + activeClip.duration;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : {
                  ...t,
                  clips: t.clips.map((c) => {
                    if (c.takeGroupId !== takeGroupId) return c;
                    if (c.id === activeClipId) return { ...c, muted: false };
                    const overlaps = c.startTime < activeEnd && activeClip.startTime < c.startTime + c.duration;
                    return overlaps ? { ...c, muted: true } : c;
                  }),
                }
          ),
        })
      );
    },

    // Splits every clip under the playhead, not just the audible one - a
    // stack of takes recorded over the same region (a comp) needs to be
    // cut at the same point on every take before picking per-fragment
    // (selectTake), same as cutting a comp lane in Logic/Pro Tools slices
    // every take at once rather than only the one currently on top.
    splitClipAtPlayhead: () => {
      const { project, selectedTrackId, currentTime } = get();
      const track = project.tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;
      const toSplit = track.clips.filter(
        (c) =>
          !c.loopLengthSec && currentTime > c.startTime + MIN_CLIP_SEC && currentTime < c.startTime + c.duration - MIN_CLIP_SEC
      );
      if (toSplit.length === 0) return;

      const splitIds = new Set(toSplit.map((c) => c.id));
      const splitOf = (clip: AudioClip): AudioClip[] => {
        const splitAt = currentTime - clip.startTime;
        const left: AudioClip = { ...clip, duration: splitAt, fadeOutSec: 0 };
        const right: AudioClip = {
          ...clip,
          id: crypto.randomUUID(),
          startTime: currentTime,
          duration: clip.duration - splitAt,
          sourceOffset: clip.sourceOffset + splitAt,
          fadeInSec: 0,
        };
        return [left, right];
      };

      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== track.id
              ? t
              : { ...t, clips: t.clips.flatMap((c) => (splitIds.has(c.id) ? splitOf(c) : [c])) }
          ),
        })
      );
    },

    duplicateClipAtPlayhead: () => {
      const { project, selectedTrackId, currentTime } = get();
      const track = project.tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;
      const clip = track.clips.find((c) => currentTime >= c.startTime && currentTime <= c.startTime + c.duration);
      if (!clip) return;

      const duplicate: AudioClip = { ...clip, id: crypto.randomUUID(), startTime: clip.startTime + clip.duration };
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => (t.id !== track.id ? t : { ...t, clips: [...t.clips, duplicate] })),
        })
      );
    },

    /** Duplicates a specific clip by id, regardless of the playhead -
     * used by the clip's own context sheet (see ClipContextSheet), where
     * "duplicate THIS clip" shouldn't depend on where the playhead
     * happens to be sitting (that's what duplicateClipAtPlayhead is for). */
    duplicateClip: (trackId, clipId) => {
      const project = get().project;
      const track = project.tracks.find((t) => t.id === trackId);
      const clip = track?.clips.find((c) => c.id === clipId);
      if (!clip) return;
      const duplicate: AudioClip = { ...clip, id: crypto.randomUUID(), startTime: clip.startTime + clip.duration };
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => (t.id !== trackId ? t : { ...t, clips: [...t.clips, duplicate] })),
        })
      );
    },

    // Choosing "no track" isn't a state the track row can use: falls back to
    // the armed / first one (null only when the project has no tracks).
    selectTrack: (trackId) => set({ selectedTrackId: trackId ?? defaultTrackId(get().project.tracks) }),

    setAutomationLaneEnabled: (trackId, param, enabled) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : { ...t, automation: { ...t.automation, [param]: { ...t.automation[param], enabled } } }
          ),
        })
      );
    },

    addAutomationPoint: (trackId, param, point) => {
      const project = get().project;
      const newPoint: AutomationPoint = { id: crypto.randomUUID(), time: point.time, value: point.value };
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : {
                  ...t,
                  automation: {
                    ...t.automation,
                    [param]: { ...t.automation[param], points: [...t.automation[param].points, newPoint] },
                  },
                }
          ),
        })
      );
    },

    updateAutomationPoint: (trackId, param, pointId, patch) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : {
                  ...t,
                  automation: {
                    ...t.automation,
                    [param]: {
                      ...t.automation[param],
                      points: t.automation[param].points.map((p) => (p.id === pointId ? { ...p, ...patch } : p)),
                    },
                  },
                }
          ),
        }),
        { coalesce: true }
      );
    },

    removeAutomationPoint: (trackId, param, pointId) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : {
                  ...t,
                  automation: {
                    ...t.automation,
                    [param]: {
                      ...t.automation[param],
                      points: t.automation[param].points.filter((p) => p.id !== pointId),
                    },
                  },
                }
          ),
        })
      );
    },

    addEffect: (target, type) => {
      const instance = createEffectInstance(type);
      mutateInserts(target, (inserts) => [...inserts, instance]);
    },
    setEffectChain: (target, inserts) => {
      mutateInserts(target, () => inserts);
    },
    applyFxPreset: (trackId, preset) => {
      const project = get().project;
      const bpm = project.bpm;
      const inserts = preset ? syncDelaysToTempo(instantiateChain(preset.effects), bpm) : [];
      const fx: TrackFxState | undefined = preset
        ? { presetId: preset.id, name: preset.name, blend: preset.blend, baseline: serializeChain(inserts) }
        : undefined;
      const nextProject = touch({
        ...project,
        tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, inserts, fx } : t)),
      });
      setProject(nextProject);
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
    },
    setFxBlend: (trackId, blend) => {
      const project = get().project;
      const nextProject = touch({
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, fx: { presetId: null, name: null, baseline: null, ...t.fx, blend } } : t
        ),
      });
      setProject(nextProject, { coalesce: true });
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
    },
    markFxSaved: (trackId, preset) => {
      const project = get().project;
      const nextProject = touch({
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? { ...t, fx: { presetId: preset.id, name: preset.name, blend: t.fx?.blend ?? preset.blend, baseline: serializeChain(t.inserts) } }
            : t
        ),
      });
      setProject(nextProject);
    },
    removeEffect: (target, effectId) => {
      mutateInserts(target, (inserts) => inserts.filter((e) => e.id !== effectId));
    },
    moveEffect: (target, effectId, direction) => {
      mutateInserts(target, (inserts) => {
        const index = inserts.findIndex((e) => e.id === effectId);
        const newIndex = index + direction;
        if (index === -1 || newIndex < 0 || newIndex >= inserts.length) return inserts;
        const next = [...inserts];
        [next[index], next[newIndex]] = [next[newIndex], next[index]];
        return next;
      });
    },
    updateEffectParams: (target, effectId, params) => {
      mutateInserts(
        target,
        (inserts) => inserts.map((e) => (e.id === effectId ? ({ ...e, params } as EffectInstance) : e)),
        { coalesce: true }
      );
    },
    toggleEffectBypass: (target, effectId) => {
      mutateInserts(target, (inserts) =>
        inserts.map((e) => (e.id === effectId ? { ...e, bypassed: !e.bypassed } : e))
      );
    },

    setBpm: (bpm) => {
      const project = get().project;
      // delays synced to a note value follow the new tempo
      const nextProject = touch({
        ...project,
        bpm,
        tracks: project.tracks.map((t) => ({ ...t, inserts: syncDelaysToTempo(t.inserts, bpm) })),
        buses: project.buses.map((b) => ({ ...b, inserts: syncDelaysToTempo(b.inserts, bpm) })),
        masterInserts: syncDelaysToTempo(project.masterInserts, bpm),
      });
      setProject(nextProject, { coalesce: true });
      getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
      getAudioEngine().syncMasterInserts(nextProject.masterInserts);
    },
    setTimeSignature: (num, den) =>
      setProject(touch({ ...get().project, timeSignature: [num, den] }), { coalesce: true }),
    setLoop: (patch) =>
      setProject(touch({ ...get().project, loop: { ...get().project.loop, ...patch } })),
    toggleMetronome: () => {
      const project = get().project;
      const enabled = !project.metronomeEnabled;
      setProject(touch({ ...project, metronomeEnabled: enabled }));
      getAudioEngine().setMetronomeEnabled(enabled, get().project.tracks, project.bpm);
    },
    setMasterVolume: (db) => setProject(touch({ ...get().project, masterVolumeDb: db }), { coalesce: true }),

    play: () => {
      const { project, currentTime } = get();
      getAudioEngine().play(project.tracks, currentTime, project.loop, project.bpm, project.buses);
      set({ isPlaying: true });
    },
    pause: () => {
      getAudioEngine().pause(get().project.tracks, get().project.buses);
      set({ isPlaying: false, currentTime: getAudioEngine().getCurrentTime() });
    },
    stop: () => {
      getAudioEngine().stop(get().project.tracks, get().project.buses);
      set({ isPlaying: false, currentTime: 0 });
    },
    seek: (time) => {
      const { project } = get();
      getAudioEngine().seek(time, project.tracks, project.loop, project.bpm);
      set({ currentTime: time });
    },

    startRecording: async () => {
      const state = get();
      if (state.isRecording || state.isCountingIn) return;

      let project = state.project;
      let armedTrack = project.tracks.find((t) => t.armed);
      if (!armedTrack) {
        armedTrack =
          project.tracks.find((t) => t.id === state.selectedTrackId) ??
          createTrack(`Vocal ${project.tracks.length + 1}`, project.tracks.length);
        if (!project.tracks.some((t) => t.id === armedTrack!.id)) {
          project = touch({ ...project, tracks: [...project.tracks, armedTrack] });
        }
        project = touch({
          ...project,
          tracks: project.tracks.map((t) => (t.id === armedTrack!.id ? { ...t, armed: true } : t)),
        });
        setProject(project, { extra: { selectedTrackId: armedTrack.id } });
      }

      const countInBeats = Math.max(0, Math.round(project.countInBars ?? 1)) * project.timeSignature[0];
      // Mic opens now (inside the tap) and is ready when the count-in ends.
      getAudioEngine().prepareInput();
      set({ recordingError: null, isCountingIn: countInBeats > 0, countInBeats: countInBeats > 0 ? countInBeats : null });
      const completedCountIn = await getAudioEngine().playCountIn(project.bpm, countInBeats, (remaining) =>
        set({ countInBeats: remaining })
      );
      set({ isCountingIn: false, countInBeats: null });
      // Cancelled mid count-in (cancelRecording()) - don't start capturing.
      // The track that just got auto-armed above stays armed, same as if
      // the user had armed it manually and not hit record yet.
      if (!completedCountIn) {
        getAudioEngine().releaseInput();
        return;
      }

      const recordFrom = get().currentTime;
      const result = await getAudioEngine().startRecording(
        project.tracks,
        project.loop,
        project.bpm,
        recordFrom,
        project.buses
      );
      if (!result.ok) {
        set({ recordingError: result.error });
        return;
      }
      set({ isRecording: true, isPlaying: true, recordStartTime: recordFrom });
    },

    stopRecording: async () => {
      if (!get().isRecording) return;
      const result = getAudioEngine().stopRecording();
      set({ isRecording: false, isPlaying: false, recordStartTime: null, currentTime: getAudioEngine().getCurrentTime() });
      if (!result || result.durationSec <= 0) return;

      const project = get().project;
      const armedTrack = project.tracks.find((t) => t.armed);
      if (!armedTrack) {
        // Reachable only if something disarms the recording track without
        // going through cancelRecording() first (every normal UI path -
        // the arm toggle, track deletion, switching projects - is guarded
        // against that). Surfacing it beats silently throwing away audio
        // that was actually captured.
        set({ recordingError: "Se grabó una toma pero ninguna pista está armada - no se pudo guardar." });
        return;
      }

      const sampleId = crypto.randomUUID();
      await getAudioEngine().decodeAndCache(sampleId, await result.blob.arrayBuffer());
      await putSample(sampleId, `${armedTrack.name} take`, result.blob);
      const asset: SampleAsset = {
        id: sampleId,
        name: `${armedTrack.name} take ${new Date().toLocaleTimeString()}`,
        durationSec: result.durationSec,
        sampleRate: getAudioEngine().getContext()?.sampleRate ?? 44100,
        channels: 1,
        createdAt: new Date().toISOString(),
        origin: "recording",
      };
      await addSampleAsset(asset);

      // Shift the take earlier by the measured round-trip latency so it
      // lands where the performer actually sang relative to the beat, not
      // where the buffer happened to start filling - see getLatencySec()'s
      // doc comment for what "measured" means here. Clamped at 0: a take
      // recorded from the very start of the timeline has nothing earlier
      // to shift into.
      const latencySec = getAudioEngine().getLatencySec() ?? 0;

      // Recorded with the Cycle on and it wrapped: one take per lap, stacked
      // on the cycle (takes are grouped by addClip because they overlap).
      const passes = splitCyclePasses(result.startTime, result.durationSec, project.loop, latencySec);
      if (passes) {
        passes.forEach((pass, i) =>
          get().addClip({
            id: crypto.randomUUID(),
            trackId: armedTrack.id,
            sampleId,
            name: `${armedTrack.name} toma ${i + 1}`,
            startTime: pass.startTime,
            duration: pass.duration,
            sourceOffset: pass.sourceOffset,
            gainDb: 0,
            fadeInSec: 0,
            fadeOutSec: 0,
            color: armedTrack.color,
          })
        );
        return;
      }

      const clip: AudioClip = {
        id: crypto.randomUUID(),
        trackId: armedTrack.id,
        sampleId,
        name: asset.name,
        startTime: Math.max(0, result.startTime - latencySec),
        duration: result.durationSec,
        sourceOffset: 0,
        gainDb: 0,
        fadeInSec: 0,
        fadeOutSec: 0,
        color: armedTrack.color,
      };
      get().addClip(clip);
    },

    cancelRecording: () => {
      const state = get();
      if (state.isCountingIn) {
        getAudioEngine().cancelCountIn();
        getAudioEngine().releaseInput();
        set({ isCountingIn: false, countInBeats: null });
        return;
      }
      if (!state.isRecording) return;
      getAudioEngine().discardRecording();
      set({ isRecording: false, isPlaying: false, recordStartTime: null, currentTime: getAudioEngine().getCurrentTime() });
    },

    renameProject: (name) => setProject(touch({ ...get().project, name }), { coalesce: true }),
    setLyrics: (lyrics) => setProject(touch({ ...get().project, lyrics }), { coalesce: true }),
    setProjectKey: (key) => setProject(touch({ ...get().project, key })),
    beatAnalyzing: false,
    beatNotice: null,
    dismissBeatNotice: () => set({ beatNotice: null }),
    analyzeFirstBeat: async (sampleId, name) => {
      if (get().project.beatInfo || get().beatAnalyzing) return;
      const buffer = await ensureSampleLoaded(sampleId);
      if (!buffer || buffer.duration < 15) return;
      const sr = buffer.sampleRate;
      const n = Math.min(buffer.length, Math.floor(120 * sr));
      const mono = new Float32Array(n);
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < n; i++) mono[i] += data[i] / buffer.numberOfChannels;
      }
      // only a beat sets the project: lots of low end (808, kick) and no
      // gaps. A vocal imported first must not (measured on the user's files:
      // beat 0.79 low / 0.5 % silent, vocals 0.02 / 55-69 %).
      if (!looksLikeBeat(mono, sr)) return;
      set({ beatAnalyzing: true });
      try {
        const result = await runClipJob({ kind: "beat", mono, sampleRate: sr });
        if (result.kind !== "beat") return;
        const a = result.analysis;
        const project = get().project;
        if (project.beatInfo) return;
        const key: ProjectKey = { tonic: a.key.tonic, scale: a.key.scale };
        const beatInfo: BeatInfo = {
          sampleId,
          name,
          bpm: a.bpm,
          bpmConfidence: a.bpmConfidence,
          key,
          keyConfidence: a.keyConfidence,
          keyAgreed: a.keyAgreed,
          alternative: { tonic: a.keyAlternative.tonic, scale: a.keyAlternative.scale },
        };
        const nextProject = touch({
          ...project,
          bpm: a.bpm,
          key,
          beatInfo,
          tracks: project.tracks.map((t) => ({
            ...t,
            inserts: syncDelaysToTempo(t.inserts, a.bpm),
            autoPitch: t.autoPitch ? { ...t.autoPitch, key: key.tonic, scale: key.scale } : t.autoPitch,
          })),
          buses: project.buses.map((b) => ({ ...b, inserts: syncDelaysToTempo(b.inserts, a.bpm) })),
          masterInserts: syncDelaysToTempo(project.masterInserts, a.bpm),
        });
        setProject(nextProject);
        getAudioEngine().syncTracks(nextProject.tracks, nextProject.buses);
        getAudioEngine().syncMasterInserts(nextProject.masterInserts);
        set({ beatNotice: beatInfo });
      } catch {
        // analysis is a convenience: the project just keeps its tempo/key
      } finally {
        set({ beatAnalyzing: false });
      }
    },
    setCountInBars: (bars) => setProject(touch({ ...get().project, countInBars: bars })),
    setMetronomeVolume: (volume) => {
      setProject(touch({ ...get().project, metronomeVolume: volume }), { coalesce: true });
      getAudioEngine().setMetronomeVolume(volume);
    },
    setAutoPitch: (trackId, patch) => {
      const project = get().project;
      const coalesce = Object.keys(patch).every((k) => k === "level" || k === "harmonyMix");
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => {
            if (t.id !== trackId) return t;
            const base = t.autoPitch ?? createAutoPitchSettings(project.key.tonic, project.key.scale);
            return { ...t, autoPitch: { ...base, ...patch } };
          }),
        }),
        { coalesce }
      );
      getAudioEngine().syncTracks(get().project.tracks, get().project.buses);
    },
    loadProject: (project) => {
      // Switching documents mid-take would otherwise leave a genuinely
      // broken state: the old project's tracks (armed track included) are
      // about to be replaced, but AudioEngine.stop() below doesn't touch
      // an in-progress recording session - it would keep capturing from
      // the (now orphaned) mic tap forever, isRecording would stay stuck
      // true in the UI, and the eventually-stopped take would have no
      // armed track left to land on. Cancel first so a document switch
      // always leaves a clean slate, same as tapping cancel explicitly.
      get().cancelRecording();
      // Opening a different project starts a fresh undo history - carrying
      // over the previous project's history would let undo cross documents.
      getAudioEngine().stop();
      // Projects saved before masterVolumeDb existed won't have it - default
      // it so old projects don't load silently attenuated. Instrument/MIDI
      // tracks are a removed feature (no engine/UI left to play or edit
      // them) - an old project that happens to have one drops it on load
      // rather than loading an inert, uneditable track.
      const normalized: Project = {
        ...project,
        masterVolumeDb: project.masterVolumeDb ?? 0,
        buses: project.buses ?? [],
        lyrics: project.lyrics ?? "",
        key: project.key ?? { tonic: 0, scale: "major" },
        countInBars: project.countInBars ?? 1,
        metronomeVolume: project.metronomeVolume ?? 1,
        tracks: project.tracks
          .filter((t) => (t as unknown as { type?: string }).type !== "instrument")
          .map((t) =>
            migrateLegacyTuner({
              ...t,
              automation: t.automation ?? createDefaultAutomation(),
              monitorMode: t.monitorMode ?? "auto",
              sends: t.sends ?? [],
            })
          ),
      };
      getAudioEngine().setMetronomeVolume(normalized.metronomeVolume);
      set({
        project: normalized,
        projectOpen: true,
        currentTime: 0,
        isPlaying: false,
        selectedTrackId: defaultTrackId(normalized.tracks),
        selectedClip: null,
        clipEditMode: null,
        selectedBusId: null,
        past: [],
        future: [],
      });
      lastPushWasCoalescible = false;
    },
    newProject: () => {
      get().cancelRecording(); // same reasoning as loadProject() above
      getAudioEngine().stop();
      set({
        project: createEmptyProject(),
        projectOpen: true,
        currentTime: 0,
        isPlaying: false,
        selectedTrackId: null,
        selectedBusId: null,
        past: [],
        future: [],
      });
      lastPushWasCoalescible = false;
    },
    openProjectById: async (id) => {
      const project = await loadProjectFromDisk(id);
      if (!project) return false;
      get().loadProject(project);
      await hydrateProjectSamples(collectProjectSampleIds(project));
      return true;
    },
    recoverLastProject: async () => {
      const entries = await listProjects();
      const mostRecent = entries[0];
      if (!mostRecent) return false;
      return get().openProjectById(mostRecent.id);
    },
    persist: () => saveProject(get().project),
  };
});

/**
 * Leaving the app (home screen, another app, screen lock) pauses playback
 * and gives the phone its audio back: mic closed, context suspended. A
 * take in progress keeps going - stopping it is the user's call.
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    const state = useProjectStore.getState();
    if (state.isRecording) return;
    if (state.isCountingIn) state.cancelRecording();
    if (state.isPlaying) state.pause();
    getAudioEngine().releaseAudio();
  });
}
