import { create } from "zustand";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { listProjects, loadProject as loadProjectFromDisk, saveProject } from "@/lib/storage/projectStore";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import { collectProjectSampleIds, hydrateProjectSamples } from "@/lib/audio/sampleLoader";
import {
  createEmptyProject,
  createDefaultAutomation,
  createMidiClip,
  createNote,
  createTrack,
  createBus,
  type AudioClip,
  type AutomationParam,
  type AutomationPoint,
  type Bus,
  type BusId,
  type Instrument,
  type MidiClip,
  type Note,
  type Project,
  type SampleAsset,
  type Send,
  type Track,
  type TrackId,
} from "@/types/project";
import { createEffectInstance, type EffectInstance, type EffectType } from "@/types/effects";
import { barSeconds, type GridResolution } from "@/lib/timing/grid";
import { DEFAULT_PIXELS_PER_SECOND, MIN_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND } from "@/components/daw/Timeline/constants";

/** A bus's id is also a valid EffectTarget - both TrackId and BusId are
 * plain strings (uuids that never collide across the two arrays), so the
 * type union doesn't distinguish them structurally; `mutateInserts` below
 * resolves which one by actually looking it up in `project.tracks` then
 * `project.buses`. */
export type EffectTarget = TrackId | BusId | "master";
/** Which single pane is full-width on mobile - see DawShell. Unused at `md`+,
 * where every pane renders simultaneously. */
export type MobileView = "voz" | "browser" | "timeline" | "mixer" | "effects";
/** Which sub-tab BrowserPanel is showing - lifted out of that component so
 * a track/effect's "Ask AI" button can jump straight to the Assistant tab. */
export type BrowserTab = "projects" | "audio" | "match" | "mix" | "generate" | "assistant";

interface ProjectState {
  project: Project;
  /** Undo/redo history of `project` snapshots. Continuous edits (dragging a
   * fader, typing a name) coalesce into one entry — see `setProject`. */
  past: Project[];
  future: Project[];
  currentTime: number;
  isPlaying: boolean;
  selectedTrackId: TrackId | null;
  isRecording: boolean;
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
   * ClipView, MidiClipView, LoopRegion, AutomationEditor) reads instead of
   * a fixed constant, so the whole timeline always scales together. View
   * state, same category as snapResolution - not undoable, not persisted. */
  pixelsPerSecond: number;
  setPixelsPerSecond: (value: number) => void;
  mobileView: MobileView;
  setMobileView: (view: MobileView) => void;
  /** Which chain the EffectsRackPanel is showing - lifted out of that
   * component so the Mixer's per-strip/master/bus "FX" buttons can jump to
   * it. */
  effectsRackMode: "track" | "master" | "bus";
  setEffectsRackMode: (mode: "track" | "master" | "bus") => void;
  /** Which bus effectsRackMode: "bus" is currently showing - the bus
   * counterpart of selectedTrackId. */
  selectedBusId: BusId | null;
  selectBus: (busId: BusId | null) => void;
  /** Which MIDI clip the piano roll bottom sheet is showing - null when closed. */
  pianoRollClipId: string | null;
  setPianoRollClipId: (clipId: string | null) => void;
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

  addTrack: (name?: string, type?: Track["type"]) => Track;
  removeTrack: (trackId: TrackId) => void;
  /** Removes every track with no audio/MIDI clips in it, in one undo step -
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
  /** Makes one take in a group the active (audible) one, muting its siblings. */
  selectTake: (trackId: TrackId, takeGroupId: string, activeClipId: string) => void;
  splitClipAtPlayhead: () => void;
  /** Duplicates the clip under the playhead on the selected track, placing
   * the copy immediately after the original. */
  duplicateClipAtPlayhead: () => void;
  duplicateClip: (trackId: TrackId, clipId: string) => void;
  selectTrack: (trackId: TrackId | null) => void;

  /** Adds an empty one-bar pattern to the selected instrument track at the
   * playhead and opens it in the piano roll. No-op if the selected track
   * isn't an instrument track. */
  addPatternAtPlayhead: () => void;
  updateMidiClip: (trackId: TrackId, clipId: string, patch: Partial<MidiClip>) => void;
  removeMidiClip: (trackId: TrackId, clipId: string) => void;
  /** Duplicates a MIDI pattern clip (with fresh note ids), placing the copy
   * immediately after the original - the MIDI counterpart to duplicateClip. */
  duplicateMidiClip: (trackId: TrackId, clipId: string) => void;
  addNote: (trackId: TrackId, clipId: string, note: Omit<Note, "id">) => void;
  updateNote: (trackId: TrackId, clipId: string, noteId: string, patch: Partial<Note>) => void;
  removeNote: (trackId: TrackId, clipId: string, noteId: string) => void;
  /** Full replace - used for switching synth/sampler, waveform, or the
   * sampler's assigned sample/root note (all discrete, one-shot changes). */
  setInstrument: (trackId: TrackId, instrument: Instrument) => void;
  /** Merges into the current instrument's shared ADSR fields - used for
   * slider drags, so it coalesces like other continuous edits. */
  updateInstrumentEnvelope: (
    trackId: TrackId,
    patch: Partial<Pick<Instrument, "attack" | "decay" | "sustain" | "release">>
  ) => void;

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
const COUNT_IN_BEATS = 4;

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
    project: createEmptyProject(),
    past: [],
    future: [],
    currentTime: 0,
    isPlaying: false,
    selectedTrackId: null,
    isRecording: false,
    isCountingIn: false,
    countInBeats: null,
    recordingError: null,
    snapResolution: "1/16",
    setSnapResolution: (resolution) => set({ snapResolution: resolution }),
    pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
    setPixelsPerSecond: (value) =>
      set({ pixelsPerSecond: Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, value)) }),
    // "voz" (not "timeline") is the default landing view - per the master
    // direction, the dedicated vocal-take screen is meant to be the
    // product itself, not one more panel a user has to navigate to find.
    mobileView: "voz",
    setMobileView: (view) => set({ mobileView: view }),
    effectsRackMode: "track",
    setEffectsRackMode: (mode) => set({ effectsRackMode: mode }),
    selectedBusId: null,
    selectBus: (busId) => set({ selectedBusId: busId }),
    pianoRollClipId: null,
    setPianoRollClipId: (clipId) => set({ pianoRollClipId: clipId }),
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
      set({ project: previous, past: past.slice(0, -1), future: [project, ...future] });
      getAudioEngine().syncTracks(previous.tracks, previous.buses);
      getAudioEngine().syncMasterInserts(previous.masterInserts);
      lastPushWasCoalescible = false;
    },
    redo: () => {
      const { past, project, future } = get();
      const next = future[0];
      if (!next) return;
      set({ project: next, past: [...past, project], future: future.slice(1) });
      getAudioEngine().syncTracks(next.tracks, next.buses);
      getAudioEngine().syncMasterInserts(next.masterInserts);
      lastPushWasCoalescible = false;
    },

    addTrack: (name, type = "audio") => {
      const project = get().project;
      const defaultName = type === "instrument" ? "Instrumento" : "Pista";
      const track = createTrack(name ?? `${defaultName} ${project.tracks.length + 1}`, project.tracks.length, type);
      setProject(touch({ ...project, tracks: [...project.tracks, track] }), {
        extra: { selectedTrackId: track.id },
      });
      return track;
    },

    removeTrack: (trackId) => {
      const project = get().project;
      const selectedTrackId = get().selectedTrackId === trackId ? null : get().selectedTrackId;
      setProject(touch({ ...project, tracks: project.tracks.filter((t) => t.id !== trackId) }), {
        extra: { selectedTrackId },
      });
    },

    removeEmptyTracks: () => {
      const project = get().project;
      const isEmpty = (t: Track) => t.clips.length === 0 && t.midiClips.length === 0;
      if (!project.tracks.some(isEmpty)) return;
      const remaining = project.tracks.filter((t) => !isEmpty(t));
      const selectedTrackId = get().selectedTrackId;
      const keepSelection = remaining.some((t) => t.id === selectedTrackId);
      setProject(touch({ ...project, tracks: remaining }), {
        extra: { selectedTrackId: keepSelection ? selectedTrackId : null },
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
        (c) => currentTime > c.startTime + MIN_CLIP_SEC && currentTime < c.startTime + c.duration - MIN_CLIP_SEC
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

    selectTrack: (trackId) => set({ selectedTrackId: trackId }),

    addPatternAtPlayhead: () => {
      const { project, selectedTrackId, currentTime } = get();
      const track = project.tracks.find((t) => t.id === selectedTrackId);
      if (!track || track.type !== "instrument") return;
      const clip = createMidiClip(track.id, currentTime, barSeconds(project.bpm, project.timeSignature));
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => (t.id !== track.id ? t : { ...t, midiClips: [...t.midiClips, clip] })),
        }),
        { extra: { pianoRollClipId: clip.id } }
      );
    },

    updateMidiClip: (trackId, clipId, patch) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : { ...t, midiClips: t.midiClips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
          ),
        }),
        { coalesce: true }
      );
    },

    removeMidiClip: (trackId, clipId) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId ? t : { ...t, midiClips: t.midiClips.filter((c) => c.id !== clipId) }
          ),
        })
      );
      if (get().pianoRollClipId === clipId) set({ pianoRollClipId: null });
    },

    duplicateMidiClip: (trackId, clipId) => {
      const project = get().project;
      const track = project.tracks.find((t) => t.id === trackId);
      const clip = track?.midiClips.find((c) => c.id === clipId);
      if (!clip) return;
      const duplicate: MidiClip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: clip.startTime + clip.duration,
        notes: clip.notes.map((n) => ({ ...n, id: crypto.randomUUID() })),
      };
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => (t.id !== trackId ? t : { ...t, midiClips: [...t.midiClips, duplicate] })),
        })
      );
    },

    addNote: (trackId, clipId, note) => {
      const project = get().project;
      const newNote: Note = createNote(note.pitch, note.startTime, note.duration, note.velocity);
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : {
                  ...t,
                  midiClips: t.midiClips.map((c) =>
                    c.id !== clipId ? c : { ...c, notes: [...c.notes, newNote] }
                  ),
                }
          ),
        })
      );
    },

    updateNote: (trackId, clipId, noteId, patch) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : {
                  ...t,
                  midiClips: t.midiClips.map((c) =>
                    c.id !== clipId
                      ? c
                      : { ...c, notes: c.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)) }
                  ),
                }
          ),
        }),
        { coalesce: true }
      );
    },

    removeNote: (trackId, clipId, noteId) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : {
                  ...t,
                  midiClips: t.midiClips.map((c) =>
                    c.id !== clipId ? c : { ...c, notes: c.notes.filter((n) => n.id !== noteId) }
                  ),
                }
          ),
        })
      );
    },

    setInstrument: (trackId, instrument) => {
      const project = get().project;
      setProject(
        touch({ ...project, tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, instrument } : t)) })
      );
    },

    updateInstrumentEnvelope: (trackId, patch) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId || !t.instrument ? t : { ...t, instrument: { ...t.instrument, ...patch } }
          ),
        }),
        { coalesce: true }
      );
    },

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

    setBpm: (bpm) => setProject(touch({ ...get().project, bpm }), { coalesce: true }),
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

      set({ recordingError: null, isCountingIn: true, countInBeats: COUNT_IN_BEATS });
      const completedCountIn = await getAudioEngine().playCountIn(project.bpm, COUNT_IN_BEATS, (remaining) =>
        set({ countInBeats: remaining })
      );
      set({ isCountingIn: false, countInBeats: null });
      // Cancelled mid count-in (cancelRecording()) - don't start capturing.
      // The track that just got auto-armed above stays armed, same as if
      // the user had armed it manually and not hit record yet.
      if (!completedCountIn) return;

      const result = await getAudioEngine().startRecording(
        project.tracks,
        project.loop,
        project.bpm,
        get().currentTime,
        project.buses
      );
      if (!result.ok) {
        set({ recordingError: result.error });
        return;
      }
      set({ isRecording: true, isPlaying: true });
    },

    stopRecording: async () => {
      if (!get().isRecording) return;
      const result = getAudioEngine().stopRecording();
      set({ isRecording: false, isPlaying: false, currentTime: getAudioEngine().getCurrentTime() });
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
      };
      await addSampleAsset(asset);

      // Shift the take earlier by the measured round-trip latency so it
      // lands where the performer actually sang relative to the beat, not
      // where the buffer happened to start filling - see getLatencySec()'s
      // doc comment for what "measured" means here. Clamped at 0: a take
      // recorded from the very start of the timeline has nothing earlier
      // to shift into.
      const latencySec = getAudioEngine().getLatencySec() ?? 0;
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
        set({ isCountingIn: false, countInBeats: null });
        return;
      }
      if (!state.isRecording) return;
      getAudioEngine().discardRecording();
      set({ isRecording: false, isPlaying: false, currentTime: getAudioEngine().getCurrentTime() });
    },

    renameProject: (name) => setProject(touch({ ...get().project, name }), { coalesce: true }),
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
      // Projects saved before masterVolumeDb/instrument tracks/the synth
      // filter existed won't have those fields - default them so old
      // projects don't load silently attenuated, or with tracks/instruments
      // missing fields the rest of the app assumes are always present.
      const normalized: Project = {
        ...project,
        masterVolumeDb: project.masterVolumeDb ?? 0,
        buses: project.buses ?? [],
        tracks: project.tracks.map((t) => ({
          ...t,
          type: t.type ?? "audio",
          midiClips: t.midiClips ?? [],
          instrument: t.instrument
            ? t.instrument.type === "synth"
              ? { ...t.instrument, filterCutoff: t.instrument.filterCutoff ?? 20000, filterResonance: t.instrument.filterResonance ?? 1 }
              : t.instrument
            : null,
          automation: t.automation ?? createDefaultAutomation(),
          monitorMode: t.monitorMode ?? "auto",
          sends: t.sends ?? [],
        })),
      };
      set({
        project: normalized,
        currentTime: 0,
        isPlaying: false,
        selectedTrackId: null,
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
